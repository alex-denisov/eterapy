/**
 * B750 — ПРОДОЛЖЕНИЕ ПОСТА В THREADS — ЦЕПОЧКА ОТВЕТОВ.
 *
 * Threads принимает не более 500 символов на одну запись. Прогноз под «байтовым»
 * постом (4–6 предложений) в одну запись не помещался, API отвечал «Param text
 * must be at most 500 characters long», и пост выходил без продолжения.
 *
 * Текст режется по границам предложений; каждая следующая часть отвечает на
 * предыдущую, так что читатель видит одну ветку.
 */

/** Предел Threads — 500; запас на возможные суррогатные пары и пробелы. */
export const THREADS_TEXT_LIMIT = 480;

/** Режет слишком длинный «токен» (слово без пробелов) по символам Unicode, а не по UTF-16. */
function chunkToken(token: string, limit: number): string[] {
  const symbols = Array.from(token);
  const chunks: string[] = [];
  for (let i = 0; i < symbols.length; i += limit) chunks.push(symbols.slice(i, i + limit).join(""));
  return chunks;
}

function splitLongSentence(sentence: string, limit: number): string[] {
  const parts: string[] = [];
  let current = "";
  for (const word of sentence.split(/\s+/).filter(Boolean)) {
    const pieces = word.length > limit ? chunkToken(word, limit) : [word];
    for (const piece of pieces) {
      const next = current ? `${current} ${piece}` : piece;
      if (next.length <= limit) {
        current = next;
      } else {
        if (current) parts.push(current);
        current = piece;
      }
    }
  }
  if (current) parts.push(current);
  return parts;
}

/**
 * Граница предложения — знак, ЗА КОТОРЫМ идёт пробел или конец строки: точка
 * внутри ссылки (`eterapy.com`) или числа (`3.5`) границей не является.
 * Абзацы (`\n\n`) сохраняются как разделитель внутри части.
 */
export function splitThreadsChain(text: string, limit: number = THREADS_TEXT_LIMIT): string[] {
  const clean = text.trim();
  if (!clean) return [];
  if (clean.length <= limit) return [clean];

  const units: Array<{ text: string; separator: string }> = [];
  for (const paragraph of clean.split(/\n{2,}/)) {
    const sentences = paragraph.split(/(?<=[.!?…])\s+/).map((s) => s.trim()).filter(Boolean);
    sentences.forEach((sentence, index) => {
      const pieces = sentence.length > limit ? splitLongSentence(sentence, limit) : [sentence];
      pieces.forEach((piece, pieceIndex) => {
        const first = index === 0 && pieceIndex === 0;
        units.push({ text: piece, separator: first && units.length > 0 ? "\n\n" : " " });
      });
    });
  }

  const parts: string[] = [];
  let current = "";
  for (const unit of units) {
    const next = current ? `${current}${unit.separator}${unit.text}` : unit.text;
    if (next.length <= limit) {
      current = next;
    } else {
      if (current) parts.push(current);
      current = unit.text;
    }
  }
  if (current) parts.push(current);
  return parts;
}
