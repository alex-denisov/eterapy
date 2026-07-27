/**
 * B591 · Бухгалтерский контур ИП — ручные приходы и расходы.
 *
 * Зачем. Книга доходов (фаза 2) видит только то, что прошло через платёжный
 * рельс: Robokassa и Telegram Stars. Мимо неё идёт всё остальное — поступление
 * по счёту от юрлица, возврат банковской комиссии, оплата хостинга, домены,
 * подписки на сервисы, взносы. Бухгалтеру эти строки нужны, а взять их
 * платформе неоткуда: денег она не видела.
 *
 * Ключевое различение, которое экран обязан удержать: **на УСН «Доходы» 6 %
 * расходы налог НЕ уменьшают.** Они здесь ради учёта и годового пакета, а не
 * ради базы. Если смешать их с доходами в одной сумме, владелец решит, что
 * заплатит меньше — и ошибётся в свою сторону.
 *
 * Второе различение: не всякий приход — доход. Личный перевод себе на счёт,
 * возврат займа, ошибочный платёж — это деньги на счету, но не выручка.
 * Поэтому у прихода есть отдельный признак «входит в базу УСН», и по умолчанию
 * он ДА — но снять его можно, и снятое видно в итогах отдельной строкой.
 */

export type LedgerDirection = "income" | "expense";

export interface LedgerCategory {
  key: string;
  label: string;
  direction: LedgerDirection;
  /** Подсказка: когда эту категорию выбирают. */
  hint: string;
}

/**
 * Категории — ДАННЫЕ, а не строки в коде экрана: список правится одной
 * строкой, а годовой пакет и итоги ничего об этом не знают.
 */
export const LEDGER_CATEGORIES: readonly LedgerCategory[] = [
  { key: "income_invoice", label: "Оплата по счёту", direction: "income", hint: "юрлицо или ИП перевело по выставленному счёту" },
  { key: "income_other_rail", label: "Приход мимо рельса", direction: "income", hint: "деньги пришли способом, которого платформа не видит" },
  { key: "income_refund_back", label: "Возврат нам", direction: "income", hint: "поставщик вернул деньги — обычно НЕ доход" },
  { key: "income_personal", label: "Собственные средства", direction: "income", hint: "перевод себе на счёт — не выручка" },
  { key: "expense_infra", label: "Инфраструктура", direction: "expense", hint: "серверы, домены, хранилище, CDN" },
  { key: "expense_services", label: "Сервисы и подписки", direction: "expense", hint: "AI-провайдеры, почта, аналитика, связь" },
  { key: "expense_bank", label: "Банк и эквайринг", direction: "expense", hint: "комиссии банка и платёжного провайдера" },
  { key: "expense_contractors", label: "Подрядчики", direction: "expense", hint: "оплата работ по договору" },
  { key: "expense_taxes", label: "Налоги и взносы", direction: "expense", hint: "уплаченный налог, фиксированные и 1 % взносы" },
  { key: "expense_other", label: "Прочее", direction: "expense", hint: "то, что не попало ни в одну категорию выше" },
];

export function categoryByKey(key: string): LedgerCategory | null {
  return LEDGER_CATEGORIES.find((category) => category.key === key) ?? null;
}

export interface ManualLedgerEntry {
  id: string;
  occurredAt: Date;
  direction: LedgerDirection;
  categoryKey: string;
  amountKopecks: number;
  /** Только для прихода: попадает ли сумма в базу УСН. */
  taxable: boolean;
  counterparty: string | null;
  documentRef: string | null;
  note: string | null;
}

export interface ManualLedgerTotals {
  /** Приход, входящий в базу УСН. Именно он складывается с книгой доходов. */
  taxableIncomeKopecks: number;
  /** Приход, который в базу НЕ входит. Показывается отдельно, чтобы не потерялся. */
  nonTaxableIncomeKopecks: number;
  expenseKopecks: number;
  incomeCount: number;
  expenseCount: number;
}

