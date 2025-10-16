import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity()
@Index(['doc_id', 'version'], { unique: true })
export class DocVersion {
  @PrimaryGeneratedColumn() id: number;

  @Column() doc_id: string;

  @Column() version: string;

  @Column() hash: string;

  @CreateDateColumn() created_at: Date;
}
