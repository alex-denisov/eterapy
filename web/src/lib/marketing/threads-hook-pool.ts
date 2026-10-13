/**
 * B777 — ПУЛ ХУКОВ: ОДИН ВЫЗОВ ДАЁТ 8–10 ЗАЧИНОВ, РЕДАКТОР ВЫБИРАЕТ ОДИН.
 *
 * Идея из разбора рекомендаций блогера (B771 п. 2 и п. 8): три полных черновика
 * на слот втрое дороже и втрое больше нагрузки на владельца в премодерации,
 * а вариантов именно ЗАЧИНА достаточно. Автор пишет один пост на выбранный хук.
 *
 * Семь намерений хука — отдельное измерение рядом с кластером и приёмом:
 * приём — конструкция фразы, намерение — зачем читателю остановиться. Оно
 * пишется в `notes` и считается вместе с вердиктами владельца.
 *
 * Оценка редактора — пять элементов блогера: хук 5, тема 4, подача 4, польза 4,
 * эмоция 5 (всего 22). Порог ≥9 и минимум 3 сильных элемента — ДИАГНОСТИКА, не
 * гейт: на нашем материале шкалу не калибровали, поэтому, если порог не взят
 * никем, берётся лучший по сумме, а не отказ.
 *
 * Модуль чистый: вызовы моделей делает вызывающий (`threads-hook-select.ts`).
 */

import { hookCopyFindings, type RecentThreadsPost } from "@/lib/marketing/threads-hooks";
import { ZODIAC_FAMILY_CLUSTERS } from "@/lib/marketing/threads-lineup";

export type HookIntentCode = "result" | "pain" | "intrigue" | "promise" | "action" | "position" | "separation";

export interface HookIntent {
  code: HookIntentCode;
  label: string;
  hint: string;
}

export const HOOK_INTENTS: readonly HookIntent[] = [
  { code: "result", label: "результат", hint: "что читатель получит, если дочитает; без обещаний исхода" },
  { code: "pain", label: "боль", hint: "узнаваемое неприятное состояние одной сценой" },
  { code: "intrigue", label: "интрига", hint: "недосказанность: наблюдение или факт без развязки в первой строке" },
  { code: "promise", label: "обещание", hint: "что будет в посте дальше: шаг, фраза, список" },
  { code: "action", label: "действие", hint: "прямое «сделай» на пару минут" },
  { code: "position", label: "позиция", hint: "своё мнение, с которым можно спорить" },
  { code: "separation", label: "отделение", hint: "«я делаю иначе, чем принято»; без процентов людей" },
];

const INTENT_CODES: ReadonlySet<string> = new Set(HOOK_INTENTS.map((intent) => intent.code));

export const HOOK_POOL_MIN = 8;
export const HOOK_POOL_MAX = 10;
/** Меньше стольких годных хуков — пул не пул: материал пишется без выбора. */
export const HOOK_POOL_FLOOR = 4;
const HOOK_MAX_LENGTH = 140;
const HOOK_MIN_LENGTH = 8;

/** Пять элементов оценки: максимум каждого, сумма 22. */
export const HOOK_RUBRIC = [
  { key: "hook", label: "хук", max: 5 },
  { key: "theme", label: "тема", max: 4 },
  { key: "delivery", label: "подача", max: 4 },
  { key: "value", label: "польза", max: 4 },
  { key: "emotion", label: "эмоция", max: 5 },
] as const;

export type HookRubricKey = typeof HOOK_RUBRIC[number]["key"];
export const HOOK_PASS_TOTAL = 9;
export const HOOK_PASS_STRONG = 3;
/** Элемент «сильный», если взято не меньше трёх четвертей его максимума. */
const STRONG_SHARE = 0.75;

/** Кластеры с жёсткой первой строкой: оклик знака, экспертные цепочки, серия, полезные форматы. */
const FIXED_HEAD_CLUSTERS: ReadonlySet<string> = new Set([...ZODIAC_FAMILY_CLUSTERS, "K28", "K29", "K30", "K31", "K32"]);

/** Пул хуков нужен формату со свободной первой строкой. */
export function hookPoolApplies(cluster: string | null | undefined): boolean {
  return Boolean(cluster) && !FIXED_HEAD_CLUSTERS.has(cluster!);
}

