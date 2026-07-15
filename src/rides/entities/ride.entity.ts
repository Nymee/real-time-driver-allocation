import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { RideStatus } from './ride-status.enum';

@Entity()
export class Ride {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  riderId: string;

  @Column('double precision')
  pickupLat: number;

  @Column('double precision')
  pickupLng: number;

  @Column('double precision')
  dropoffLat: number;

  @Column('double precision')
  dropoffLng: number;

  @Column({ type: 'enum', enum: RideStatus, default: RideStatus.REQUESTED })
  status: RideStatus;

  @Column({ type: 'uuid', nullable: true })
  assignedDriverId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastOfferedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
