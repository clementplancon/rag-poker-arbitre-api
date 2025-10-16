export type SentenceSpan = { start: number; end: number; text: string };
export function splitToSentences(text: string): SentenceSpan[] {
  const s = text.replace(/\r/g, '');
  const res: SentenceSpan[] = [];
  const re = /[^.!?…]+[.!?…]+|\S+$/g; // simple, robuste
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const seg = m[0].trim();
    if (seg.length)
      res.push({ start: m.index, end: m.index + m[0].length, text: seg });
  }
  if (!res.length && s.trim())
    res.push({ start: 0, end: s.length, text: s.trim() });
  return res;
}

export function windowAround(
  s: string,
  start: number,
  end: number,
  pad = 240,
): { preview: string; relStart: number; relEnd: number } {
  const a = Math.max(0, start - pad);
  const b = Math.min(s.length, end + pad);
  const preview = s.slice(a, b).trim();
  return { preview, relStart: start - a, relEnd: end - a };
}
