import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { verifyPassword } from '../common/password';

@Injectable()
export class AuthService {
  constructor(
    private users: UsersService,
    private jwt: JwtService,
  ) {}

  async signup(email: string, password: string) {
    const existing = await this.users.findByEmail(email);
    if (existing) throw new UnauthorizedException('Email déjà utilisé');
    const user = await this.users.create(
      email,
      password,
      email === process.env.ADMIN_EMAIL ? 'admin' : 'free',
    );
    return this.sign(user);
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !(await verifyPassword(user.password_hash, password))) {
      throw new UnauthorizedException('Identifiants invalides');
    }
    return this.sign(user);
  }

  private sign(user: any) {
    const payload = { sub: user.id, email: user.email, plan: user.plan };
    return {
      access_token: this.jwt.sign(payload),
      user: { id: user.id, email: user.email, plan: user.plan },
    };
  }
}
