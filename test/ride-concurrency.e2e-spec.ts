import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Ride } from '../src/rides/entities/ride.entity';
import { RideStatus } from '../src/rides/entities/ride-status.enum';
import { RideAssignment } from '../src/rides/entities/ride-assignment.entity';
import { AssignmentStatus } from '../src/rides/entities/assignment-status.enum';

/**
 * Proves the core concurrency guarantee: when many drivers accept the same
 * ride at the same instant, exactly one succeeds and the rest are cleanly
 * rejected — no double-assignment, no crash. Runs against the real
 * Postgres + Redis from docker-compose, exercising the actual HTTP layer
 * (not calling the service in-process) so the race is genuine.
 */
describe('Ride acceptance concurrency (e2e)', () => {
  let app: INestApplication<App>;
  let server: App;
  let rideRepository: Repository<Ride>;
  let assignmentRepository: Repository<RideAssignment>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    server = app.getHttpServer();

    rideRepository = moduleFixture.get(getRepositoryToken(Ride));
    assignmentRepository = moduleFixture.get(getRepositoryToken(RideAssignment));
  });

  afterAll(async () => {
    await app.close();
  });

  it('assigns exactly one driver when multiple drivers accept simultaneously', async () => {
    const DRIVER_COUNT = 8;
    const pickup = { lat: 12.9716, lng: 77.5946 };
    const runId = Date.now();

    const driverIds: string[] = [];
    for (let i = 0; i < DRIVER_COUNT; i++) {
      const createRes = await request(server)
        .post('/drivers')
        .send({ name: `ConcurrencyTestDriver${i}`, phone: `+1${runId}${i}` })
        .expect(201);
      const driverId: string = createRes.body.id;

      await request(server)
        .patch(`/drivers/${driverId}/status`)
        .send({ status: 'AVAILABLE', lat: pickup.lat + i * 0.0005, lng: pickup.lng })
        .expect(200);

      driverIds.push(driverId);
    }

    const rideRes = await request(server)
      .post('/rides')
      .send({
        riderId: `concurrency-test-rider-${runId}`,
        pickupLat: pickup.lat,
        pickupLng: pickup.lng,
        dropoffLat: pickup.lat + 0.05,
        dropoffLng: pickup.lng + 0.05,
      })
      .expect(201);

    const rideId: string = rideRes.body.ride.id;
    const offeredDriverIds: string[] = rideRes.body.offeredDrivers.map((d: { id: string }) => d.id);

    // Need at least two racers for this test to actually prove anything.
    expect(offeredDriverIds.length).toBeGreaterThanOrEqual(2);

    // Fire every offered driver's accept call at the same instant.
    const responses = await Promise.all(
      offeredDriverIds.map((driverId) => request(server).patch(`/rides/${rideId}/accept`).send({ driverId })),
    );

    const succeeded = responses.filter((r) => r.status === 200 && r.body.outcome === 'ACCEPTED');
    const rejected = responses.filter((r) => r.status === 409);

    expect(succeeded).toHaveLength(1);
    expect(rejected).toHaveLength(offeredDriverIds.length - 1);

    const winnerId: string = succeeded[0].body.ride.assignedDriverId;
    expect(offeredDriverIds).toContain(winnerId);

    // Confirm the database agrees: ride ASSIGNED to the winner, and exactly
    // one ACCEPTED assignment row exists for this ride.
    const ride = await rideRepository.findOne({ where: { id: rideId } });
    expect(ride?.status).toBe(RideStatus.ASSIGNED);
    expect(ride?.assignedDriverId).toBe(winnerId);

    const assignments = await assignmentRepository.find({ where: { rideId } });
    const acceptedAssignments = assignments.filter((a) => a.status === AssignmentStatus.ACCEPTED);
    expect(acceptedAssignments).toHaveLength(1);
    expect(acceptedAssignments[0].driverId).toBe(winnerId);
  }, 30_000);
});
