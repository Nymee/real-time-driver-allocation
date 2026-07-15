import { IsOptional, IsString } from 'class-validator';

export class CreateDriverDto {
  @IsString()
  name: string;

  @IsString()
  phone: string;

  @IsOptional()
  @IsString()
  vehicleNumber?: string;
}
