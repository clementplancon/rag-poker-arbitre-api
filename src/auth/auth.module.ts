import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { AuthController } from './auth.controller';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt.guard';

function parseExpiresToSeconds(v?: string): number {
  if (!v) return 60 * 60 * 24 * 7; // 7 jours par défaut
  const m = /^(\d+)([smhd])?$/.exec(v.trim());
  if (!m) return Number(v) || 60 * 60 * 24 * 7;
  const n = Number(m[1]);
  const unit = m[2] || 's';
  const mult =
    unit === 's' ? 1 : unit === 'm' ? 60 : unit === 'h' ? 3600 : 86400;
  return n * mult;
}

@Module({
  imports: [
    ConfigModule,
    TypeOrmModule.forFeature([User]),
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (cfg: ConfigService) => ({
        secret: cfg.get<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: parseExpiresToSeconds(
            cfg.get<string>('JWT_EXPIRES_IN') || '7d',
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [UsersService, AuthService, JwtStrategy, JwtAuthGuard],
  exports: [AuthService, UsersService, JwtAuthGuard],
})
export class AuthModule {}
