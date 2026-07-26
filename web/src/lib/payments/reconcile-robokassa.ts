/**
 * Досверка платежей Robokassa — вторая линия обороны за ResultURL.
 *
 * INC-081 показал, чего стоит её отсутствие. ResultURL — единственный путь
 * зачисления, и у него ровно четыре попытки за четыре минуты. Если в эти четыре
 * минуты наш ответ был неверным (шестизначный `OutSum` не разбирался), деньги
 * оставались списанными, а транзакция — PENDING навсегда: ни один механизм не
 * возвращался к ней.
 *
 * Здесь мы спрашиваем у провайдера напрямую. Зачисление делает тот же
 * `creditSucceededPayment`, что и колбэк, поэтому двойного начисления быть не
 * может: он работает только над PENDING.
 *
 * Правило, которое нельзя нарушать: «провайдер недоступен» ≠ «не оплачено».
 * Неизвестное состояние оставляет транзакцию PENDING.
 */
import db from "@/lib/db";
import { cancelPendingPayment, creditSucceededPayment } from "@/lib/billing-credit";
import { log, serializeError } from "@/lib/logger";
import { robokassaConfig } from "./config";
import { fetchOperationState, parseOutSumToKopecks } from "./robokassa";

export type RobokassaReconcileOutcome =
  | "credited"
  | "already_settled"
  | "cancelled"
  | "still_pending"
  | "amount_mismatch"
  | "unknown"
  | "error";

export interface RobokassaReconcileResult {
  invoiceId: number;
  outcome: RobokassaReconcileOutcome;
  detail?: string;
}

/** Сколько назад смотрим. Ссылка Robokassa живёт сутки — окно шире неё. */
const LOOKBACK_MS = 3 * 24 * 60 * 60 * 1000;

/**
 * Досверяет один счёт. Возвращает исход, никогда не бросает.
 */
export async function reconcileRobokassaInvoice(invoiceId: number): Promise<RobokassaReconcileResult> {
  try {
    const transaction = await db.transaction.findUnique({ where: { invoiceId } });
    if (!transaction) return { invoiceId, outcome: "error", detail: "unknown invoice" };
    if (transaction.status !== "PENDING") return { invoiceId, outcome: "already_settled" };

    const config = robokassaConfig({ testMode: transaction.testMode });
    const state = await fetchOperationState({ config, invId: invoiceId });

    if (state.kind === "unknown") {
      return { invoiceId, outcome: "unknown", detail: state.reason };
    }
    if (state.kind === "pending") {
      return { invoiceId, outcome: "still_pending", detail: `state ${state.stateCode}` };
    }
    if (state.kind === "cancelled") {
      await cancelPendingPayment(String(invoiceId));
      return { invoiceId, outcome: "cancelled", detail: `state ${state.stateCode}` };
    }

    // Сумма проверяется и здесь: колбэк мы могли не увидеть вовсе, а зачислять
    // по счёту, за который заплатили другую сумму, нельзя ни при каких условиях.
    const paidKopecks = state.outSum === null ? null : parseOutSumToKopecks(state.outSum);
    if (paidKopecks !== null && paidKopecks !== transaction.amount) {
      log.error("robokassa-reconcile-amount-mismatch", {
        invoiceId,
        expectedKopecks: transaction.amount,
        paidKopecks,
      });
      return { invoiceId, outcome: "amount_mismatch" };
    }

    const applied = await creditSucceededPayment(String(invoiceId));
    log.info("robokassa-reconcile-applied", { invoiceId, applied });
    return { invoiceId, outcome: applied ? "credited" : "already_settled" };
  } catch (error) {
    log.error("robokassa-reconcile-failed", { invoiceId, error: serializeError(error) });
    return { invoiceId, outcome: "error", detail: error instanceof Error ? error.message : "unknown" };
  }
}

/**
 * Досверяет незакрытые счета одного пользователя — вызывается страницей при
 * возврате с оплаты, где человек стоит и ждёт открытого доступа.
 */
export async function reconcileRobokassaForUser(userId: string): Promise<RobokassaReconcileResult[]> {
  const pending = await db.transaction.findMany({
    where: {
      userId,
      status: "PENDING",
      provider: "robokassa",
      createdAt: { gte: new Date(Date.now() - LOOKBACK_MS) },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
    select: { invoiceId: true },
  });

  const results: RobokassaReconcileResult[] = [];
  for (const row of pending) {
    results.push(await reconcileRobokassaInvoice(row.invoiceId));
  }
  return results;
}

/**
 * Досверяет всё, что зависло по платформе — для фонового джоба.
 * Возвращает только те счета, по которым что-то изменилось.
 */
export async function reconcileRobokassaBacklog(limit = 50): Promise<RobokassaReconcileResult[]> {
  const pending = await db.transaction.findMany({
    where: {
      status: "PENDING",
      provider: "robokassa",
      createdAt: { gte: new Date(Date.now() - LOOKBACK_MS) },
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { invoiceId: true },
  });

  const results: RobokassaReconcileResult[] = [];
  for (const row of pending) {
    const result = await reconcileRobokassaInvoice(row.invoiceId);
    if (result.outcome !== "still_pending" && result.outcome !== "unknown") {
      results.push(result);
    }
  }
  return results;
}
