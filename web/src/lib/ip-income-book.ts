/**
 * B591 · Бухгалтерский контур ИП — фаза 2: книга доходов.
 *
 * Что это. Одна таблица признанных доходов за период — то, что отправляется в
 * Альфа-бухгалтерию вместо ручного сбора цифр по трём источникам. Это НЕ КУДиР
 * в юридическом смысле: книгу ведёт бухгалтер, здесь готовятся данные для неё.
 *
 * ГЛАВНОЕ РАЗЛИЧЕНИЕ, ради которого фаза существовала как заблокированная:
 * оборот ≠ доход. Через счёт проходит вся цена сессии, но по агентской схеме
 * (B525) доходом ИП становится только комиссия платформы. Если бухгалтер
 * увидит поступление 3 000 ₽ и посчитает налог с трёх тысяч — владелец
 * заплатит лишнее.
 *
 * Ответ владельца со слов бухгалтера, 2026-07-27:
 *
 *   «в доход пойдет только комиссия платформы по тем услугам где платформа
 *    работает только как агент (в соответствии с законом)»
 *
 * ⚠ Правило признания живёт ЗДЕСЬ КАК ДАННЫЕ с датой начала действия и
 *   основанием — так же, как ставки в `ip-accounting.ts`. Условие «если сессия,
 *   то комиссия», записанное внутрь расчёта, пережило бы смену ответа
 *   бухгалтера незамеченным.
 *
 * ⚠ Книга ничего не подставляет по умолчанию. Неизвестный вид платежа,
 *   неизвестная ставка комиссии, возврат без даты возврата — это `issue` на
 *   строке и отдельный счётчик в итогах. Угаданная ставка в налоговом
 *   документе хуже пустой: пустую видно.
 */

import type { FiscalSettlementSubject } from "@/lib/payments/fiscal";
import { IP_REGISTERED_AT } from "@/lib/ip-accounting";

/** Чем признаётся доход: всей суммой или только нашей комиссией. */
export type IncomeRecognition = "gross" | "commission";

export interface RecognitionRule {
  subject: FiscalSettlementSubject;
  recognition: IncomeRecognition;
  effectiveFrom: Date;
  /** Откуда взято правило. Без основания его нельзя перепроверить у бухгалтера. */
  basis: string;
}

const AGENT_BASIS =
  "владелец со слов бухгалтера 2026-07-27: «в доход пойдет только комиссия платформы "
  + "по тем услугам где платформа работает только как агент»; агентская схема B525";

const OWN_SERVICE_BASIS =
  "собственная услуга платформы: принципала нет, через счёт проходит наша цена — "
  + "доходом признаётся вся сумма (подтвердить у бухгалтера при смене схемы)";

export const INCOME_RECOGNITION_RULES: readonly RecognitionRule[] = [
  { subject: "session", recognition: "commission", effectiveFrom: IP_REGISTERED_AT, basis: AGENT_BASIS },
  { subject: "product", recognition: "gross", effectiveFrom: IP_REGISTERED_AT, basis: OWN_SERVICE_BASIS },
  { subject: "subscription", recognition: "gross", effectiveFrom: IP_REGISTERED_AT, basis: OWN_SERVICE_BASIS },
  { subject: "credits", recognition: "gross", effectiveFrom: IP_REGISTERED_AT, basis: OWN_SERVICE_BASIS },
  { subject: "practitioner_ai_topup", recognition: "gross", effectiveFrom: IP_REGISTERED_AT, basis: OWN_SERVICE_BASIS },
];

/**
 * Действующее правило на дату. `null` — правила нет: так и должно быть для дат
 * до регистрации ИП, и это лучше молчаливого «считаем целиком».
 */
