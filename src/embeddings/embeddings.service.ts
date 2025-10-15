import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Mistral } from '@mistralai/mistralai';

@Injectable()
export class EmbeddingsService {
  private provider: 'mistral';
  private mistral?: Mistral;
  private model: string;
  private dim: number;

  constructor(private readonly cfg: ConfigService) {
    this.provider = (this.cfg.get<string>('EMBEDDINGS_PROVIDER') ||
      'mistral') as any;
    // ✅ Provider par défaut
    this.mistral = new Mistral({
      apiKey: this.cfg.get<string>('MISTRAL_API_KEY'),
    });
    this.model =
      this.cfg.get<string>('MISTRAL_EMBEDDING_MODEL') || 'mistral-embed';
    this.dim = Number(this.cfg.get<string>('MISTRAL_EMBEDDING_DIM') || 1024);
  }

  getDimension(): number {
    return this.dim;
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    const inputs = texts
      .map((t) => (t ?? '').trim())
      .filter((t) => t.length > 0);
    if (inputs.length === 0) return [];

    try {
      const res = await this.mistral!.embeddings.create({
        model: this.model, // ex: "mistral-embed"
        inputs, // ✅ Mistral attend "inputs"
      });
      return res.data.map((d: any) => d.embedding as number[]);
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      const body = err?.body ?? err?.response?.data ?? err?.message;
      throw new Error(
        `Mistral embeddings error: status=${status} body=${typeof body === 'string' ? body : JSON.stringify(body)}`,
      );
    }
  }
}
