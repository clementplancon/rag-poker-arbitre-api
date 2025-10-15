import { encoding_for_model } from '@dqbd/tiktoken';

export interface Chunk {
  text: string;
  page_start: number;
  page_end: number;
  chunk_index: number;
}

export interface ChunkOptions {
  maxTokens?: number; // 1000–1200 recommandé
  overlapTokens?: number; // 150–200 recommandé
}

const enc = encoding_for_model('gpt-3.5-turbo'); // cl100k_base-like

export function countTokens(s: string): number {
  return enc.encode(s).length;
}

/**
 * Coupe une chaîne en fenêtres de tokens de taille maxTokens, avec overlap.
 * Utilisé quand une seule "page" dépasse maxTokens.
 */
function splitTextByTokens(
  text: string,
  maxTokens: number,
  overlap: number,
): string[] {
  const tokens = enc.encode(text);
  if (tokens.length <= maxTokens) return [text];

  const chunks: string[] = [];
  let start = 0;
  while (start < tokens.length) {
    const end = Math.min(tokens.length, start + maxTokens);
    const slice = tokens.slice(start, end);
    const str = enc.decode(slice);
    chunks.push(
      typeof str === 'string'
        ? str
        : new TextDecoder().decode(str as unknown as Uint8Array),
    );
    if (end === tokens.length) break;
    start = Math.max(0, end - overlap);
  }
  return chunks;
}

export function chunkByTokens(
  pages: string[],
  opts: ChunkOptions = {},
): Chunk[] {
  const maxTokens = opts.maxTokens ?? 1100;
  const overlap = opts.overlapTokens ?? 180;

  const chunks: Chunk[] = [];
  let idx = 0;

  for (let i = 0; i < pages.length; i++) {
    const pageText = (pages[i] ?? '').trim();
    if (!pageText) continue;

    // Si une page est trop longue, on la split tout de suite en fenêtres
    const pagePieces = splitTextByTokens(pageText, maxTokens, overlap);

    // Fusionner éventuellement avec la pièce précédente si on veut regrouper plusieurs pages,
    // mais par simplicité/robustesse on émet chaque pièce comme un chunk indépendant.
    for (const piece of pagePieces) {
      chunks.push({
        text: piece,
        page_start: i + 1,
        page_end: i + 1,
        chunk_index: idx++,
      });
    }
  }

  return chunks;
}
