/**
 * B529 — оплата цифровых услуг внутри Telegram Mini App звёздами (XTR).
 *
 * ПОЧЕМУ отдельный рельс, а не Robokassa. Правила Telegram и сторов: цифровой
 * товар, потребляемый внутри мини-аппа, на iOS и Android продаётся ТОЛЬКО за
 * Stars. Внешняя платёжная ссылка там — нарушение, за которое снимают бота, а
 * не «просто другой способ оплаты». Поэтому Robokassa остаётся рельсом веба, а
 * мини-апп получает свой.
 *
 * ЧТО ОБЩЕГО С ОСТАЛЬНЫМИ РЕЛЬСАМИ. Начисление НЕ дублируется: успешная оплата
 * приходит в тот же `creditSucceededPayment()`, что и Robokassa с ЮKassa —
 * значит выдача прав, реферальная механика, уведомления и аудит одни и те же.
 * Отличается только то, как создан платёж и как подтверждён.
 *
 * ЭКОНОМИКА. Звезда — не рубль. Курс живёт в настройке, а НЕ вшит: Telegram
 * меняет цену пачки звёзд, а сторы забирают свою долю. Курс, по которому
 * посчитан конкретный инвойс, записывается НА ТРАНЗАКЦИЮ: между оплатой и
 * колбэком владелец может поменять настройку, и пересчёт задним числом начислил
 * бы человеку не то, что он купил.
 */
import { humanizeBillingDescription } from "@/lib/billing-labels";

/**
 * Запасной курс, ₽ за одну звезду.
 *
 * Ориентир — розничная цена звёзд в Telegram (≈1.9 $ за 100 XTR) по курсу
 * ЦБ ≈ 85 ₽/$. Это НЕ выручка: с продажи внутри мини-аппа Telegram и стор
 * удерживают свою долю, поэтому итоговая маржа ниже, чем на веб-оплате.
 * Значение задаётся владельцем через `TELEGRAM_STARS_RUB_RATE`.
 */
export const STARS_RUB_RATE_FALLBACK = 1.6;

/** Telegram обрезает заголовок инвойса на 32 символах. */
const INVOICE_TITLE_MAX = 32;

/** Telegram отвергает инвойс дешевле одной звезды. */
const MIN_STARS = 1;

export function isStarsConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}

export function starsRubRate(): number {
  const raw = Number(process.env.TELEGRAM_STARS_RUB_RATE);
  // Мусор или отрицательное значение в переменной не должны молча удешевлять
  // покупку — падаем на задокументированный запасной курс.
  return Number.isFinite(raw) && raw > 0 ? raw : STARS_RUB_RATE_FALLBACK;
}

/**
 * Цена в звёздах за сумму в копейках.
 *
 * Округление ВВЕРХ и только вверх: звезда — целое число, а недобрать с
 * покупателя значит продать дешевле прейскуранта.
 */
export function starsForKopecks(amountKopecks: number, rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Некорректный курс звезды: ${rate}`);
  }
  const rubles = amountKopecks / 100;
  return Math.max(MIN_STARS, Math.ceil(rubles / rate));
}

/**
 * Payload инвойса — наш `invoiceId`.
 *
 * Префикс нужен, чтобы чужой инвойс того же бота (например, будущая продажа из
 * другого продукта) не был принят за наш платёж.
 */
export function buildStarsPayload(invoiceId: number): string {
  return `eterapy:${invoiceId}`;
}

export function parseStarsPayload(payload: string | null | undefined): number | null {
  if (!payload) return null;
  const match = payload.match(/^eterapy:(\d+)$/);
  if (!match) return null;
  const invoiceId = Number(match[1]);
  return Number.isInteger(invoiceId) && invoiceId > 0 ? invoiceId : null;
}

/** Заголовок в окне оплаты Telegram — то, что человек видит вместо ключа SKU. */
export function starsInvoiceTitle(description: string | null | undefined): string {
  const human = humanizeBillingDescription(description);
  return human.length > INVOICE_TITLE_MAX ? `${human.slice(0, INVOICE_TITLE_MAX - 1)}…` : human;
}

type StarsTransactionView = {
  invoiceId: number;
  status: string;
  currency: string;
  userId: string;
  metadata: Record<string, unknown> | null;
} | null;

export type StarsChargeVerdict = { ok: true } | { ok: false; reason: string };

/**
 * Сверка перед `answerPreCheckoutQuery`.
 *
 * Это ЕДИНСТВЕННЫЙ момент, когда от платежа ещё можно отказаться без возврата:
 * после `successful_payment` звёзды уже списаны. Поэтому здесь проверяется всё,
 * что вообще можно проверить.
 */
export function verifyStarsCharge({ transaction, chargedStars }: {
  transaction: StarsTransactionView;
  chargedStars: number;
}): StarsChargeVerdict {
  if (!transaction) return { ok: false, reason: "Платёж не найден" };
  if (transaction.status === "SUCCEEDED") return { ok: false, reason: "Этот счёт уже оплачен" };
  if (transaction.status !== "PENDING") return { ok: false, reason: "Счёт больше не активен" };
  if (transaction.currency !== "XTR") return { ok: false, reason: "Счёт выставлен не в звёздах" };

  const expected = Number(transaction.metadata?.starsAmount);
  if (!Number.isInteger(expected) || expected <= 0) {
    return { ok: false, reason: "У счёта не записана сумма в звёздах" };
  }
  if (expected !== chargedStars) {
    return { ok: false, reason: `Сумма счёта изменилась: ожидали ${expected} ★, пришло ${chargedStars} ★` };
  }
  return { ok: true };
}
