import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { QuotasService } from './quotas.service';

@Injectable()
export class QuotasGuard implements CanActivate {
  constructor(private readonly quotas: QuotasService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) return false;
    await this.quotas.assertAllowed(user.id); // throws 429 si dépassé
    return true;
  }
}
