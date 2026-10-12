/**
 * B769 — LLM-проверяющий поста Threads: бинарные вопросы с цитатой-доказательством.
 *
 * НЕ ВКЛЮЧЁН В КОНВЕЙЕР. Замер 2026-10-12 на 79 постах с оценками владельца
 * (см. тикет B769) критерия не выполнил: лучший вариант (Sonnet 5.5, семь
 * вопросов) ловит 66% постов ≤ 4, но режет 32% постов ≥ 8, корреляция 0,18.
 * Режим `sampled` в B764 остаётся выключенным; модуль лежит готовым к повторному
 * замеру на новых вердиктах владельца.
 *
 * Главное свойство, которое стоит сохранить: флаг без дословной цитаты из текста
 * отбрасывается КОДОМ. Проверяющий, которому нечем подтвердить дефект, выдумывает
 * его — на замере такие флаги составляли заметную долю.
 */

import { z } from "zod";

export const CHECKER_QUESTIONS = [
  "q1_bookish",
  "q2_impossible",
  "q3_broken_link",
  "q4_unclear",
  "q5_no_sting",
  "q6_sermon",
  "q7_not_relatable",
] as const;

export type CheckerQuestion = (typeof CHECKER_QUESTIONS)[number];

/** Вопросы, по которым замер показал отношение «поймал брак / задел хорошее» не хуже 3:1. */
export const CHECKER_PRECISE_QUESTIONS: readonly CheckerQuestion[] = ["q1_bookish", "q3_broken_link", "q4_unclear"];

export const CHECKER_SYSTEM_PROMPT = `Ты — придирчивый проверяющий постов для ленты Threads (русская аудитория 20–35, женский голос бренда). Ты НЕ пишешь и не улучшаешь посты — только ищешь дефекты и подтверждаешь каждый дословной цитатой из поста.

На каждый вопрос ответь flag=true только если дефект ЕСТЬ и ты можешь привести дословную цитату (подстроку поста, без изменений). Нет цитаты — flag=false.

q1_bookish — слово или оборот, которые живой человек в переписке так не говорит.
q2_impossible — в сцене физически невозможное или несовместимое; опиши в why, как это происходит физически.
q3_broken_link — два соседних предложения не связаны логикой. Цитата — пара фраз.
q4_unclear — без контекста непонятно, кто герой или что произошло.
q5_no_sting — последняя строка не бьёт: пересказ, мораль, затухание.
q6_sermon — пост не сцена, а мнение или совет.
q7_not_relatable — читателю не хочется ответить «это я».

Верни СТРОГО JSON без markdown: {"q1_bookish":{"flag":false,"quote":null,"why":""}, ... по всем семи ключам}`;

const AnswerSchema = z.object({
  flag: z.boolean().optional(),
  quote: z.string().nullable().optional(),
  why: z.string().optional(),
});
const ResponseSchema = z.record(z.string(), AnswerSchema);

function normalize(value: string): string {
  return value.toLowerCase().replaceAll("ё", "е").replace(/\s+/gu, " ").trim();
}

export function parseCheckerResponse(raw: string | null | undefined): z.infer<typeof ResponseSchema> | null {
  const match = raw ? /\{[\s\S]*\}/u.exec(raw) : null;
  if (!match) return null;
  try {
    const parsed = ResponseSchema.safeParse(JSON.parse(match[0]));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Флаги, чья цитата реально лежит в тексте поста. Остальное — выдумка проверяющего. */
export function verifiedCheckerFlags(
  postText: string,
  response: z.infer<typeof ResponseSchema> | null,
): Record<CheckerQuestion, boolean> {
  const body = normalize(postText);
  const result = {} as Record<CheckerQuestion, boolean>;
  for (const question of CHECKER_QUESTIONS) {
    const answer = response?.[question];
    const quote = answer?.quote;
    result[question] = Boolean(answer?.flag)
      && typeof quote === "string"
      && normalize(quote).replace(/^[«»"… .]+|[«»"… .]+$/gu, "").length >= 4
      && body.includes(normalize(quote).replace(/^[«»"… .]+|[«»"… .]+$/gu, ""));
  }
  return result;
}

export function checkerVerdict(flags: Record<CheckerQuestion, boolean>, questions: readonly CheckerQuestion[] = CHECKER_PRECISE_QUESTIONS): {
  flagged: boolean;
  questions: CheckerQuestion[];
} {
  const hit = questions.filter((question) => flags[question]);
  return { flagged: hit.length > 0, questions: hit };
}
