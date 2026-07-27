/**
 * B591 фаза 2 — книга доходов.
 *
 * Тесты держат три инварианта, нарушение каждого стоит денег в декларации:
 *
 *  1. Правило признания дохода — ДАННЫЕ с датой начала действия и основанием,
 *     а не условие внутри формулы. Ответ бухгалтера может измениться, и тогда
 *     меняется строка правила, а не расчёт.
 *  2. Книга ничего не выдумывает. Неизвестный вид платежа, неизвестная ставка
 *     комиссии, неизвестная дата возврата — это ВИДИМАЯ проблема строки, а не
 *     подставленное «по умолчанию 35 %».
 *  3. Ни одна строка не исчезает. Сумма оборота по книге равна сумме оборота
 *     по исходным записям всегда, даже когда доход посчитать нельзя.
 */

import fs from "node:fs";
import path from "node:path";
import {
  CASH_RAIL_START,
  INCOME_RECOGNITION_RULES,
  buildIncomeBook,
  recognitionRuleFor,
  type IncomeRecord,
} from "@/lib/ip-income-book";

const AT = new Date(Date.UTC(2026, 7, 1));

function record(patch: Partial<IncomeRecord> = {}): IncomeRecord {
  return {
    id: "tx-1",
    recognizedAt: new Date(Date.UTC(2026, 6, 25)),
    provider: "robokassa",
    subject: "credits",
    turnoverKopecks: 79_000,
    commissionPercent: null,
    refunded: false,
    refundedAt: null,
    reference: "12",
    receiptReference: null,
    note: null,
    ...patch,
  };
}

describe("B591 · правила признания дохода живут как данные", () => {
  it("у каждого правила есть дата начала действия и основание", () => {
    expect(INCOME_RECOGNITION_RULES.length).toBeGreaterThan(0);
    for (const rule of INCOME_RECOGNITION_RULES) {
      expect(rule.effectiveFrom).toBeInstanceOf(Date);
      expect(rule.basis.length).toBeGreaterThan(20);
    }
  });

  it("сессия признаётся комиссией — ответ бухгалтера 2026-07-27", () => {
    expect(recognitionRuleFor("session", AT)?.recognition).toBe("commission");
  });

  it("собственные услуги платформы признаются целиком", () => {
    for (const subject of ["product", "subscription", "credits", "practitioner_ai_topup"] as const) {
      expect(recognitionRuleFor(subject, AT)?.recognition).toBe("gross");
    }
  });

  it("до даты начала действия правила нет — прошлое не переписывается задним числом", () => {
    const before = new Date(Date.UTC(2020, 0, 1));
    expect(recognitionRuleFor("session", before)).toBeNull();
  });

  it("в расчёте нет зашитых видов платежа: признание берётся только из правил", () => {
    const source = fs.readFileSync(
      path.join(process.cwd(), "src/lib/ip-income-book.ts"),
      "utf8",
    );
    const builder = source.slice(source.indexOf("export function buildIncomeBook"));
    expect(builder).not.toMatch(/"session"|"credits"|"subscription"/);
  });
});

describe("B591 · до запуска денежного рельса дохода не бывает", () => {
  // На проде лежат 33 «успешные» транзакции ЮKassa за май–июнь на 55 тысяч ₽.
  // Денег по ним не приходило: мерчантом ЮKassa платформа не была. Без отсечки
  // первая выгрузка бухгалтеру принесла бы 3 070 ₽ несуществующего дохода — и
  // налог посчитали бы с них.
  it("тестовая ЮKassa-эра не признаётся доходом, но остаётся в книге", () => {
    const { entries, totals } = buildIncomeBook(
      [record({ recognizedAt: new Date(Date.UTC(2026, 4, 8)), subject: "subscription", turnoverKopecks: 307_000 })],
      AT,
    );
    expect(entries[0].ownIncomeKopecks).toBeNull();
    expect(entries[0].issue).toMatch(/денежного рельса/i);
    expect(totals.ownIncomeKopecks).toBe(0);
    expect(totals.turnoverKopecks).toBe(307_000);
  });

  it("у отсечки есть дата и основание — это данные, а не число в условии", () => {
    expect(CASH_RAIL_START.at).toBeInstanceOf(Date);
    expect(CASH_RAIL_START.basis.length).toBeGreaterThan(20);
  });
});

