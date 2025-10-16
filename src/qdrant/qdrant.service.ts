import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QdrantClient } from '@qdrant/js-client-rest';

export interface SearchRescore {
  preferFormat?: string[]; // bonus neutres (tags)
  preferPhase?: string[];
  freshness?: boolean; // bonus récent léger
  maxPerDoc?: number; // diversité
}

export type UpsertPoint = {
  id: string | number; // ← avant: number
  vector: number[];
  payload: Record<string, any>;
};

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

  async upsertPoints(points: UpsertPoint[]) {
    try {
      await this.client.upsert(this.collection, {
        wait: true,
        points: points.map((p) => ({
          id: p.id, // ← accepte string | number
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

  async smartSearch(
    vector: number[],
    opts?: {
      kRaw?: number;
      kFinal?: number;
      rescoring?: SearchRescore;
      format?: string[];
      phase?: string[];
    },
  ) {
    const kRaw = opts?.kRaw ?? 40;
    const kFinal = opts?.kFinal ?? 12;

    const must: any[] = [];
    if (opts?.format?.length)
      must.push({ key: 'format', match: { any: opts.format } });
    if (opts?.phase?.length)
      must.push({ key: 'phase', match: { any: opts.phase } });
    const filter = must.length ? { must } : undefined;

    const hits = await this.client.search(this.collection, {
      vector,
      limit: kRaw,
      with_payload: true,
      with_vectors: false,
      filter,
      score_threshold: 0.2,
    } as any);

    // --- Re-scoring NEUTRE (aucun boost par doc) ---
    const r = opts?.rescoring ?? {};
    const maxPerDoc = r.maxPerDoc ?? 3;

    const rescored = hits.map((h: any) => {
      const p = h.payload || {};
      let s = Number(h.score) || 0;

      // Bonus légers non-biaisés (tags/phase/fraîcheur)
      const fmt = Array.isArray(p.format) ? p.format : [];
      const phs = Array.isArray(p.phase) ? p.phase : [];
      const fmtMatches = (r.preferFormat ?? []).filter((f) =>
        fmt.includes(f),
      ).length;
      const phsMatches = (r.preferPhase ?? []).filter((f) =>
        phs.includes(f),
      ).length;
      s += 0.03 * fmtMatches + 0.03 * phsMatches;

      if (r.freshness && typeof p.version === 'string') {
        const y = Number(p.version.slice(0, 4));
        if (!Number.isNaN(y)) s += Math.max(0, y - 2018) * 0.005;
      }

      return { ...h, score: s };
    });

    rescored.sort((a: any, b: any) => b.score - a.score);

    // Diversité : max N par doc
    const taken: any[] = [];
    const perDoc = new Map<string, number>();
    for (const h of rescored) {
      const docId = h.payload?.doc_id || 'unknown';
      const c = perDoc.get(docId) ?? 0;
      if (c >= maxPerDoc) continue;
      perDoc.set(docId, c + 1);
      taken.push(h);
      if (taken.length >= kFinal) break;
    }

    return taken;
  }
}
