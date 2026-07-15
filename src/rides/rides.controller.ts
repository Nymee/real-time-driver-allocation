import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { RidesService } from './rides.service';
import { CreateRideDto } from './dto/create-ride.dto';
import { AcceptRideDto } from './dto/accept-ride.dto';

@Controller('rides')
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  @Post()
  create(@Body() dto: CreateRideDto) {
    return this.ridesService.createRide(dto);
  }

  @Patch(':id/accept')
  accept(@Param('id') id: string, @Body() dto: AcceptRideDto) {
    return this.ridesService.acceptRide(id, dto.driverId);
  }
}
