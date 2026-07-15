import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsPositive, Max } from 'class-validator';

export class FindNearbyQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  radiusKm: number = 5;

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Max(50)
  limit: number = 10;
}
