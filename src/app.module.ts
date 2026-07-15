import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './redis/redis.module';
import { DriversModule } from './drivers/drivers.module';
import { RidesModule } from './rides/rides.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('POSTGRES_HOST', 'localhost'),
        port: configService.get<number>('POSTGRES_PORT', 5432),
        username: configService.get<string>('POSTGRES_USER', 'postgres'),
        password: configService.get<string>('POSTGRES_PASSWORD', 'postgres'),
        database: configService.get<string>('POSTGRES_DB', 'driver_allocation'),
        autoLoadEntities: true,
        synchronize: configService.get<string>('NODE_ENV', 'development') !== 'production',
      }),
    }),
    RedisModule,
    DriversModule,
    RidesModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
