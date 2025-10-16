import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QuotaLog } from './quota.entity';
import { QuotasService } from './quotas.service';
import { QuotasController } from './quotas.controller';
import { QuotasGuard } from './quota.guard';

@Module({
  imports: [TypeOrmModule.forFeature([QuotaLog])],
  providers: [QuotasService, QuotasGuard],
  exports: [QuotasService, QuotasGuard],
  controllers: [QuotasController],
})
export class QuotasModule {}
