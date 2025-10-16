import 'dotenv/config';
import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { chunkByTokens } from '../utils/chunker';
import { countTokens } from '../utils/chunker';
const { PDFParse } = require('pdf-parse');

function parseArgs() {
  const args = process.argv.slice(2);
  const out: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const curr = args[i];
    if (curr.startsWith('--')) {
      if (curr.includes('=')) {
        const [k, v = ''] = curr.slice(2).split('=');
        out[k] = v;
      } else {
        const k = curr.slice(2);
        const v = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : '';
        out[k] = v;
      }
    }
  }
  return out;
}

// util: déduire une "section" (titre/règle) depuis le texte du chunk
function detectSection(t: string): string {
  const lines = t
    .split(/\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
  // ROPTA/TDA patterns fréquents
  const hit =
    lines.find((l) => /^r[èe]gle\s*\d+(:|\s|–|-)/i.test(l)) ||
    lines.find((l) =>
      /^(string|mise|relance|action|p[ée]nalit[é|e]|proc[ée]dure)/i.test(l),
    ) ||
    lines.find((l) => l === l.toUpperCase() && l.length > 8 && l.length < 120); // titre en capitales
  return hit ? hit.replace(/\s+/g, ' ').slice(0, 140) : '';
}

async function extractPages(
  buf: Buffer,
): Promise<{ pages: string[]; info: any }> {
  // v2 : on instancie, on appelle getText(), puis destroy()
  const parser = new PDFParse({ data: buf });
  try {
    const textResult = await parser.getText(); // { text: string, ... }
    const raw = (textResult?.text ?? '').toString();

    // Découpe par saut de page (form feed) si présent, sinon 1 “page”
    const pages = raw
      .split('\f')
      .map((s) => s.replace(/\s+\n/g, '\n').trim())
      .filter((s) => s.length > 0);

    return {
      pages: pages.length ? pages : raw.trim() ? [raw] : [],
      info: { source: 'pdf-parse-v2' },
    };
  } finally {
    await parser.destroy(); // important pour libérer la mémoire
  }
}

function sha256(buf: Buffer): string {
  const h = createHash('sha256');
  h.update(buf);
  return `sha256:${h.digest('hex')}`;
}

// ID numériques déterministes pour Qdrant (compat JS, ≤ 2^53-1)
function fnv1a32(str: string): number {
  let h = 0x811c9dc5; // offset basis
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; // *16777619
  }
  return h >>> 0; // uint32
}

/**
 * Construit un entier unique et stable à partir de (docId, chunkIndex).
 * Schéma : (hash32(docId) << 16) | (chunkIndex & 0xFFFF)
 * -> jusqu'à 65k chunks par doc, plenty pour nos PDFs.
 */
function makePointId(docId: string, chunkIndex: number): number {
  const hi = fnv1a32(docId) & 0xffff_ffff;
  const lo = chunkIndex & 0xffff;
  // on reste < 2^53-1 (safe integer JS)
  return hi * 65536 + lo;
}

async function bootstrap() {
  const args = parseArgs();
  const file = args['file'];
  if (!file) {
    console.error(
      'Usage: npm run ingest -- --file ./docs/TDA-2025.pdf [--doc_id "TDA-2025.pdf"] [--title "Règlement TDA 2025"] [--sectionPrefix ""] [--version "2025-08-30"] [--format "croupier,MTT"] [--phase "deal,preflop"]',
    );
    process.exit(1);
  }
  const docId = args['doc_id'] || file.split('/').pop()!;
  const title = args['title'] || docId;
  const version = args['version'] || new Date().toISOString().slice(0, 10);
  const format = (args['format'] || '').split(',').filter(Boolean);
  const phase = (args['phase'] || '').split(',').filter(Boolean);

  const buf = readFileSync(file);
  const hash = sha256(buf);

  const { pages } = await extractPages(buf);
  console.log(
    '[ingest] pages extracted:',
    pages.length,
    'firstLen=',
    pages[0]?.length ?? 0,
  );
  if (!pages.length) throw new Error('PDF parse error: no pages extracted');

  const chunks = chunkByTokens(pages, { maxTokens: 1100, overlapTokens: 180 });

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
  });
  const cfg = app.get(ConfigService);
  const emb = app.get(EmbeddingsService);
  const qd = app.get(QdrantService);

  await qd.ensureCollection(emb.getDimension());

  // Embeddings par batch raisonnable
  const BATCH = 32;
  let total = 0;

  for (let i = 0; i < chunks.length; i += BATCH) {
    const slice = chunks.slice(i, i + BATCH);
    const sliceTexts = slice.map((c) => c.text);

    // Sanity check tokens local (limite Mistral 8192)
    const tokenCounts = sliceTexts.map((t) => countTokens(t));
    const maxTok = Math.max(...tokenCounts);
    if (maxTok > 7900) {
      // très rare vu notre chunker, mais on sécurise dur
      const idx = tokenCounts.findIndex((n) => n === maxTok);
      throw new Error(
        `Local token check failed: text chunk too long (${maxTok} tokens) at globalIndex=${slice[idx].chunk_index}`,
      );
    }

    const vectors = await emb.embedBatch(sliceTexts);

    if (vectors.length !== slice.length) {
      throw new Error(
        `Embeddings count mismatch: got ${vectors.length}, expected ${slice.length}`,
      );
    }

    const points = slice.map((c, j) => {
      return {
        id: makePointId(docId, c.chunk_index),
        vector: vectors[j],
        payload: {
          text: c.text,
          doc_id: docId,
          title,
          section: detectSection(c.text), // ✅ section renseignée
          page_start: c.page_start,
          page_end: c.page_end,
          format,
          phase,
          version,
          hash,
          chunk_index: c.chunk_index,
        },
      };
    });

    try {
      await qd.upsertPoints(points);
      total += points.length;
      console.log(`Upserted ${total} / ${chunks.length}`);
    } catch (e: any) {
      console.error('[ingest] upsert error:', e?.message || e);
      throw e; // re-propage pour stopper proprement
    }
  }

  console.log(
    `✅ Finished: ${total} chunks to Qdrant collection "${cfg.get('QDRANT_COLLECTION') || 'poker_rules'}"`,
  );
  await app.close();
}

bootstrap().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  console.error('Ingest failed:', msg);
  process.exit(1);
});
