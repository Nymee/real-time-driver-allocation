import { Inject, Injectable } from '@nestjs/common';
import type Redis from 'ioredis';
import { REDIS_CLIENT } from '../redis/redis.module';

export interface NearbyDriver {
  driverId: string;
  distanceKm: number;
}

export interface LatLng {
  lat: number;
  lng: number;
}

const AVAILABLE_DRIVERS_KEY = 'drivers:geo:available';
const locationKey = (driverId: string) => `driver:location:${driverId}`;

@Injectable()
export class GeoService {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async upsertLocation(driverId: string, lat: number, lng: number): Promise<void> {
    await this.redis.geoadd(AVAILABLE_DRIVERS_KEY, lng, lat, driverId);
  }

  async removeDriver(driverId: string): Promise<void> {
    await this.redis.zrem(AVAILABLE_DRIVERS_KEY, driverId);
  }

  async saveLastKnownLocation(driverId: string, lat: number, lng: number): Promise<void> {
    await this.redis.hset(locationKey(driverId), { lat: lat.toString(), lng: lng.toString() });
  }

  async getLastKnownLocation(driverId: string): Promise<LatLng | null> {
    const result = await this.redis.hgetall(locationKey(driverId));
    if (!result.lat || !result.lng) {
      return null;
    }
    return { lat: parseFloat(result.lat), lng: parseFloat(result.lng) };
  }

  async findNearby(lat: number, lng: number, radiusKm: number, limit: number): Promise<NearbyDriver[]> {
    const results = (await this.redis.geosearch(
      AVAILABLE_DRIVERS_KEY,
      'FROMLONLAT',
      lng,
      lat,
      'BYRADIUS',
      radiusKm,
      'km',
      'ASC',
      'COUNT',
      limit,
      'WITHDIST',
    )) as [string, string][];

    return results.map(([driverId, distance]) => ({
      driverId,
      distanceKm: parseFloat(distance),
    }));
  }
}
