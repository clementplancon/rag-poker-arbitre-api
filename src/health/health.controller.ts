import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly cfg: ConfigService,
    private readonly svc: HealthService,
  ) {}

  @Get()
  async getHealth() {
    const qdrantUrl =
      this.cfg.get<string>('QDRANT_URL') || 'http://localhost:6333';
    const mistralUrl =
      this.cfg.get<string>('MISTRAL_API_URL') || 'https://api.mistral.ai';
    const mistralKey = this.cfg.get<string>('MISTRAL_API_KEY');

    const [qdrant, mistral] = await Promise.all([
      this.svc.checkQdrant(qdrantUrl),
      this.svc.checkMistral(mistralUrl, mistralKey),
    ]);

    const status = this.svc.overallStatus([qdrant, mistral]);
    const timestamp = new Date().toISOString();

    if (status === 'ok') {
      // Réponse minimaliste demandée
      return { status: 'ok', timestamp };
    }

    // Si problème, on donne des détails + 503
    throw new HttpException(
      {
        status: 'error',
        timestamp,
        services: { qdrant, mistral },
      },
      HttpStatus.SERVICE_UNAVAILABLE,
    );
  }
}
