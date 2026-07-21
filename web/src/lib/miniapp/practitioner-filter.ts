import { PRACTITIONER_TABS, tabCategories } from "@/lib/practitioner-tabs";

/**
 * B558/B559: один источник для фильтра направлений в мини-аппе.
 *
 * Разъезд, на который указал владелец, начался с копипасты: экран «Услуги»
 * называл эзотерику «Символикой», экран «Живые специалисты» — «Практиками», а
 * канонический ярлык платформы всё это время лежал в `practitioner-tabs`
 * («Эзотерика»). Заодно там же живёт правило сопоставления категорий, включая
 * legacy-категорию `joint` (универсал попадает в оба направления) — наивный
 * `categories.includes("psychology")` в мини-аппе её терял.
 *
 * Ярлыки здесь короче каталожных: в мини-аппе сегмент — треть строки шириной
 * 344px, «Психология и коучинг» туда не помещается.
 */
export type MiniAppDirection = "all" | "psychology" | "esoteric";

export const MINIAPP_DIRECTIONS: ReadonlyArray<{ id: MiniAppDirection; label: string }> = [
  { id: "all", label: "Все" },
  { id: "psychology", label: "Психология" },
  { id: "esoteric", label: "Эзотерика" },
];

const TAB_BY_DIRECTION = {
  psychology: PRACTITIONER_TABS.find((tab) => tab.id === "psy-coach"),
  esoteric: PRACTITIONER_TABS.find((tab) => tab.id === "esoteric"),
} as const;

/** Подходит ли специалист выбранному направлению. */
export function matchesDirection(
  direction: MiniAppDirection,
  practitioner: { categories?: string[]; specialties?: string[]; title?: string | null },
): boolean {
  if (direction === "all") return true;
  const tab = TAB_BY_DIRECTION[direction];
  return tab ? tab.match(tabCategories(practitioner)) : true;
}
