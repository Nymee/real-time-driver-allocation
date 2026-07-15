import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Repository } from 'typeorm';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';
import { Ride } from './entities/ride.entity';
import { RideStatus } from './entities/ride-status.enum';
import { RideAssignment } from './entities/ride-assignment.entity';
import { AssignmentStatus } from './entities/assignment-status.enum';
import { DriversService } from '../drivers/drivers.service';
import { DriverStatus } from '../drivers/entities/driver-status.enum';
import { CreateRideDto } from './dto/create-ride.dto';
import { CHECK_OFFER_TIMEOUT_JOB, OFFER_TIMEOUT_QUEUE, OfferTimeoutJobData } from './offer-timeout.queue';

const OFFER_BATCH_SIZE = 5;
const SEARCH_RADIUS_KM = 5;
const RIDE_WINNER_LOCK_TTL_SECONDS = 3600;

@Injectable()
export class RidesService {
  private readonly offerTimeoutMs: number;
  private readonly maxSearchDurationMs: number;

  constructor(
    @InjectRepository(Ride)
    private readonly ridesRepository: Repository<Ride>,
    @InjectRepository(RideAssignment)
    private readonly assignmentsRepository: Repository<RideAssignment>,
    private readonly driversService: DriversService,
    @InjectQueue(OFFER_TIMEOUT_QUEUE)
    private readonly offerTimeoutQueue: Queue<OfferTimeoutJobData>,
    @Inject(REDIS_CLIENT)
    private readonly redis: Redis,
    configService: ConfigService,
  ) {
    // ConfigService.get<number>() does not actually cast env strings to
    // numbers — the generic is compile-time only — so cast explicitly.
    this.offerTimeoutMs = Number(configService.get('OFFER_TIMEOUT_MS', 10_000));
    this.maxSearchDurationMs = Number(configService.get('MAX_SEARCH_DURATION_MS', 60_000));
  }

  private async getRideOrThrow(id: string): Promise<Ride> {
    const ride = await this.ridesRepository.findOne({ where: { id } });
    if (!ride) {
      throw new NotFoundException(`Ride ${id} not found`);
    }
    return ride;
  }

  async createRide(dto: CreateRideDto) {
    const ride = await this.ridesRepository.save(
      this.ridesRepository.create({
        riderId: dto.riderId,
        pickupLat: dto.pickupLat,
        pickupLng: dto.pickupLng,
        dropoffLat: dto.dropoffLat,
        dropoffLng: dto.dropoffLng,
        status: RideStatus.REQUESTED,
      }),
    );

    return this.offerNextBatch(ride.id);
  }

  /** Creates and offers the next batch of drivers, excluding everyone already
   *  tried for this ride, then schedules the timeout check for this batch. */
  private async offerNextBatch(rideId: string) {
    const ride = await this.getRideOrThrow(rideId);

    const previouslyTried = await this.assignmentsRepository.find({
      where: { rideId },
      select: ['driverId'],
    });
    const excludeDriverIds = previouslyTried.map((a) => a.driverId);

    const nearbyDrivers = await this.driversService.findNearby(
      ride.pickupLat,
      ride.pickupLng,
      SEARCH_RADIUS_KM,
      OFFER_BATCH_SIZE,
      excludeDriverIds,
    );

    ride.status = RideStatus.SEARCHING;

    if (nearbyDrivers.length > 0) {
      const assignments = nearbyDrivers.map((driver) =>
        this.assignmentsRepository.create({
          rideId: ride.id,
          driverId: driver.id,
          status: AssignmentStatus.OFFERED,
        }),
      );
      await this.assignmentsRepository.save(assignments);
      ride.lastOfferedAt = new Date();
    }
    // If zero drivers were found, lastOfferedAt is intentionally left
    // unchanged — no real batch was offered, so nothing should reset the
    // per-batch clock or the stale-job guard below.

    await this.ridesRepository.save(ride);

    const batchOfferedAt = ride.lastOfferedAt ? ride.lastOfferedAt.toISOString() : null;
    await this.offerTimeoutQueue.add(
      CHECK_OFFER_TIMEOUT_JOB,
      { rideId: ride.id, batchOfferedAt },
      { delay: this.offerTimeoutMs },
    );

    return { ride, offeredDrivers: nearbyDrivers };
  }