export function summarizeManualLedger(entries: readonly ManualLedgerEntry[]): ManualLedgerTotals {
  return entries.reduce<ManualLedgerTotals>((totals, entry) => {
    if (entry.direction === "expense") {
      return {
        ...totals,
        expenseKopecks: totals.expenseKopecks + entry.amountKopecks,
        expenseCount: totals.expenseCount + 1,
      };
    }
    return {
      ...totals,
      taxableIncomeKopecks: totals.taxableIncomeKopecks + (entry.taxable ? entry.amountKopecks : 0),
      nonTaxableIncomeKopecks: totals.nonTaxableIncomeKopecks + (entry.taxable ? 0 : entry.amountKopecks),
      incomeCount: totals.incomeCount + 1,
    };
  }, {
    taxableIncomeKopecks: 0,
    nonTaxableIncomeKopecks: 0,
    expenseKopecks: 0,
    incomeCount: 0,
    expenseCount: 0,
  });
}

export type LedgerInputError =
  | "amount_invalid"
  | "amount_too_large"
  | "category_unknown"
  | "date_invalid"
  | "date_in_future";

export interface LedgerInput {
  occurredAt: Date;
  categoryKey: string;
  amountKopecks: number;
  taxable: boolean;
  counterparty: string | null;
  documentRef: string | null;
  note: string | null;
  direction: LedgerDirection;
}

/** Сумма в рублях строкой («1 200,50», «1200.5») → копейки. */
export function parseRubToKopecks(raw: string): number | null {
  const normalized = raw.replace(/\s| /g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;
  return Math.round(Number(normalized) * 100);
}

const MAX_AMOUNT_KOPECKS = 100_000_000_00; // 100 млн ₽ — заведомо опечатка выше

/**
 * Проверка на границе. Дата будущим днём — почти всегда опечатка в году, а не
 * намерение: кассовый метод не знает будущих поступлений.
 */
export function validateLedgerInput(
  raw: { occurredAt: unknown; categoryKey: unknown; amountRub: unknown; taxable?: unknown; counterparty?: unknown; documentRef?: unknown; note?: unknown },
  now = new Date(),
): { ok: true; value: LedgerInput } | { ok: false; error: LedgerInputError } {
  const category = typeof raw.categoryKey === "string" ? categoryByKey(raw.categoryKey) : null;
  if (!category) return { ok: false, error: "category_unknown" };

  const amountKopecks = typeof raw.amountRub === "string"
    ? parseRubToKopecks(raw.amountRub)
    : typeof raw.amountRub === "number" && Number.isFinite(raw.amountRub)
      ? Math.round(raw.amountRub * 100)
      : null;
  if (amountKopecks === null || amountKopecks <= 0) return { ok: false, error: "amount_invalid" };
  if (amountKopecks > MAX_AMOUNT_KOPECKS) return { ok: false, error: "amount_too_large" };

  if (typeof raw.occurredAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw.occurredAt)) {
    return { ok: false, error: "date_invalid" };
  }
  const occurredAt = new Date(`${raw.occurredAt}T00:00:00.000Z`);
  if (Number.isNaN(occurredAt.getTime())) return { ok: false, error: "date_invalid" };
  if (occurredAt.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return { ok: false, error: "date_in_future" };

  const text = (value: unknown, max: number) =>
    typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;

  return {
    ok: true,
    value: {
      occurredAt,
      categoryKey: category.key,
      direction: category.direction,
      amountKopecks,
      // Расход никогда не «входит в базу»: на УСН «Доходы» он её не трогает.
      taxable: category.direction === "income" ? raw.taxable !== false : false,
      counterparty: text(raw.counterparty, 200),
      documentRef: text(raw.documentRef, 120),
      note: text(raw.note, 500),
    },
  };
}

export const LEDGER_ERROR_MESSAGE: Record<LedgerInputError, string> = {
  amount_invalid: "Сумма должна быть положительным числом с двумя знаками после запятой",
  amount_too_large: "Сумма выглядит опечаткой — проверьте разряды",
  category_unknown: "Неизвестная категория",
  date_invalid: "Дата в формате ГГГГ-ММ-ДД",
  date_in_future: "Дата в будущем: кассовый метод учитывает деньги днём поступления",
};
