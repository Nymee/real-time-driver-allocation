import { IsLatitude, IsLongitude, IsString } from 'class-validator';

export class CreateRideDto {
  @IsString()
  riderId: string;

  @IsLatitude()
  pickupLat: number;

  @IsLongitude()
  pickupLng: number;

  @IsLatitude()
  dropoffLat: number;

  @IsLongitude()
  dropoffLng: number;
}