  /** Invoked by the offer-timeout worker when a batch's window has elapsed. */
  async handleOfferTimeout(rideId: string, batchOfferedAt: string | null): Promise<void> {
    const ride = await this.ridesRepository.findOne({ where: { id: rideId } });
    if (!ride || ride.status !== RideStatus.SEARCHING) {
      return; // already resolved (assigned/cancelled) — nothing to do
    }

    const currentBatchOfferedAt = ride.lastOfferedAt ? ride.lastOfferedAt.toISOString() : null;
    if (currentBatchOfferedAt !== batchOfferedAt) {
      return; // stale/redelivered job from a batch that's since been superseded
    }

    // Expire whatever offers from this batch are still outstanding. Uses the
    // same conditional-on-current-status pattern as accept() — whichever
    // operation actually commits first for a given assignment row wins, so a
    // driver accepting in the instant this runs is never silently dropped.
    await this.assignmentsRepository
      .createQueryBuilder()
      .update(RideAssignment)
      .set({ status: AssignmentStatus.EXPIRED, respondedAt: new Date() })
      .where('rideId = :rideId AND status = :offered', { rideId, offered: AssignmentStatus.OFFERED })
      .execute();

    const elapsedMs = Date.now() - ride.createdAt.getTime();
    if (elapsedMs >= this.maxSearchDurationMs) {
      ride.status = RideStatus.TIMEOUT;
      await this.ridesRepository.save(ride);
      return;
    }

    await this.offerNextBatch(rideId);
  }

  /** Concurrency-safe, idempotent driver acceptance. */
  async acceptRide(rideId: string, driverId: string) {
    const ride = await this.getRideOrThrow(rideId);

    if (ride.status !== RideStatus.SEARCHING) {
      if (ride.status === RideStatus.ASSIGNED && ride.assignedDriverId === driverId) {
        return { ride, outcome: 'ALREADY_ACCEPTED' as const };
      }
      throw new ConflictException(`Ride ${rideId} is not accepting offers (status: ${ride.status})`);
    }

    const winnerKey = `ride:${rideId}:winner`;
    const claimed = await this.redis.set(winnerKey, driverId, 'EX', RIDE_WINNER_LOCK_TTL_SECONDS, 'NX');

    if (claimed !== 'OK') {
      const existingWinner = await this.redis.get(winnerKey);
      if (existingWinner === driverId) {
        const freshRide = await this.getRideOrThrow(rideId);
        return { ride: freshRide, outcome: 'ALREADY_ACCEPTED' as const };
      }
      throw new ConflictException(`Ride ${rideId} was already accepted by another driver`);
    }

    // Won the ride-level lock. Still must confirm THIS driver's own offer is
    // actually live — it may have just been expired by the timeout worker.
    const updateResult = await this.assignmentsRepository
      .createQueryBuilder()
      .update(RideAssignment)
      .set({ status: AssignmentStatus.ACCEPTED, respondedAt: new Date() })
      .where('rideId = :rideId AND driverId = :driverId AND status = :offered', {
        rideId,
        driverId,
        offered: AssignmentStatus.OFFERED,
      })
      .execute();

    if (!updateResult.affected) {
      // Lock won, but the underlying offer was invalid/expired — release the
      // lock so a legitimate winner (this ride's next batch) isn't blocked.
      await this.redis.del(winnerKey);
      throw new ConflictException(`Your offer for ride ${rideId} is no longer valid`);
    }

    ride.status = RideStatus.ASSIGNED;
    ride.assignedDriverId = driverId;
    await this.ridesRepository.save(ride);

    await this.assignmentsRepository
      .createQueryBuilder()
      .update(RideAssignment)
      .set({ status: AssignmentStatus.EXPIRED, respondedAt: new Date() })
      .where('rideId = :rideId AND status = :offered', { rideId, offered: AssignmentStatus.OFFERED })
      .execute();

    await this.driversService.updateStatus(driverId, DriverStatus.BUSY);

    return { ride, outcome: 'ACCEPTED' as const };
  }
}
