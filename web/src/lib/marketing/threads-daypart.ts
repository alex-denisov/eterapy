/**
 * B776 F6 — ПРИБЛИЖЕНИЕ ФОРМАТОВ К ВРЕМЕНИ СУТОК (решение владельца 2026-10-13).
 *
 * Утро (07:30–10:00, слоты 0–1) и ночь (слот 7) — пожелания и «коснись»
 * (K1, K26, K27); утром же сильнейшие полезные форматы (K28). Вечерний прайм
 * (слоты 5–6, 18:00–21:30) — обсуждение и мнение (K14, K15, K18) и серия.
 * День (слоты 2–4) — лёгкий юмор и наблюдения. Юмор годится в любое время.
 *
 * Это детерминированная перестановка УЖЕ выбранных форматов суток: состав
 * (уникальность, число оклика знака, герои) не меняется, а соседство окликов
 * знака проверяется на каждом шаге. Если расставить без нарушения нельзя —
 * возвращается исходный порядок.
 */

import type { PostFormat } from "@/lib/marketing/post-formats";

const MORNING = [0, 1];
const MIDDAY = [2, 3, 4];
const EVENING = [5, 6];
const NIGHT = [7];

const WISH_CLUSTERS = new Set(["K1", "K26", "K27"]);
const EXPERT_CLUSTERS = new Set(["K28"]);
const EVENING_CLUSTERS = new Set(["K14", "K15", "K18"]);
const MIDDAY_CLUSTERS = new Set(["K3", "K4", "K5", "K6", "K7", "K8", "K10", "K11", "K20", "K22", "K23"]);

const MATCH_SCORE = 3;
const MISMATCH_SCORE = -2;

function preferredSlots(format: PostFormat): { good: number[]; bad: number[] } {
  const cluster = format.cluster ?? "";
  if (WISH_CLUSTERS.has(cluster)) return { good: [...MORNING, ...NIGHT], bad: [...EVENING, ...MIDDAY] };
  if (EXPERT_CLUSTERS.has(cluster)) return { good: MORNING, bad: NIGHT };
  if (EVENING_CLUSTERS.has(cluster)) return { good: EVENING, bad: [...MORNING, ...NIGHT] };
  if (MIDDAY_CLUSTERS.has(cluster)) return { good: MIDDAY, bad: [] };
  return { good: [], bad: [] };
}

export function daypartScore(format: PostFormat, slot: number): number {
  const { good, bad } = preferredSlots(format);
  // Сильнейшая полезная рубрика обгоняет пожелания в споре за утро.
  if (good.includes(slot)) return EXPERT_CLUSTERS.has(format.cluster ?? "") ? MATCH_SCORE + 1 : MATCH_SCORE;
  return bad.includes(slot) ? MISMATCH_SCORE : 0;
}

/**
 * Жадная расстановка по слотам: на каждый слот — формат с наибольшим
 * соответствием из тех, что не нарушают соседство (`conflicts`).
 */
export function reorderByDaypart(
  formats: readonly PostFormat[],
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
      const score = daypartScore(format, slot);
      if (score > bestScore) { bestScore = score; bestIndex = index; }
    });
    if (bestIndex < 0) return [...formats]; // вызывающий проверит, годится ли исходный порядок
    placed.push(remaining[bestIndex]);
    remaining.splice(bestIndex, 1);
  }
  return placed;
}
