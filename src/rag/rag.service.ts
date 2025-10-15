import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { Mistral } from '@mistralai/mistralai';

type Classified = { format: string[]; phase: string[] };

function getCompletionText(res: any): string {
  const c = res?.choices?.[0]?.message?.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c))
    return c
      .map((seg: any) => (typeof seg === 'string' ? seg : (seg?.text ?? '')))
      .join('');
  return '';
}

// “Doc hints” souples: on détecte des mentions et on applique un BOOST (pas de filtre dur)
function inferSoftDocBoosts(q: string): Record<string, number> {
  const text = q.toLowerCase();
  const boosts: Record<string, number> = {};
  if (/ropta/.test(text)) boosts['ROPTA-2025-02.pdf'] = 1.25;
  if (/\btda\b/.test(text) || /tournament directors/.test(text))
    boosts['reglement-et-legislation-poker.pdf'] = 1.15;
  return boosts;
}

@Injectable()
export class RagService {
  private chat: Mistral;
  private chatModel: string;

  constructor(
    private readonly cfg: ConfigService,
    private readonly emb: EmbeddingsService,
    private readonly qd: QdrantService,
  ) {
    this.chat = new Mistral({
      apiKey: this.cfg.get<string>('MISTRAL_API_KEY'),
    });
    this.chatModel =
      this.cfg.get<string>('MISTRAL_CHAT_MODEL') || 'mistral-small-latest';
  }

  private async classify(question: string): Promise<Classified> {
    const sys = `Catégorise la question poker en JSON compact:
{"format": ["associatif"|"croupier"|"cash"|"sng"|"home"...?],
 "phase": ["deal"|"preflop"|"postflop"|"showdown"|"penalties"...?]}
Réponds UNIQUEMENT ce JSON, sans commentaire. Si doute, liste vide.`;

    const res = await this.chat.chat.complete({
      model: this.chatModel,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: question },
      ],
      temperature: 0,
    });

    try {
      const txt = getCompletionText(res).trim() || '{}';
      const obj = JSON.parse(txt);
      return {
        format: Array.isArray(obj.format) ? obj.format.slice(0, 5) : [],
        phase: Array.isArray(obj.phase) ? obj.phase.slice(0, 5) : [],
      };
    } catch {
      return { format: [], phase: [] };
    }
  }

  async retrieve(question: string, k = 12) {
    const cls = await this.classify(question);
    const vec = (await this.emb.embedBatch([question]))[0];

    // Boosts souples : jamais exclusifs
    const docBoosts = inferSoftDocBoosts(question);

    const hits = await this.qd.smartSearch(vec, {
      kRaw: 40,
      kFinal: k,
      format: cls.format,
      phase: cls.phase,
      boosts: {
        docBoosts,
        preferFormat: cls.format,
        preferPhase: cls.phase,
        freshness: true,
        maxPerDoc: 3,
      },
    });

    const contexts = hits.map((h: any) => {
      const p = h.payload || {};
      return {
        score: h.score,
        text: p.text,
        doc_id: p.doc_id,
        title: p.title,
        section: p.section,
        page_start: p.page_start,
        page_end: p.page_end,
        version: p.version,
        chunk_index: p.chunk_index,
      };
    });

    return { classified: cls, contexts };
  }

  async answer(
    question: string,
    mode: 'debutant' | 'arbitre' = 'debutant',
    k = 12,
  ) {
    const { classified, contexts } = await this.retrieve(question, k);

    // On garde la diversité obtenue par smartSearch, mais on tronque à k.
    const used = contexts.slice(0, k);

    const citations = used
      .map(
        (c, i) =>
          `[${i + 1}] Doc: ${c.doc_id}, §${c.section || '-'}, p.${c.page_start}–${c.page_end}, v.${c.version}`,
      )
      .join('\n');
    const contextText = used
      .map((c, i) => `[#${i + 1}] (${c.doc_id}) ${c.text}`)
      .join('\n\n');

    const sys =
      mode === 'debutant'
        ? `Règles strictes:
- Ne pas inventer.
- Réponds en 4–8 lignes, français simple.
- Si plusieurs règlements sont pertinents, structure la réponse par document (ex: ROPTA, TDA) et indique les différences éventuelles.
- Utilise la version la plus récente indiquée dans les contextes.
- Donne 2–4 citations en fin.`
        : `Règles strictes (Arbitre):
- Ne pas inventer. Réponse concise et structurée.
- Si plusieurs règlements sont pertinents, compare-les brièvement, sections séparées par document.
- Toujours citer précisément (Doc, section, pages, version), sans mélanger les docs.`;

    const user = `
Question: ${question}

Catégorisation:
format=${JSON.stringify(classified.format)} phase=${JSON.stringify(classified.phase)}

CONTEXTES:
${contextText}

Citations (à utiliser en fin de réponse):
${citations}
`.trim();

    const res = await this.chat.chat.complete({
      model: this.chatModel,
      temperature: 0.2,
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: user },
      ],
    });

    const text = getCompletionText(res).trim();
    return { text, contexts: used, classified };
  }
}
