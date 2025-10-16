import { EmbeddingsService } from '../embeddings/embeddings.service';
import { splitToSentences, windowAround } from '../utils/sentences';

export type Context = {
  score: number;
  text: string;
  doc_id: string;
  title: string;
  section: string;
  page_start: number;
  page_end: number;
  version: string;
  chunk_index: number;
};

export type Evidence = Context & {
  sent_text: string;
  abs_start: number;
  abs_end: number;
  preview: string; // fenêtré pour l’UI
  rel_start: number; // offsets dans preview (utile si on veut surligner côté front)
  rel_end: number;
};

// Sélectionne des phrases “évidence” par similarité embeddings (question ↔ phrases)
export async function selectEvidenceBySentence(
  emb: EmbeddingsService,
  question: string,
  contexts: Context[],
  maxPerDoc = 2,
  limitDocs = 6,
): Promise<Evidence[]> {
  const qVec = (await emb.embedBatch([question]))[0];
  const evs: Evidence[] = [];

  for (const ctx of contexts.slice(0, limitDocs)) {
    const sents = splitToSentences(ctx.text);
    if (!sents.length) continue;

    const sentVecs = await emb.embedBatch(sents.map((s) => s.text));
    const scored = sents
      .map((s, i) => ({
        s,
        sim: cosine(qVec, sentVecs[i]),
      }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, maxPerDoc);

    for (const top of scored) {
      const { preview, relStart, relEnd } = windowAround(
        ctx.text,
        top.s.start,
        top.s.end,
        280,
      );
      evs.push({
        ...ctx,
        sent_text: top.s.text,
        abs_start: top.s.start,
        abs_end: top.s.end,
        preview,
        rel_start: relStart,
        rel_end: relEnd,
      });
    }
  }

  // garder 6–8 evidences maximum
  return evs.slice(0, 8);
}

// cosine sans dépendances externes
function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i],
      y = b[i] || 0;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) + 1e-9);
}
