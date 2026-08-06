/**
 * B681 — кому вообще показывать «карту дня».
 *
 * Решение владельца 2026-08-06: блок Таро на первом экране видит только тот,
 * кто хотя бы раз прошёл эзотерическую услугу. Человек, пришедший за
 * психологом, не должен встречать колоду на главной — B678 показывал её всем и
 * этим смешивал два разных продукта.
 *
 * Два гейта, и порядок между ними важен:
 *
 *   1. АУДИТОРИЯ — есть готовый результат эзотерической услуги.
 *   2. СКРЫТИЕ — человек сам убрал блок (`users.tarot_day_hidden`).
 *
 * Скрытие сильнее аудитории: тот, кто убрал блок, не должен увидеть его снова
 * после следующей покупки расклада.
 *
 * Рассылка в Telegram этими гейтами НЕ управляется. Это отдельная поверхность
 * с отдельным явным согласием (`DAILY_CARD`/`TELEGRAM`, по умолчанию
 * выключено): если человек сам включил себе утреннее сообщение, оно приходит.
 */
import db from "@/lib/db";

/**
 * Ключи эзотерических услуг.
 *
 * Восемь символических (`SYMBOLIC_PRODUCT_DEFINITIONS`) плюс совместимость по
 * дате — она астрологическая, но живёт своим маршрутом. Список задан здесь
 * явно, а не импортом из `symbolic-products`: тот модуль тянет за собой AI-слой
 * и эфемериды, а тут нужен только перечень строк. Синхронность с каталогом
 * держит тест `b681-tarot-day-audience`.
 *
 * `compatibility` в списке НЕТ намеренно: ключ занят legacy-движком «Вместе»,
 * который относится к психологии (`project_service_slugs_renamed`).
 */
export const ESOTERIC_PRODUCT_KEYS = [
  "tarot",
  "natal-chart",
  "numerology",
  "horoscope",
  "arcana",
  "family-questions",
  "human-design",
  "surname-origin",
  "compatibility-by-date",
] as const;

export type EsotericProductKey = (typeof ESOTERIC_PRODUCT_KEYS)[number];

/**
 * Прошёл ли человек хотя бы одну эзотерическую услугу до конца.
 *
 * Считается только `READY`. Символические услуги заводят строку `PREVIEW` ещё
 * до оплаты (`api/products/symbolic/route.ts`), и человек, который открыл
 * страницу услуги и ушёл, услугу не проходил — по `PREVIEW` блок появился бы
 * ровно у тех, кого владелец и просил не смущать.
 */
export async function hasCompletedEsotericService(userId: string): Promise<boolean> {
  const row = await db.productResult.findFirst({
    where: {
      userId,
      status: "READY",
      deletedAt: null,
      productKey: { in: [...ESOTERIC_PRODUCT_KEYS] },
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * Показывать ли блок «карта дня» этому человеку на первом экране.
 *
 * Один запрос на оба гейта не делается намеренно: скрытие читается из уже
 * загруженной строки пользователя там, где она есть, и тогда обращение к
 * `product_results` не нужно вовсе.
 */
export async function shouldShowTarotDay(input: {
  userId: string;
  tarotDayHidden: boolean;
}): Promise<boolean> {
  if (input.tarotDayHidden) return false;
  return hasCompletedEsotericService(input.userId);
}
