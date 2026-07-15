import { IsEnum, IsLatitude, IsLongitude, ValidateIf } from 'class-validator';
import { DriverStatus } from '../entities/driver-status.enum';

export class UpdateStatusDto {
  @IsEnum(DriverStatus)
  status: DriverStatus;

  @ValidateIf((dto: UpdateStatusDto) => dto.lat !== undefined || dto.lng !== undefined)
  @IsLatitude()
  lat?: number;

  @ValidateIf((dto: UpdateStatusDto) => dto.lat !== undefined || dto.lng !== undefined)
  @IsLongitude()
  lng?: number;
}
