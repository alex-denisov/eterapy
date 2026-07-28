import { parseBankStatement, parseRobokassaReceiptExport } from "@/lib/finance-import";

describe("B591 · импорт бухгалтерских данных", () => {
  it("предпросмотр банковской выписки различает приход и расход и не признаёт приход доходом автоматически", () => {
    const rows = parseBankStatement([
      "Дата операции;Приход;Расход;Контрагент;Номер документа;Назначение платежа",
      "28.07.2026;12 500,50;;ООО Ромашка;14;Оплата по счёту",
      "28.07.2026;;1 200,00;Хостинг;15;Сервер",
    ].join("\n"));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      direction: "income",
      amountKopecks: 1_250_050,
      taxable: false,
      categoryKey: "income_other_rail",
    });
    expect(rows[1]).toMatchObject({
      direction: "expense",
      amountKopecks: 120_000,
      taxable: false,
      categoryKey: "expense_other",
    });
    expect(rows[0].importKey).not.toBe(rows[1].importKey);
  });

  it("не теряет копейки в выписках с точкой и понимает точку как разделитель тысяч", () => {
    const rows = parseBankStatement([
      "Дата;Сумма;Назначение",
      "28.07.2026;12500.50;Приход с точкой",
      "29.07.2026;-1.200,25;Расход с группировкой",
    ].join("\n"));
    expect(rows.map((row) => row.amountKopecks)).toEqual([1_250_050, 120_025]);
    expect(rows.map((row) => row.direction)).toEqual(["income", "expense"]);
  });

  it("выгрузка Robokassa сопоставляется по InvId и сохраняет исходный статус", () => {
    expect(parseRobokassaReceiptExport([
      "InvId;ReceiptStatus;ReceiptId;Ошибка",
      "70;fiscalized;FN-1/FD-2/FP-3;",
    ].join("\n"))).toEqual([{
      invoiceId: 70,
      status: "fiscalized",
      reference: "FN-1/FD-2/FP-3",
      error: null,
    }]);
  });
});
