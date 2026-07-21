/**
 * B562 — исполнение выплаты специалисту за интерфейсом провайдера.
 *
 * До этого `practitioner-payout.ts` звал ЮKassa напрямую, хотя приём платежей
 * уже переезжает на Robokassa (B423). Расчёт доли, удержания, резерв и
 * блокировка выплаты диспутом провайдер-независимы и живут отдельно
 * (`payout-runs.ts`, `payout-schedule.ts`, `practitioner-balance.ts`,
 * `practitioner-antifraud.ts`) — этот слой отвечает ТОЛЬКО за отправку денег.
 *
 * Реквизиты не выносятся наружу намеренно: адресат — понятие провайдера
 * (ЮKassa хочет номер карты, Robokassa — аккаунт получателя), и превращение
 * `PayoutDetails` в адресата обязано жить внутри реализации. Наружу торчат два
 * вопроса: «умеешь ли ты платить по этим реквизитам» и «заплати».
 */
import type { PaymentProviderName } from "./config";
import { activePaymentProvider } from "./config";

export interface PayoutDetailsInput {
  type: string;
  accountNumber: string;
}

export interface SendPayoutInput {
  payoutId: string;
  details: PayoutDetailsInput;
  amountKopecks: number;
  description?: string;
}

export type SendPayoutResult =
  | { status: "DONE" | "PROCESSING"; externalId: string }
  | { status: "FAILED"; externalId?: string; error: string };

export interface PayoutProvider {
  readonly name: PaymentProviderName;
  /**
   * Можно ли исполнить выплату по этим реквизитам автоматически.
   * `false` → администратору показывается отказ ДО создания записи Payout.
   */
  supportsAutoPayout(details: PayoutDetailsInput): boolean;
  /**
   * Отправляет выплату по уже созданной записи `Payout(PENDING)`.
   * **Никогда не бросает**: при любой ошибке запись помечается FAILED, иначе
   * баланс специалиста останется списанным без движения денег.
   */
  send(input: SendPayoutInput): Promise<SendPayoutResult>;
}

/**
 * Заглушка Robokassa: выплаты — отдельный продукт с отдельным API, контракта у
 * нас нет.
 *
 * Падает ЗАКРЫТО и говорит правду. Имитировать успех здесь нельзя: вызывающий
 * пометил бы выплату исполненной и списал баланс специалиста, хотя деньги
 * никуда не ушли. Реализация — только по документации API выплат (тикет B562).
 */
export const robokassaPayoutProvider: PayoutProvider = {
  name: "robokassa",
  supportsAutoPayout: () => false,
  send: async ({ payoutId }) => ({
    status: "FAILED",
    error: `Выплаты через Robokassa ещё не подключены — выплата ${payoutId} не отправлена. Проведите её вручную.`,
  }),
};

/**
 * Выбор провайдера выплат.
 *
 * Реализация ЮKassa подключается лениво: `practitioner-payout.ts` тянет `db`, и
 * статический импорт затащил бы Prisma в любой модуль, которому нужен всего лишь
 * тип провайдера.
 */
export async function resolvePayoutProvider(
  name: PaymentProviderName = activePaymentProvider(),
): Promise<PayoutProvider> {
  if (name === "robokassa") return robokassaPayoutProvider;
  const { yukassaPayoutProvider } = await import("../practitioner-payout");
  return yukassaPayoutProvider;
}
