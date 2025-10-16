// quota.entity.ts
import { Entity, Column, PrimaryGeneratedColumn, Index } from 'typeorm';

@Entity()
export class QuotaLog {
  @PrimaryGeneratedColumn() id: number;

  @Index() @Column() userId: number;

  @Index() @Column({ type: 'text' }) date: string; // YYYY-MM-DD

  @Column({ type: 'integer', default: 0 }) messagesUsed: number;

  @Column({ type: 'integer', default: 0 }) tokensUsed: number;
}
