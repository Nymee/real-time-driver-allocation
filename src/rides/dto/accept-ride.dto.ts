import { IsString } from 'class-validator';

export class AcceptRideDto {
  @IsString()
  driverId: string;
}
