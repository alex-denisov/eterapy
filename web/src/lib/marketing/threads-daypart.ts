/**
 * B776 F6 — ПРИБЛИЖЕНИЕ ФОРМАТОВ К ВРЕМЕНИ СУТОК (решение владельца 2026-10-13).
 *
 * Утро и поздний вечер — пожелания и «коснись» (K1, K26, K27); утром же
 * сильнейшие полезные форматы (K28). Вечер — обсуждение и мнение (K14, K15, K18).
 * День — лёгкий юмор и наблюдения. Юмор годится в любое время.
 * B777: роль слота задаётся временем суток (`threads-ladder.ts`), а не номером:
 * номер слота меняется со ступенью лесенки 4→8, время суток нет.
 *
 * Это детерминированная перестановка УЖЕ выбранных форматов суток: состав
 * (уникальность, число оклика знака, герои) не меняется, а соседство окликов
 * знака проверяется на каждом шаге. Если расставить без нарушения нельзя —
 * возвращается исходный порядок.
 */

import type { PostFormat } from "@/lib/marketing/post-formats";
import type { ThreadsRole } from "@/lib/marketing/threads-ladder";

const WISH_CLUSTERS = new Set(["K1", "K26", "K27"]);
const EXPERT_CLUSTERS = new Set(["K28"]);
const EVENING_CLUSTERS = new Set(["K14", "K15", "K18"]);
const MIDDAY_CLUSTERS = new Set(["K3", "K4", "K5", "K6", "K7", "K8", "K10", "K11", "K20", "K22", "K23"]);

const MATCH_SCORE = 3;
const MISMATCH_SCORE = -2;

function preferredRoles(format: PostFormat): { good: ThreadsRole[]; bad: ThreadsRole[] } {
  const cluster = format.cluster ?? "";
  if (WISH_CLUSTERS.has(cluster)) return { good: ["morning", "night"], bad: ["evening", "midday"] };
  if (EXPERT_CLUSTERS.has(cluster)) return { good: ["morning"], bad: ["night"] };
  if (EVENING_CLUSTERS.has(cluster)) return { good: ["evening"], bad: ["morning", "night"] };
  if (MIDDAY_CLUSTERS.has(cluster)) return { good: ["midday"], bad: [] };
  return { good: [], bad: [] };
}

export function daypartScore(format: PostFormat, role: ThreadsRole): number {
  const { good, bad } = preferredRoles(format);
  // Сильнейшая полезная рубрика обгоняет пожелания в споре за утро.
  if (good.includes(role)) return EXPERT_CLUSTERS.has(format.cluster ?? "") ? MATCH_SCORE + 1 : MATCH_SCORE;
  return bad.includes(role) ? MISMATCH_SCORE : 0;
}

/**
 * Жадная расстановка по слотам: на каждый слот — формат с наибольшим
 * соответствием роли слота из тех, что не нарушают соседство (`conflicts`).
 * `roles[i]` — роль слота i (по времени суток, B777).
 */
export function reorderByDaypart(
  formats: readonly PostFormat[],
  roles: readonly ThreadsRole[],
  previousLast: PostFormat | undefined,
  conflicts: (left: PostFormat | undefined, right: PostFormat) => boolean,
  forbiddenAt: (slot: number, format: PostFormat) => boolean = () => false,
): PostFormat[] {
  const remaining = [...formats];
  const placed: PostFormat[] = [];
  for (let slot = 0; slot < formats.length; slot += 1) {
    const before = placed.length > 0 ? placed[placed.length - 1] : previousLast;
    let bestIndex = -1;
    let bestScore = -Infinity;
    remaining.forEach((format, index) => {
      if (conflicts(before, format) || forbiddenAt(slot, format)) return;
      const score = daypartScore(format, roles[slot] ?? "midday");
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    if (bestIndex < 0) return [...formats]; // вызывающий проверит, годится ли исходный порядок
    placed.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }
  return placed;
}
