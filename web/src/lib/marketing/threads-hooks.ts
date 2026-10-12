/**
 * B762 — КОПИРКА ХУКА В THREADS ЛОВИТСЯ КОДОМ.
 *
 * Владелец 2026-10-12: «"раки, ало" не может повториться 2 раза за месяц, или
 * вообще "*знак* ало" не должен идти подряд — это выглядит как пост под
 * копирку, а не человеческие посты; такое надо точно исключать».
 *
 * Просьба в промте здесь не годится по уроку B743: автору показывали последние
 * пять постов, а при восьми постах в сутки это меньше суток истории. Поэтому:
 *   • хук — первая строка поста, первые слова без регистра и знаков;
 *   • шаблон — хук, в котором знак зодиака заменён на «<знак>», а «алло/алё»
 *     сведены к «ало»;
 *   • за 30 суток хук не повторяется; шаблон не повторяет шаблон предыдущего
 *     поста ленты.
 * Находка — жёсткий отказ в утверждении (см. `agent.ts`), а не замечание.
 */

import type { LimitViolation } from "@/lib/marketing/platform-limits";

export const HOOK_MEMORY_DAYS = 30;

const ZODIAC_FORMS = new Set([
  "овен", "овны", "овнов", "овнам", "телец", "тельцы", "тельцов", "тельцам",
  "близнец", "близнецы", "близнецов", "близнецам", "рак", "раки", "раков", "ракам",
  "лев", "львы", "львов", "львам", "дева", "девы", "дев", "девам",
  "весы", "весов", "весам", "скорпион", "скорпионы", "скорпионов", "скорпионам",
  "стрелец", "стрельцы", "стрельцов", "стрельцам", "козерог", "козероги", "козерогов", "козерогам",
  "водолей", "водолеи", "водолеев", "водолеям", "рыбы", "рыб", "рыбам",
]);

const HELLO_FORMS = new Set(["ало", "алло", "алё", "але", "аллё", "алле"]);

function words(text: string): string[] {
  const firstLine = text.trim().split(/\r?\n/)[0] ?? "";
  return firstLine
    .toLocaleLowerCase("ru-RU")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Хук: первые четыре слова первой строки. */
export function hookText(text: string): string {
  return words(text).slice(0, 4).join(" ");
}

/** Шаблон хука: первые два слова, знак → «<знак>», «алло» → «ало». */
export function hookTemplate(text: string): string {
  return words(text)
    .slice(0, 2)
    .map((word) => (ZODIAC_FORMS.has(word) ? "<знак>" : HELLO_FORMS.has(word) ? "ало" : word))
    .join(" ");
}

function sameHook(left: string, right: string): boolean {
  const a = words(left);
  const b = words(right);
  if (a.length === 0 || b.length === 0) return false;
  if (hookText(left) === hookText(right)) return true;
  // Три одинаковых первых слова — тот же заход другими хвостами.
  if (a.length >= 3 && b.length >= 3 && a.slice(0, 3).join(" ") === b.slice(0, 3).join(" ")) return true;
  // Оклик знака: «Раки, ало…» повторяет «Раки, ало…» уже по двум словам.
  return ZODIAC_FORMS.has(a[0]) && a.slice(0, 2).join(" ") === b.slice(0, 2).join(" ")
    && a.length >= 2 && b.length >= 2;
}

export interface RecentThreadsPost {
  text: string;
  /** Когда пост вышел или выйдет. */
  at: Date;
}

export function hookCopyFindings(input: {
  text: string;
  recent: readonly RecentThreadsPost[];
  now: Date;
}): LimitViolation[] {
  const findings: LimitViolation[] = [];
  if (!input.text.trim()) return findings;
  const since = input.now.getTime() - HOOK_MEMORY_DAYS * 86_400_000;
  const month = input.recent.filter((post) => post.at.getTime() >= since && post.text.trim());

  const repeated = month.find((post) => sameHook(input.text, post.text));
  if (repeated) {
    findings.push({
      kind: "contract",
      rule: "hook-copy-month",
      issue: `Хук повторяет пост за последние ${HOOK_MEMORY_DAYS} суток: «${(repeated.text.split(/\r?\n/)[0] ?? "").slice(0, 80)}».`,
      brief: "Начни пост по-другому: другой первой фразой и другим заходом, а не другим знаком в той же фразе.",
    });
  }

  // Соседи по ленте с обеих сторон: слоты пишутся не строго по порядку, и
  // следующий пост может быть уже написан. `now` здесь — время слота.
  const before = [...month]
    .filter((post) => post.at.getTime() <= input.now.getTime())
    .sort((left, right) => right.at.getTime() - left.at.getTime())[0];
  const after = [...input.recent]
    .filter((post) => post.at.getTime() > input.now.getTime() && post.text.trim())
    .sort((left, right) => left.at.getTime() - right.at.getTime())[0];
  const template = hookTemplate(input.text);
  const neighbour = [before, after].find((post) => post && template && hookTemplate(post.text) === template);
  if (neighbour) {
    findings.push({
      kind: "contract",
      rule: "hook-copy-in-row",
      issue: `Пост начинается по тому же шаблону, что и соседний в ленте («${template}»).`,
      brief: "Два поста подряд с одинаковым заходом выглядят как копирка: смени первую фразу целиком.",
    });
  }
  return findings;
}

/** Хуки ленты за месяц — список для автора «эти зачины уже были». */
export function recentHooksForPrompt(recent: readonly RecentThreadsPost[], now: Date, limit = 60): string[] {
  const since = now.getTime() - HOOK_MEMORY_DAYS * 86_400_000;
  return [...recent]
    .filter((post) => post.at.getTime() >= since && post.text.trim())
    .sort((left, right) => right.at.getTime() - left.at.getTime())
    .slice(0, limit)
    .map((post) => (post.text.trim().split(/\r?\n/)[0] ?? "").slice(0, 90));
}
