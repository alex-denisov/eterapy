/**
 * B591 — ручные приходы и расходы вне платёжного рельса.
 *
 * Главное, что здесь удерживается тестом: на УСН «Доходы» 6 % расход НЕ
 * уменьшает базу, а приход, помеченный «не в базу» (перевод себе, возврат
 * поставщика), в неё не попадает. Ошибка в любую сторону — это неверная сумма
 * налога.
 */
import {
  LEDGER_CATEGORIES,
  categoryByKey,
  parseRubToKopecks,
  summarizeManualLedger,
  validateLedgerInput,
  type ManualLedgerEntry,
} from "@/lib/ip-manual-ledger";

const entry = (over: Partial<ManualLedgerEntry>): ManualLedgerEntry => ({
  id: "e1",
  occurredAt: new Date("2026-07-25T00:00:00.000Z"),
  direction: "income",
  categoryKey: "income_invoice",
  amountKopecks: 100_00,
  taxable: true,
  counterparty: null,
  documentRef: null,
  note: null,
  ...over,
});

describe("summarizeManualLedger", () => {
  it("расход не смешивается с доходом и не уменьшает базу", () => {
    const totals = summarizeManualLedger([
      entry({ id: "1", amountKopecks: 10_000_00 }),
      entry({ id: "2", direction: "expense", categoryKey: "expense_infra", amountKopecks: 4_000_00, taxable: false }),
    ]);

    expect(totals.taxableIncomeKopecks).toBe(10_000_00);
    expect(totals.expenseKopecks).toBe(4_000_00);
    expect(totals.incomeCount).toBe(1);
    expect(totals.expenseCount).toBe(1);
  });

  it("приход вне базы считается отдельно, а не исчезает", () => {
    const totals = summarizeManualLedger([
      entry({ id: "1", amountKopecks: 5_000_00, taxable: true }),
      entry({ id: "2", categoryKey: "income_personal", amountKopecks: 30_000_00, taxable: false }),
    ]);

    expect(totals.taxableIncomeKopecks).toBe(5_000_00);
    expect(totals.nonTaxableIncomeKopecks).toBe(30_000_00);
  });
});

describe("validateLedgerInput", () => {
  const now = new Date("2026-07-27T12:00:00.000Z");

  it("принимает корректную строку и переводит рубли в копейки", () => {
    const result = validateLedgerInput(
      { occurredAt: "2026-07-20", categoryKey: "expense_bank", amountRub: "1 200,50", counterparty: "  Банк  " },
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.amountKopecks).toBe(120_050);
    expect(result.value.direction).toBe("expense");
    expect(result.value.counterparty).toBe("Банк");
  });

  it("расход никогда не попадает в базу, даже если так попросили", () => {
    const result = validateLedgerInput(
      { occurredAt: "2026-07-20", categoryKey: "expense_infra", amountRub: "100", taxable: true },
      now,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.taxable).toBe(false);
  });

  it("отвергает дату в будущем — кассовый метод не знает будущих денег", () => {
    const result = validateLedgerInput(
      { occurredAt: "2027-01-10", categoryKey: "income_invoice", amountRub: "100" },
      now,
    );
    expect(result).toEqual({ ok: false, error: "date_in_future" });
  });

  it.each([
    ["", "amount_invalid"],
    ["0", "amount_invalid"],
    ["-5", "amount_invalid"],
    ["12,345", "amount_invalid"],
    ["999999999", "amount_too_large"],
  ])("отвергает сумму %p", (amountRub, code) => {
    const result = validateLedgerInput({ occurredAt: "2026-07-20", categoryKey: "income_invoice", amountRub }, now);
    expect(result).toEqual({ ok: false, error: code });
  });

  it("отвергает неизвестную категорию", () => {
    const result = validateLedgerInput({ occurredAt: "2026-07-20", categoryKey: "nope", amountRub: "100" }, now);
    expect(result).toEqual({ ok: false, error: "category_unknown" });
  });
});

describe("справочник категорий", () => {
  it("у каждой категории направление совпадает с префиксом ключа", () => {
    for (const category of LEDGER_CATEGORIES) {
      expect(category.key.startsWith(category.direction)).toBe(true);
      expect(categoryByKey(category.key)).toEqual(category);
    }
  });

  it("ключи не повторяются", () => {
    const keys = LEDGER_CATEGORIES.map((category) => category.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("parseRubToKopecks", () => {
  it.each([
    ["100", 10_000],
    ["100.5", 10_050],
    ["100,50", 10_050],
    ["1 000", 100_000],
  ])("%p → %p копеек", (raw, expected) => {
    expect(parseRubToKopecks(raw)).toBe(expected);
  });

  it("не принимает три знака после запятой", () => {
    expect(parseRubToKopecks("10.555")).toBeNull();
  });
});
