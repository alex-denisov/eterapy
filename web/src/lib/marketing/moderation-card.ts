/**
 * B773 — карточка утверждения показывает пост ЦЕЛИКОМ.
 *
 * Жалоба владельца 2026-10-13: у поста с продолжением (пост + ответы под ним)
 * на карточке был виден только первый кусок — части лежат в `notes.replyText` и в
 * текст карточки не попадали. Владелец утверждал то, чего не видел. Теперь части
 * входят в карточку, а сообщение длиннее предела Telegram уходит несколькими
 * сообщениями: кнопки — под последним, чтобы они стояли под всем текстом.
 */

import { splitThreadsChain } from "@/lib/marketing/threads-chain";

/** Предел Telegram — 4096 знаков; запас под теги разметки. */
export const TELEGRAM_CARD_LIMIT = 3800;

const escapeHtml = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Части продолжения поста, как они выйдут в Threads (те же границы, что у публикации). */
export function replyPartsOf(notes: string | null | undefined): string[] {
  if (!notes) return [];
  try {
    const parsed = JSON.parse(notes) as { replyText?: unknown };
    return typeof parsed.replyText === "string" ? splitThreadsChain(parsed.replyText) : [];
  } catch {
    return [];
  }
}

/** Блок «продолжение» для карточки: каждая часть отдельно, с номером. */
export function partsBlock(parts: readonly string[]): string {
  if (parts.length === 0) return "";
  return parts
    .map((part, index) => `<b>Продолжение ${index + 1} из ${parts.length} (ответ на свой пост):</b>\n${escapeHtml(part)}`)
    .join("\n\n");
}

/** Строка длиннее предела режется по знакам; сущность `&amp;` не рвётся пополам. */
function hardSplit(line: string, limit: number): string[] {
  const pieces: string[] = [];
  let rest = line;
  while (rest.length > limit) {
    let cut = limit;
    const amp = rest.lastIndexOf("&", limit - 1);
    if (amp >= 0 && amp > limit - 6 && !rest.slice(amp, limit).includes(";")) cut = amp;
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return rest ? [...pieces, rest] : pieces;
}

function splitByLines(block: string, limit: number): string[] {
  const chunks: string[] = [];
  let current = "";
  for (const line of block.split("\n").flatMap((item) => (item.length > limit ? hardSplit(item, limit) : [item]))) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= limit) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    current = line;
  }
  if (current) chunks.push(current);
  return chunks;
}

/** Режет сообщение по пустым строкам (блоки разметки не рвутся); блок длиннее предела — по строкам. */
export function chunkCardMessage(message: string, limit: number = TELEGRAM_CARD_LIMIT): string[] {
  if (message.length <= limit) return [message];
  const chunks: string[] = [];
  let current = "";
  for (const block of message.split("\n\n")) {
    const pieces = block.length > limit ? splitByLines(block, limit) : [block];
    for (const piece of pieces) {
      const next = current ? `${current}\n\n${piece}` : piece;
      if (next.length <= limit) {
        current = next;
      } else {
        if (current) chunks.push(current);
        current = piece;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
