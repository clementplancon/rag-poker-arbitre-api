import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, Plan } from './user.entity';
import { hashPassword } from '../common/password';

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private repo: Repository<User>) {}

  async findByEmail(email: string) {
    return this.repo.findOne({ where: { email } });
  }

  async create(email: string, password: string, plan: Plan = 'free') {
    const password_hash = await hashPassword(password);
    const user = this.repo.create({ email, password_hash, plan });
    return this.repo.save(user);
  }
}
