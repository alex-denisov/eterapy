/**
 * B768 — правила вовлечения Threads (со слов владельца от Meta, 2026-10-12):
 *
 *  1. пост кончается конкретным лёгким вопросом читателю — алгоритм меряет
 *     скорость первых ответов; заканчивать надо эмоцией и вопросом, а не
 *     затуханием;
 *  2. у поста есть тема (`topic_tag`) — без неё он не попадает в рекомендации,
 *     его видит только ядро аудитории.
 *
 * Вопрос в конце — замечание, а не отказ: пост без него остаётся годным,
 * просто хуже работает. Поэтому проверка идёт кругами правки, но не режет
 * материал на выпуске (см. `agent.ts`).
 */

import type { LimitViolation } from "@/lib/marketing/platform-limits";

/** Форматы, где вопрос в конце ломает жанр. Пусто, пока владелец не назвал их на примерах. */
export const QUESTION_EXEMPT_FORMATS: ReadonlySet<string> = new Set<string>();

export const ENDING_QUESTION_RULE =
  "Пост кончается эмоцией и ОДНИМ конкретным вопросом читателю, на который можно ответить за секунду "
  + "(«У кого так было — выкинули или оставили?», «Тельцов, это про работу или про отношения? Напиши цифрой»). "
  + "Не «что думаете?»: вопрос о конкретном выборе или опыте. Вопрос — последняя строка.";

/** Последняя непустая строка поста. */
export function lastLine(text: string): string {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.at(-1) ?? "";
}

const VAGUE_QUESTION = /^(?:а\s+)?(?:что|как)\s+(?:вы\s+)?(?:думаете|считаете)\s*\?*$/i;

export function endsWithInviteQuestion(text: string): boolean {
  const last = lastLine(text);
  if (!last.includes("?")) return false;
  const sentence = last.split(/(?<=[.!…])\s+/).at(-1) ?? last;
  return !VAGUE_QUESTION.test(sentence.trim());
}

export function endingQuestionFindings(input: { text: string; format: string | null }): LimitViolation[] {
  if (!input.text.trim()) return [];
  if (input.format && QUESTION_EXEMPT_FORMATS.has(input.format)) return [];
  if (endsWithInviteQuestion(input.text)) return [];
  return [{
    kind: "contract",
    rule: "threads-end-question",
    issue: "Пост не кончается конкретным вопросом читателю: людям нечем зацепиться, первые ответы не придут.",
    brief: `${ENDING_QUESTION_RULE} Сохрани удар поста, добавь вопрос последней строкой.`,
  }];
}

const TOPIC_TAG_MAX = 50;
export const DEFAULT_TOPIC_TAG = "Психология";

/** Область → тег Threads. Порядок важен: первое совпадение побеждает. */
const TAG_BY_THEME: ReadonlyArray<{ pattern: RegExp; tag: string }> = [
  { pattern: /таро|расклад|аркан/i, tag: "Таро" },
  { pattern: /знак|зодиак|астро|гороскоп|луна|лунн|ретроград|планет/i, tag: "Астрология" },
  { pattern: /бывш|отношен|любов|парень|муж|свидан|расстав|ревност|измен|подруг|семь|мам[аыуе]/i, tag: "Отношения" },
  { pattern: /работ|карьер|начальн|деньг|ипотек|зарплат/i, tag: "Работа" },
];

/** Теги Threads: до 50 знаков, без точек и амперсандов. */
export function sanitizeTopicTag(value: string): string | null {
  const tag = value.replace(/[.&]/g, " ").replace(/\s+/g, " ").trim().slice(0, TOPIC_TAG_MAX).trim();
  return tag.length > 0 ? tag : null;
}

export function topicTagFor(input: { cluster: string | null; lifeArea?: string | null; scene?: string | null }): string {
  const haystack = `${input.lifeArea ?? ""} ${input.cluster ?? ""} ${input.scene ?? ""}`;
  const hit = TAG_BY_THEME.find((entry) => entry.pattern.test(haystack));
  return sanitizeTopicTag(hit?.tag ?? DEFAULT_TOPIC_TAG) ?? DEFAULT_TOPIC_TAG;
}