export interface HookCandidate {
  text: string;
  intent: HookIntentCode;
}

export type HookScores = Record<HookRubricKey, number>;

export interface HookChoice {
  text: string;
  intent: HookIntentCode;
  total: number;
  strong: number;
  /** Порог ≥9 и ≥3 сильных элементов взят. */
  passed: boolean;
  poolSize: number;
}

function extractJson(raw: string): unknown {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("hook pool: no JSON object in the reply");
  return JSON.parse(raw.slice(start, end + 1));
}

/**
 * Разбор ответа автора пула. Хук с неизвестным намерением, слишком короткий или
 * длинный, повторяющий зачин ленты за месяц и дубль внутри пула отбрасываются.
 * Меньше `HOOK_POOL_FLOOR` годных — ошибка разбора: перебор моделей возьмёт следующую.
 */
export function parseHookPool(raw: string, input: { recent: readonly RecentThreadsPost[]; now: Date }): HookCandidate[] {
  const parsed = extractJson(raw) as { hooks?: unknown };
  if (!Array.isArray(parsed.hooks)) throw new Error("hook pool: field hooks is not an array");
  const seen = new Set<string>();
  const hooks: HookCandidate[] = [];
  for (const item of parsed.hooks) {
    const entry = item as { text?: unknown; intent?: unknown };
    const text = typeof entry.text === "string" ? entry.text.trim().replace(/\s+/g, " ") : "";
    const intent = typeof entry.intent === "string" ? entry.intent.trim().toLowerCase() : "";
    if (text.length < HOOK_MIN_LENGTH || text.length > HOOK_MAX_LENGTH || !INTENT_CODES.has(intent)) continue;
    const key = text.toLocaleLowerCase("ru-RU");
    if (seen.has(key)) continue;
    if (hookCopyFindings({ text, recent: input.recent, now: input.now }).length > 0) continue;
    seen.add(key);
    hooks.push({ text, intent: intent as HookIntentCode });
    if (hooks.length >= HOOK_POOL_MAX) break;
  }
  if (hooks.length < HOOK_POOL_FLOOR) throw new Error(`hook pool: only ${hooks.length} usable hooks`);
  return hooks;
}

/** Разбор оценок редактора: `scores[i]` относится к хуку `i`; недостающие и неверные элементы — 0. */
export function parseHookScores(raw: string, poolSize: number): HookScores[] {
  const parsed = extractJson(raw) as { scores?: unknown };
  if (!Array.isArray(parsed.scores)) throw new Error("hook scores: field scores is not an array");
  const result: HookScores[] = Array.from({ length: poolSize }, () => ({ hook: 0, theme: 0, delivery: 0, value: 0, emotion: 0 }));
  let filled = 0;
  for (const item of parsed.scores) {
    const entry = item as Record<string, unknown>;
    const index = Number(entry.i);
    if (!Number.isInteger(index) || index < 0 || index >= poolSize) continue;
    const scores = { ...result[index] };
    for (const element of HOOK_RUBRIC) {
      const value = Number(entry[element.key]);
      scores[element.key] = Number.isFinite(value) ? Math.min(element.max, Math.max(0, Math.round(value))) : 0;
    }
    result[index] = scores;
    filled += 1;
  }
  if (filled === 0) throw new Error("hook scores: no valid entries");
  return result;
}

export function hookTotal(scores: HookScores): number {
  return HOOK_RUBRIC.reduce((sum, element) => sum + scores[element.key], 0);
}

export function hookStrongCount(scores: HookScores): number {
  return HOOK_RUBRIC.filter((element) => scores[element.key] >= Math.ceil(element.max * STRONG_SHARE)).length;
}

/**
 * Выбор: лучший по сумме; при равной сумме — намерение, которого не было в
 * последних постах ленты (ротация), затем более раннее в пуле. Порог — признак
 * в записи, а не условие отказа.
 */