export function recognitionRuleFor(
  subject: FiscalSettlementSubject,
  at: Date,
): RecognitionRule | null {
  return INCOME_RECOGNITION_RULES
    .filter((rule) => rule.subject === subject && rule.effectiveFrom <= at)
    .sort((a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime())[0] ?? null;
}

/** Одна строка поступления, как её видит база: без выводов. */
export interface IncomeRecord {
  id: string;
  /** Дата признания дохода — кассовый метод: день поступления денег. */
  recognizedAt: Date;
  /** Провайдер как он записан на транзакции (`robokassa`, `telegram_stars`, …). */
  provider: string;
  /** Что продано. `null` — вид не определён, и это видимая проблема строки. */
  subject: FiscalSettlementSubject | null;
  /** Оборот: вся сумма, прошедшая через нас, в копейках. Всегда положительная. */
  turnoverKopecks: number;
  /** Ставка комиссии на момент сделки. Нужна только агентским строкам. */
  commissionPercent: number | null;
  refunded: boolean;
  /** Дата возврата: база уменьшается ЕЮ, а не датой платежа. */
  refundedAt: Date | null;
  /** Человекочитаемая ссылка на платёж (номер счёта у провайдера). */
  reference: string;
  /** Фискальный чек. Сверка — фаза 3; пока чаще всего `null`. */
  receiptReference: string | null;
  /** Пояснение к строке: курс Stars, номер брони и подобное. */
  note: string | null;
}

export interface IncomeBookEntry extends IncomeRecord {
  recognition: IncomeRecognition | null;
  /** `null` — доход по строке посчитать нельзя; смотри `issue`. */
  ownIncomeKopecks: number | null;
  /** Почему строку нельзя отдавать бухгалтеру как есть. */
  issue: string | null;
}

export interface IncomeBookTotals {
  turnoverKopecks: number;
  /** Доход по строкам без возврата и без нерешённых вопросов. */
  ownIncomeKopecks: number;
  refundedTurnoverKopecks: number;
  /** Сколько дохода снято возвратами — показывается отдельной суммой. */
  refundedOwnIncomeKopecks: number;
  unresolvedCount: number;
  unresolvedTurnoverKopecks: number;
}

function commissionKopecks(turnoverKopecks: number, percent: number): number {
  return Math.round((turnoverKopecks * percent) / 100);
}

export function buildIncomeBook(
  records: readonly IncomeRecord[],
  at: Date,
): { entries: IncomeBookEntry[]; totals: IncomeBookTotals } {
  const entries: IncomeBookEntry[] = [...records]
    .sort((a, b) => a.recognizedAt.getTime() - b.recognizedAt.getTime())
    .map((item) => {
      const rule = item.subject ? recognitionRuleFor(item.subject, at) : null;

      if (!rule) {
        return {
          ...item,
          recognition: null,
          ownIncomeKopecks: null,
          issue: item.subject
            ? `Вид «${item.subject}» не имеет правила признания на эту дату — уточните у бухгалтера`
            : "Вид платежа не определён — доход по строке не признан",
        };
      }

      const needsRate = rule.recognition === "commission";
      const percent = item.commissionPercent;
      if (needsRate && (percent === null || !Number.isFinite(percent))) {
        return {
          ...item,
          recognition: rule.recognition,
          ownIncomeKopecks: null,
          issue: "Ставка комиссии по сделке неизвестна — доход не угадывается",
        };
      }

      const ownIncomeKopecks = needsRate
        ? commissionKopecks(item.turnoverKopecks, percent as number)
        : item.turnoverKopecks;

      return {
        ...item,
        recognition: rule.recognition,
        ownIncomeKopecks,
        issue: item.refunded && !item.refundedAt
          ? "Дата возврата неизвестна — база уменьшается датой возврата, уточните перед выгрузкой"
          : null,
      };
    });

  const totals = entries.reduce<IncomeBookTotals>((acc, entry) => {
    acc.turnoverKopecks += entry.turnoverKopecks;
    if (entry.ownIncomeKopecks === null) {
      acc.unresolvedCount += 1;
      acc.unresolvedTurnoverKopecks += entry.turnoverKopecks;
      return acc;
    }
    if (entry.refunded) {
      acc.refundedTurnoverKopecks += entry.turnoverKopecks;
      acc.refundedOwnIncomeKopecks += entry.ownIncomeKopecks;
      return acc;
    }
    acc.ownIncomeKopecks += entry.ownIncomeKopecks;
    return acc;
  }, {
    turnoverKopecks: 0,
    ownIncomeKopecks: 0,
    refundedTurnoverKopecks: 0,
    refundedOwnIncomeKopecks: 0,
    unresolvedCount: 0,
    unresolvedTurnoverKopecks: 0,
  });

  return { entries, totals };
}

/** Человеческие названия видов — для экрана и выгрузки. */
export const SUBJECT_LABEL: Record<FiscalSettlementSubject, string> = {
  product: "разбор (услуга платформы)",
  subscription: "подписка",
  credits: "баллы",
  practitioner_ai_topup: "пакет AI-разборов практика",
  session: "сессия со специалистом",
};

export const RECOGNITION_LABEL: Record<IncomeRecognition, string> = {
  gross: "вся сумма",
  commission: "только комиссия",
};
