import type { ArcanaGuide } from "./types";
import { ARCANA_GUIDES_01_08 } from "./guides-01-08";
import { ARCANA_GUIDES_09_15 } from "./guides-09-15";
import { ARCANA_GUIDES_16_22 } from "./guides-16-22";

export type { ArcanaGuide, ArcanaPosition } from "./types";

/** Все 22 энергии в порядке номеров. Разбор корпуса — в `./types.ts`. */
export const ARCANA_GUIDES: readonly ArcanaGuide[] = [
  ...ARCANA_GUIDES_01_08,
  ...ARCANA_GUIDES_09_15,
  ...ARCANA_GUIDES_16_22,
];

const BY_SLUG = new Map(ARCANA_GUIDES.map((guide) => [guide.slug, guide]));
const BY_NUMBER = new Map(ARCANA_GUIDES.map((guide) => [guide.number, guide]));

/** Запись библиотеки спрашивает корпус по своему slug — соответствие держится данными. */
export function arcanaGuideBySlug(slug: string): ArcanaGuide | null {
  return BY_SLUG.get(slug) ?? null;
}

export function arcanaGuideByNumber(value: number): ArcanaGuide | null {
  return BY_NUMBER.get(value) ?? null;
}