export function pickHook(
  pool: readonly HookCandidate[],
  scores: readonly HookScores[],
  recentIntents: readonly HookIntentCode[] = [],
): HookChoice {
  if (pool.length === 0) throw new Error("hook pool is empty");
  const recent = new Set(recentIntents);
  let best = 0;
  for (let index = 1; index < pool.length; index += 1) {
    const current = scores[index] ?? { hook: 0, theme: 0, delivery: 0, value: 0, emotion: 0 };
    const leader = scores[best] ?? { hook: 0, theme: 0, delivery: 0, value: 0, emotion: 0 };
    const gain = hookTotal(current) - hookTotal(leader);
    if (gain > 0) { best = index; continue; }
    if (gain === 0 && recent.has(pool[best].intent) && !recent.has(pool[index].intent)) best = index;
  }
  const chosen = scores[best] ?? { hook: 0, theme: 0, delivery: 0, value: 0, emotion: 0 };
  const total = hookTotal(chosen);
  const strong = hookStrongCount(chosen);
  return {
    text: pool[best].text,
    intent: pool[best].intent,
    total,
    strong,
    passed: total >= HOOK_PASS_TOTAL && strong >= HOOK_PASS_STRONG,
    poolSize: pool.length,
  };
}

export interface HookPoolTask {
  format: string | null;
  construction: string | null;
  scene: string | null;
  nicheBrief: string | null;
  formatRules: readonly string[] | null;
  recentHooks: readonly string[];
  recentIntents: readonly HookIntentCode[];
}

export const HOOK_POOL_SYSTEM = [
  "Ты автор зачинов для ленты Threads (Аня, сооснователь eTerapy, платформы мягких практик: психология и мягкие практики как два языка).",
  "Твоя задача: придумать пул зачинов для ОДНОГО будущего поста, а не писать сам пост.",
  "Правила зачина: это первая строка поста, 8–140 знаков; живой разговорный русский, женский род, без имён героев, без процентов и статистики о людях, без дипломов и «из практики»; не обещай исход (вернуть, сбудется).",
  "Не повторяй зачины из recentHooks ни дословно, ни по схеме с другим знаком или именем.",
  "Верни только JSON: {\"hooks\":[{\"text\":\"…\",\"intent\":\"result|pain|intrigue|promise|action|position|separation\"}]}.",
].join("\n");

export function hookPoolUser(task: HookPoolTask): string {
  return JSON.stringify({
    count: `${HOOK_POOL_MIN}–${HOOK_POOL_MAX} зачинов; охвати минимум пять разных намерений`,
    intents: HOOK_INTENTS,
    format: task.format,
    construction: task.construction,
    scene: task.scene,
    nicheBrief: task.nicheBrief,
    formatRules: task.formatRules,
    avoidIntents: task.recentIntents.length > 0
      ? { intents: task.recentIntents, note: "эти намерения были в последних постах ленты: бери их реже" }
      : null,
    recentHooks: task.recentHooks,
  });
}

export const HOOK_PICK_SYSTEM = [
  "Ты редактор ленты Threads. Оцени каждый зачин из пула по пяти элементам; ты не пишешь пост и не переписываешь зачины.",
  `Шкала: ${HOOK_RUBRIC.map((element) => `${element.key} 0–${element.max} (${element.label})`).join(", ")}; всего 22.`,
  "hook — остановит ли первая строка; theme — держится ли профессиональной темы (психология и мягкие практики); delivery — живая ли подача; value — есть ли за зачином польза или узнавание; emotion — цепляет ли эмоцией.",
  "Оценивай строго и разбрасывай оценки: если у всех зачинов одинаковые баллы, оценка бесполезна.",
  "Верни только JSON: {\"scores\":[{\"i\":0,\"hook\":0,\"theme\":0,\"delivery\":0,\"value\":0,\"emotion\":0}]} — по одному элементу на зачин, i — его номер в списке.",
].join("\n");

export function hookPickUser(pool: readonly HookCandidate[], task: Pick<HookPoolTask, "format" | "scene">): string {
  return JSON.stringify({
    format: task.format,
    scene: task.scene,
    hooks: pool.map((hook, index) => ({ i: index, text: hook.text, intent: hook.intent })),
  });
}

/** Задача автору поста: выбранный хук становится первой строкой. */
export function chosenHookTask(choice: HookChoice): Record<string, unknown> {
  return {
    chosenHook: { text: choice.text, intent: choice.intent },
    chosenHookRule: "Первая строка поста — этот зачин: оставь смысл и намерение, допустима правка пары слов под формат и женский род. Остальное допиши в формате поста; второй зачин в начало не добавляй.",
  };
}
