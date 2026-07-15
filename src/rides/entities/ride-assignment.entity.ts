import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { AssignmentStatus } from './assignment-status.enum';

@Entity()
@Unique(['rideId', 'driverId'])
export class RideAssignment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  rideId: string;

  @Column('uuid')
  driverId: string;

  @Column({ type: 'enum', enum: AssignmentStatus, default: AssignmentStatus.OFFERED })
  status: AssignmentStatus;

  @CreateDateColumn({ type: 'timestamptz' })
  offeredAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  respondedAt: Date | null;
}
