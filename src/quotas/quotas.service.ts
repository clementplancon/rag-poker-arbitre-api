import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { QuotaLog } from './quota.entity';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class QuotasService {
  constructor(
    @InjectRepository(QuotaLog) private readonly qrepo: Repository<QuotaLog>,
    private readonly cfg: ConfigService,
  ) {}

  private todayKey(): string {
    return new Date().toISOString().slice(0, 10);
  }

  async assertAllowed(userId: number) {
    // récup plan/limits — si tu stockes le plan en DB, charge-le ici
    const plan = 'free'; // TODO: lire user.plan
    if (plan !== 'free') return true;

    const maxMsgs = Number(this.cfg.get('FREE_MAX_MSGS_PER_DAY') ?? 30);
    const maxToks = Number(this.cfg.get('FREE_MAX_TOKENS_PER_DAY') ?? 50000);

    const date = this.todayKey();
    const log = await this.qrepo.findOne({ where: { userId, date } });
    const usedMsgs = log?.messagesUsed ?? 0;
    const usedToks = log?.tokensUsed ?? 0;

    if (usedMsgs >= maxMsgs) {
      throw new HttpException(
        {
          error: 'quota_exceeded',
          scope: 'messages',
          message: 'Daily message quota exceeded',
        },
        HttpStatus.TOO_MANY_REQUESTS, // 429
      );
    }

    if (usedToks >= maxToks) {
      throw new HttpException(
        {
          error: 'quota_exceeded',
          scope: 'tokens',
          message: 'Daily token quota exceeded',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  async consume(userId: number, messages: number, tokens: number) {
    const date = this.todayKey();
    let log = await this.qrepo.findOne({ where: { userId, date } });
    if (!log) {
      log = this.qrepo.create({ userId, date, messagesUsed: 0, tokensUsed: 0 });
    }
    log.messagesUsed += messages;
    log.tokensUsed += tokens;
    await this.qrepo.save(log);
  }

  async status(userId: number) {
    const plan = 'free'; // TODO: lire user.plan
    const maxMsgs =
      plan === 'free'
        ? Number(this.cfg.get('FREE_MAX_MSGS_PER_DAY') ?? 30)
        : 999999;
    const maxToks =
      plan === 'free'
        ? Number(this.cfg.get('FREE_MAX_TOKENS_PER_DAY') ?? 50000)
        : 999999999;

    const date = this.todayKey();
    const log = await this.qrepo.findOne({ where: { userId, date } });
    const usedMsgs = log?.messagesUsed ?? 0;
    const usedToks = log?.tokensUsed ?? 0;

    return {
      plan,
      date,
      used: { messages: usedMsgs, tokens: usedToks },
      limits: { messages: maxMsgs, tokens: maxToks },
      remaining: {
        messages: Math.max(0, maxMsgs - usedMsgs),
        tokens: Math.max(0, maxToks - usedToks),
      },
    };
  }
}
