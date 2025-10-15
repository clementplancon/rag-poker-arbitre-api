import { Body, Controller, Post } from '@nestjs/common';
import { RagService } from './rag.service';

@Controller('rag')
export class RagRetrieveController {
  constructor(private readonly rag: RagService) {}

  @Post('retrieve')
  async postRetrieve(@Body() body: { question: string; k?: number }) {
    const q = body?.question?.trim();
    const k = Number(body?.k ?? 12);
    if (!q) return { contexts: [], classified: { format: [], phase: [] } };
    return this.rag.retrieve(q, k);
  }
}
