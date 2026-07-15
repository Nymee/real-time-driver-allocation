import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { Ride } from './entities/ride.entity';
import { RideAssignment } from './entities/ride-assignment.entity';
import { RidesController } from './rides.controller';
import { RidesService } from './rides.service';
import { OfferTimeoutProcessor } from './offer-timeout.processor';
import { OFFER_TIMEOUT_QUEUE } from './offer-timeout.queue';
import { DriversModule } from '../drivers/drivers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Ride, RideAssignment]),
    BullModule.registerQueue({ name: OFFER_TIMEOUT_QUEUE }),
    DriversModule,
  ],
  controllers: [RidesController],
  providers: [RidesService, OfferTimeoutProcessor],
  exports: [RidesService],
})
export class RidesModule {}
