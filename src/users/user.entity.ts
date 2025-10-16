import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type Plan = 'free' | 'pro' | 'admin';

@Entity()
export class User {
  @PrimaryGeneratedColumn() id: number;

  @Index({ unique: true })
  @Column()
  email: string;

  @Column() password_hash: string;

  @Column({ type: 'text', default: 'free' }) plan: Plan;

  @CreateDateColumn() created_at: Date;
}
