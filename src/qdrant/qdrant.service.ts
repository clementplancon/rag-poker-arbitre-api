import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

@Injectable()
export class QdrantService {
  private client: QdrantClient;
  private collection: string;

  constructor(private readonly cfg: ConfigService) {
    const url = this.cfg.get<string>('QDRANT_URL') || 'http://localhost:6333';
    this.collection =
      this.cfg.get<string>('QDRANT_COLLECTION') || 'poker_rules';
    this.client = new QdrantClient({ url });
  }

  async ensureCollection(vectorSize: number) {
    const info = await this.client.getCollections();

    const exists = info.collections?.some((c) => c.name === this.collection);
    if (!exists) {
      await this.client.createCollection(this.collection, {
        vectors: { size: vectorSize, distance: 'Cosine' },
      });
      return;
    }

    // Vérifier la taille actuelle
    const desc = await this.client.getCollection(this.collection);
    // Qdrant renvoie soit un nombre (single vector), soit un objet map pour multi-vector
    const currentSize =
      typeof desc.config?.params?.vectors === 'object' &&
      'size' in (desc.config.params.vectors as any)
        ? (desc.config.params.vectors as any).size
        : (desc.config?.params as any)?.vectors?.size;

    if (Number(currentSize) !== Number(vectorSize)) {
      console.warn(
        `[qdrant] Vector size mismatch: current=${currentSize}, expected=${vectorSize}. Recreating collection "${this.collection}".`,
      );
      await this.client.deleteCollection(this.collection);
      await this.client.createCollection(this.collection, {
        vectors: { size: vectorSize, distance: 'Cosine' },
      });
    }
  }

  async upsertPoints(
    points: Array<{
      id: number;
      vector: number[];
      payload: Record<string, any>;
    }>,
  ) {
    try {
      await this.client.upsert(this.collection, {
        points: points.map((p) => ({
          id: p.id,
          vector: p.vector,
          payload: p.payload,
        })),
      });
    } catch (err: any) {
      const status = err?.status ?? err?.response?.status;
      const body = err?.body ?? err?.response?.data ?? err?.message;
      throw new Error(
        `[qdrant] upsert failed: status=${status} body=${typeof body === 'string' ? body : JSON.stringify(body)}`,
      );
    }
  }
}
