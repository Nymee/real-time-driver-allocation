import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DriversService } from './drivers.service';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateLocationDto } from './dto/update-location.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { FindNearbyQueryDto } from './dto/find-nearby.dto';

@Controller('drivers')
export class DriversController {
  constructor(private readonly driversService: DriversService) {}

  @Post()
  create(@Body() dto: CreateDriverDto) {
    return this.driversService.create(dto);
  }

  @Get('nearby')
  findNearby(@Query() query: FindNearbyQueryDto) {
    return this.driversService.findNearby(query.lat, query.lng, query.radiusKm, query.limit);
  }

  @Patch(':id/location')
  updateLocation(@Param('id') id: string, @Body() dto: UpdateLocationDto) {
    return this.driversService.updateLocation(id, dto.lat, dto.lng);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateStatusDto) {
    return this.driversService.updateStatus(id, dto.status, dto.lat, dto.lng);
  }
}
