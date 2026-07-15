import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Ride } from './entities/ride.entity';
import { RideAssignment } from './entities/ride-assignment.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Ride, RideAssignment])],
  exports: [TypeOrmModule],
})
export class RidesModule {}