describe("B591 · книга доходов считает и не выдумывает", () => {
  it("собственная услуга: доход равен обороту", () => {
    const { entries, totals } = buildIncomeBook([record()], AT);
    expect(entries[0].ownIncomeKopecks).toBe(79_000);
    expect(entries[0].issue).toBeNull();
    expect(totals.ownIncomeKopecks).toBe(79_000);
  });

  it("сессия: доходом становится только комиссия, оборот остаётся полным", () => {
    const { entries, totals } = buildIncomeBook(
      [record({ subject: "session", turnoverKopecks: 300_000, commissionPercent: 30 })],
      AT,
    );
    expect(entries[0].ownIncomeKopecks).toBe(90_000);
    expect(totals.turnoverKopecks).toBe(300_000);
    expect(totals.ownIncomeKopecks).toBe(90_000);
  });

  it("агентская строка без ставки комиссии не угадывается, а помечается", () => {
    const { entries, totals } = buildIncomeBook(
      [record({ subject: "session", turnoverKopecks: 300_000, commissionPercent: null })],
      AT,
    );
    expect(entries[0].ownIncomeKopecks).toBeNull();
    expect(entries[0].issue).toMatch(/ставк/i);
    expect(totals.ownIncomeKopecks).toBe(0);
    expect(totals.unresolvedCount).toBe(1);
    expect(totals.unresolvedTurnoverKopecks).toBe(300_000);
  });

  it("платёж неизвестного вида не пропадает и не засчитывается молча", () => {
    const { entries, totals } = buildIncomeBook([record({ subject: null })], AT);
    expect(entries[0].ownIncomeKopecks).toBeNull();
    expect(entries[0].issue).toMatch(/вид/i);
    expect(totals.turnoverKopecks).toBe(79_000);
    expect(totals.unresolvedCount).toBe(1);
  });

  it("возврат не считается доходом и показан отдельной суммой", () => {
    const { entries, totals } = buildIncomeBook(
      [
        record({ id: "a" }),
        record({ id: "b", refunded: true, refundedAt: new Date(Date.UTC(2026, 6, 28)) }),
      ],
      AT,
    );
    expect(totals.ownIncomeKopecks).toBe(79_000);
    expect(totals.refundedOwnIncomeKopecks).toBe(79_000);
    expect(entries.find((entry) => entry.id === "b")?.issue).toBeNull();
  });

  it("возврат без даты возврата помечается: база уменьшается ДАТОЙ ВОЗВРАТА", () => {
    const { entries } = buildIncomeBook([record({ refunded: true, refundedAt: null })], AT);
    expect(entries[0].issue).toMatch(/дата возврата/i);
  });

  it("оборот по книге всегда равен обороту по исходным записям", () => {
    const records = [
      record({ id: "a", turnoverKopecks: 79_000 }),
      record({ id: "b", subject: "session", turnoverKopecks: 300_000, commissionPercent: 30 }),
      record({ id: "c", subject: null, turnoverKopecks: 1_234 }),
      record({ id: "d", refunded: true, refundedAt: new Date(), turnoverKopecks: 59_000 }),
    ];
    const { totals } = buildIncomeBook(records, AT);
    expect(totals.turnoverKopecks).toBe(records.reduce((sum, item) => sum + item.turnoverKopecks, 0));
  });

  it("книга упорядочена по дате признания — это документ, а не выборка", () => {
    const { entries } = buildIncomeBook(
      [
        record({ id: "late", recognizedAt: new Date(Date.UTC(2026, 6, 30)) }),
        record({ id: "early", recognizedAt: new Date(Date.UTC(2026, 6, 21)) }),
      ],
      AT,
    );
    expect(entries.map((entry) => entry.id)).toEqual(["early", "late"]);
  });
});
