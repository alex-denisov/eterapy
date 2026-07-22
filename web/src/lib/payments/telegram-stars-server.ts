/**
 * B529 — серверная половина звёздного рельса: выставление счёта и приём оплаты.
 *
 * Порядок операций повторяет Robokassa-рельс (`checkout.ts`) и по той же
 * причине: транзакция пишется ПЕРВОЙ, её `invoiceId` уходит в payload счёта.
 * Платёж не может существовать без нашей записи о нём.
 */
import db from "@/lib/db";
import type { ResolvedBillingPurchase } from "@/lib/entitlements";
import { paymentDocumentVersionData, withPaymentPolicyMetadata } from "@/lib/billing-policy";
import { log, serializeError } from "@/lib/logger";
import { callTelegramApi } from "@/lib/telegram";
import {
  buildStarsPayload,
  isStarsConfigured,
  starsForKopecks,
  starsInvoiceTitle,
  starsRubRate,
} from "./telegram-stars";

export const STARS_PROVIDER = "telegram_stars";

export class StarsCheckoutError extends Error {}

export interface StarsInvoice {
  invoiceLink: string;
  stars: number;
  transactionId: string;
  invoiceId: number;
}

/**
 * Описание счёта в окне оплаты. Telegram ограничивает 255 символами; человек
 * должен понять, что покупает, без обращения в поддержку.
 */
function invoiceDescription(purchase: ResolvedBillingPurchase): string {
  if (purchase.kind === "credits") {
    return `${purchase.metadata.creditsAmount} балла(ов) на счёт ETerapy. Баллы тратятся на разборы и диалог в чате.`;
  }
  if (purchase.kind === "subscription") {
    return "Подписка ETerapy. Доступ открывается сразу после оплаты.";
  }
  return "Разбор ETerapy. Доступ открывается сразу после оплаты.";
}

export async function createStarsInvoice({ userId, purchase }: {
  userId: string;
  purchase: ResolvedBillingPurchase;
}): Promise<StarsInvoice> {
  if (!isStarsConfigured()) {
    throw new StarsCheckoutError("Оплата звёздами не настроена");
  }

  const rate = starsRubRate();
  const stars = starsForKopecks(purchase.amountKopecks, rate);
  const documentVersions = paymentDocumentVersionData();

  // Курс и цена в звёздах ложатся НА ТРАНЗАКЦИЮ. Настройку могут поменять между
  // выставлением счёта и приходом оплаты — сверять pre_checkout пересчитанной
  // ценой значило бы отвергать законные платежи (или принимать заниженные).
  const metadata = {
    ...withPaymentPolicyMetadata(purchase.metadata),
    starsAmount: stars,
    starsRubRate: rate,
    amountKopecksRub: purchase.amountKopecks,
  };

  const transaction = await db.transaction.create({
    data: {
      userId,
      // Сумма остаётся в копейках рублей: на ней стоит вся выдача прав,
      // реферальная механика и отчётность. Сколько звёзд списано — в metadata.
      amount: purchase.amountKopecks,
      currency: "XTR",
      status: "PENDING",
      provider: STARS_PROVIDER,
      description: purchase.description,
      offerVersion: documentVersions.offerVersion,
      termsVersion: documentVersions.termsVersion,
      consentVersion: documentVersions.consentVersion,
      metadata,
    },
  });

  const providerPaymentId = buildStarsPayload(transaction.invoiceId);
  await db.transaction.update({
    where: { id: transaction.id },
    data: { providerPaymentId },
  });

  const response = await callTelegramApi<string>("createInvoiceLink", {
    title: starsInvoiceTitle(purchase.description),
    description: invoiceDescription(purchase),
    payload: providerPaymentId,
    // Для XTR provider_token не нужен и должен быть пустым.
    provider_token: "",
    currency: "XTR",
    prices: [{ label: starsInvoiceTitle(purchase.description), amount: stars }],
  });

  if (!response.ok || typeof response.result !== "string") {
    // Счёт не выставлен — держать PENDING-запись незачем, она бы висела в
    // истории оплат как «незавершённая покупка», которой не было.
    await db.transaction.update({
      where: { id: transaction.id },
      data: { status: "CANCELLED", paymentDeclineReason: response.description?.slice(0, 200) ?? "createInvoiceLink failed" },
    }).catch((err) => log.error("stars-invoice-cancel-failed", { error: serializeError(err) }));

    log.error("stars-invoice-failed", { invoiceId: transaction.invoiceId, description: response.description });
    throw new StarsCheckoutError("Telegram не выставил счёт. Попробуйте позже.");
  }

  log.info("stars-invoice-created", { invoiceId: transaction.invoiceId, stars, rate });
  return { invoiceLink: response.result, stars, transactionId: transaction.id, invoiceId: transaction.invoiceId };
}

/**
 * Ответ на pre_checkout_query. Telegram ждёт его 10 секунд — после таймаута
 * платёж падает у покупателя, поэтому таймаут вызова заведомо короче.
 */
export async function answerStarsPreCheckout({ queryId, ok, errorMessage }: {
  queryId: string;
  ok: boolean;
  errorMessage?: string;
}): Promise<void> {
  await callTelegramApi("answerPreCheckoutQuery", {
    pre_checkout_query_id: queryId,
    ok,
    ...(ok ? {} : { error_message: errorMessage ?? "Счёт больше не действителен. Откройте оплату заново." }),
  }, 7000);
}

/**
 * Возврат звёзд. Telegram возвращает их покупателю сам; наша часть — снять
 * выданное. Возврат по звёздам возможен только по `telegram_payment_charge_id`,
 * поэтому он сохраняется на транзакции при зачислении.
 */
export async function refundStarsPayment({ telegramUserId, chargeId }: {
  telegramUserId: number;
  chargeId: string;
}): Promise<{ ok: boolean; description?: string }> {
  const response = await callTelegramApi("refundStarPayment", {
    user_id: telegramUserId,
    telegram_payment_charge_id: chargeId,
  });
  return { ok: Boolean(response.ok), description: response.description };
}
