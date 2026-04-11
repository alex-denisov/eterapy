/**
 * Константы для модальностей — БЕЗ импорта db (pg — Node only).
 * Импортируется из клиентских компонентов.
 */
export type ReadingTier = "quick" | "full";
const FULL_READING_PRICE_KOPECKS = 29900; // 299 ₽ за полный расклад

export function getFullReadingPriceKopecks(): number {
  return FULL_READING_PRICE_KOPECKS;
}
