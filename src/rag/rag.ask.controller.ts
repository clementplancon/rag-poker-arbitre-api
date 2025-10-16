import { Controller, Sse, MessageEvent, UseGuards, Req } from '@nestjs/common';
import { Observable } from 'rxjs';
import { RagService } from './rag.service';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { QuotasService } from '../quotas/quotas.service';
import { QuotasGuard } from '../quotas/quota.guard';

function estimateTokens(s: string): number {
  const len = (s || '').length;
  return Math.ceil(len / 4);
}

@Controller('rag')
export class RagAskController {
  constructor(
    private readonly rag: RagService,
    private readonly quotas: QuotasService,
  ) {}

  @UseGuards(JwtAuthGuard, QuotasGuard)
  @Sse('ask')
  sseAsk(@Req() req: any): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      const question = req.query?.q ?? '';
      const mode = (req.query?.mode as 'debutant'|'arbitre') ?? 'debutant';

      (async () => {
        try {
          const { text, usage } = await this.rag.answer(question, mode);

          // 1) push le texte (stream ou tout-en-un selon ton impl)
          subscriber.next({ data: text });

          // 2) consommer le quota (utilise l’usage réel si présent)
          const msgs = 1;
          const toks = usage?.totalTokens ?? usage?.completionTokens ?? 0;
          await this.quotas.consume(req.user.id, msgs, toks);

          // 3) envoyer un meta final pour que le front refresh son badge
          subscriber.next({ type: 'meta', data: JSON.stringify({ usage }) });

          // 4) fin SSE
          subscriber.next({ data: '[DONE]' });
          subscriber.complete();
        } catch (e: any) {
          subscriber.next({ data: `[[ERROR]] ${e?.message ?? 'error'}` });
          subscriber.complete();
        }
      })();
    });
  }
}
