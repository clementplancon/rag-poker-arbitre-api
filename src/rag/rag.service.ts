import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EmbeddingsService } from '../embeddings/embeddings.service';
import { QdrantService } from '../qdrant/qdrant.service';
import { Mistral } from '@mistralai/mistralai';
import { Evidence, selectEvidenceBySentence } from './evidence.selector';

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

@Injectable()
export class RagService {
  private chat: Mistral;
  private chatModel: string;

  constructor(
    private readonly cfg: ConfigService,
    private readonly embeddings: EmbeddingsService,
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
    const vec = (await this.embeddings.embedBatch([question]))[0];

    const hits = await this.qd.smartSearch(vec, {
      kRaw: 40,
      kFinal: k,
      format: cls.format,
      phase: cls.phase,
      rescoring: {
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
    opts?: { history?: Array<{ role: 'user' | 'assistant'; content: string }> },
  ) {
    const { classified, contexts } = await this.retrieve(question, k);

    const sys =
      mode === 'debutant'
        ? `Tu es un assistant expert du poker.
Tu réponds en français clair et précis, adapté au niveau du joueur, ici débutant ou amateur donc sois pédagogique et concret.
Ne mentionne pas les documents ni les sources qui te sont données, mais ta réponse doit être exacte et cohérente en s'appuyant sur ceux-ci tout de même.
Utilise un ton courtois, sans jargon complexe ou inutile. Si tu ne trouves pas la réponse dans les extraits de règlements, dis-le honnêtement mais n'invente pas de réponse. Si la question est hors sujet poker, répond poliment que tu es un assistant spécialisé en poker et ne peux pas répondre à cette question. Fais une réponse en 15 lignes maximum.`
        : `Tu es un assistant expert du poker de tournoi.
Tu réponds en français clair et précis, adapté au niveau du joueur, ici un expert ou arbitre donc donne la réponse la plus rigoureuse selon les point de règles qui te seront donnés.
Ne mentionne pas les documents ni les sources qui te sont données, mais ta réponse doit être exacte et cohérente en s'appuyant sur ceux-ci tout de même.
Utilise un ton professionnel. Si tu ne trouves pas la réponse dans les extraits de règlements, dis-le honnêtement mais n'invente pas de réponse. Si la question est hors sujet poker, répond poliment que tu es un assistant spécialisé en poker et ne peux pas répondre à cette question. Fais une réponse en 30 lignes maximum.`;

    const user = `
  Question:
  ${question}
  
Voici des extraits des règlements pertinents :
---
${contexts.join('\n---\n')}
---
  `.trim();

    const res = await this.chat.chat.complete({
      model: this.chatModel,
      messages: [
        {
          role: 'system',
          content: sys,
        },
        {
          role: 'user',
          content: user,
        },
      ],
      temperature: 0.2,
    });

    // 3) Extraction texte robuste
    let text = '';
    const choice: any = res?.choices?.[0];
    const msg = choice?.message;

    if (typeof msg?.content === 'string') {
      text = msg.content;
    } else if (Array.isArray(msg?.content)) {
      // certains SDK renvoient un tableau de fragments
      text = msg.content.map((c: any) => c?.text ?? c ?? '').join('');
    } else if (typeof (res as any)?.output_text === 'string') {
      // compat ancien helper
      text = (res as any).output_text;
    }

    // 4) Usage (tokens) — plusieurs variantes possibles selon versions du SDK
    const usage =
      (res as any)?.usage ?? // { prompt_tokens, completion_tokens, total_tokens }
      (res as any)?.meta?.usage ?? // d’autres libellae possibles
      null;
    console.log('USAGE', usage);

    return { text, usage };
  }
}
