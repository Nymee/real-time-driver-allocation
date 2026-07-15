import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Driver } from './entities/driver.entity';
import { DriverStatus } from './entities/driver-status.enum';
import { GeoService } from './geo.service';
import { CreateDriverDto } from './dto/create-driver.dto';

@Injectable()
export class DriversService {
  constructor(
    @InjectRepository(Driver)
    private readonly driversRepository: Repository<Driver>,
    private readonly geoService: GeoService,
  ) {}

  create(dto: CreateDriverDto): Promise<Driver> {
    const driver = this.driversRepository.create(dto);
    return this.driversRepository.save(driver);
  }

  private async getOrThrow(id: string): Promise<Driver> {
    const driver = await this.driversRepository.findOne({ where: { id } });
    if (!driver) {
      throw new NotFoundException(`Driver ${id} not found`);
    }
    return driver;
  }

  async updateLocation(id: string, lat: number, lng: number): Promise<Driver> {
    const driver = await this.getOrThrow(id);
    await this.geoService.saveLastKnownLocation(id, lat, lng);
    if (driver.status === DriverStatus.AVAILABLE) {
      await this.geoService.upsertLocation(id, lat, lng);
    }
    return driver;
  }

  async updateStatus(id: string, status: DriverStatus, lat?: number, lng?: number): Promise<Driver> {
    const driver = await this.getOrThrow(id);
    driver.status = status;
    await this.driversRepository.save(driver);

    if (lat !== undefined && lng !== undefined) {
      await this.geoService.saveLastKnownLocation(id, lat, lng);
    }

    if (status === DriverStatus.AVAILABLE) {
      const location = lat !== undefined && lng !== undefined ? { lat, lng } : await this.geoService.getLastKnownLocation(id);
      if (location) {
        await this.geoService.upsertLocation(id, location.lat, location.lng);
      }
    } else {
      await this.geoService.removeDriver(id);
    }

    return driver;
  }

  async findNearby(lat: number, lng: number, radiusKm: number, limit: number, excludeDriverIds: string[] = []) {
    const nearby = await this.geoService.findNearby(lat, lng, radiusKm, limit, excludeDriverIds);
    if (nearby.length === 0) {
      return [];
    }

    const drivers = await this.driversRepository.findBy({
      id: In(nearby.map((n) => n.driverId)),
    });
    const driversById = new Map(drivers.map((driver) => [driver.id, driver]));

    return nearby
      .map((n) => {
        const driver = driversById.get(n.driverId);
        return driver ? { ...driver, distanceKm: n.distanceKm } : null;
      })
      .filter((entry): entry is Driver & { distanceKm: number } => entry !== null);
  }
}
