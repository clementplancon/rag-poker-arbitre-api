import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { QuotasService } from './quotas.service';
import { JwtAuthGuard } from '../auth/jwt.guard';

@Controller('quotas')
@UseGuards(JwtAuthGuard)
export class QuotasController {
  constructor(private readonly quotas: QuotasService) {}

  @Get('status')
  async status(@Req() req: any) {
    return this.quotas.status(req.user.id);
  }
}
