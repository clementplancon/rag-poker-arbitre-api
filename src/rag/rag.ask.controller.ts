import { Controller, Get, Query, Sse } from '@nestjs/common';
import { RagService } from './rag.service';
import { Observable } from 'rxjs';

@Controller('rag')
export class RagAskController {
  constructor(private readonly rag: RagService) {}

  @Sse('ask')
  sseAsk(
    @Query('q') q: string,
    @Query('mode') mode: 'debutant' | 'arbitre' = 'debutant',
  ): Observable<MessageEvent> {
    return new Observable((subscriber) => {
      (async () => {
        try {
          if (!q || !q.trim()) {
            subscriber.next({ data: 'Veuillez poser une question.' } as any);
            subscriber.complete();
            return;
          }
          const { text } = await this.rag.answer(q.trim(), mode);
          const parts = text.match(/[\s\S]{1,600}/g) || [text];
          for (const part of parts) subscriber.next({ data: part } as any);
          subscriber.complete();
        } catch (e: any) {
          subscriber.next({ data: `Erreur: ${e?.message || e}` } as any);
          subscriber.complete();
        }
      })();
      // teardown optionnel
      return () => {};
    });
  }
}
