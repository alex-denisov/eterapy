import { robokassaPayoutProvider, resolvePayoutProvider } from "@/lib/payments/payout-provider";

/**
 * B562 — выбор провайдера выплат.
 *
 * Шаг 1: интерфейс есть, ЮKassa-путь работает как работал, Robokassa падает
 * ЗАКРЫТО. Реализация выплат Robokassa не пишется по догадке — у их выплат
 * отдельный продукт и отдельный API, контракта у нас нет. Имитация успеха здесь
 * стоила бы дороже отказа: вызывающий пометил бы выплату исполненной и списал
 * баланс специалиста, хотя деньги никуда не ушли.
 */
describe("B562 — провайдер выплат выбирается, а не импортируется", () => {
  const saved = process.env.PAYMENT_PROVIDER;
  afterEach(() => {
    if (saved === undefined) delete process.env.PAYMENT_PROVIDER;
    else process.env.PAYMENT_PROVIDER = saved;
  });

  // ТРЕБОВАНИЕ ИЗМЕНЕНО 2026-07-22 (B570): владелец отключил ЮKassu навсегда,
  // и `activePaymentProvider()` теперь всегда `robokassa`. Значит выплата
  // по умолчанию выбирает Robokassa — то есть падает ЗАКРЫТО.
  //
  // ⚠ СЛЕДСТВИЕ ДЛЯ ЭКСПЛУАТАЦИИ: авто-выплат специалистам больше нет, админ
  // проводит их вручную, пока не подключён API выплат Robokassa (B562 шаг 2).
  // Потери функции при этом нет: ЮKassa мерчантом не подключалась, её выплаты
  // на проде тоже никогда не проходили.
  it("по умолчанию выбирается Robokassa — то есть авто-выплата закрыта", async () => {
    delete process.env.PAYMENT_PROVIDER;
    const provider = await resolvePayoutProvider();
    expect(provider.name).toBe("robokassa");
    expect(provider.supportsAutoPayout({ type: "CARD", accountNumber: "5555444433332222" })).toBe(false);
  });

  it("ЮKassa-путь достижим только явным аргументом — на случай разбора старых выплат", async () => {
    const provider = await resolvePayoutProvider("yookassa");
    expect(provider.name).toBe("yookassa");
    expect(provider.supportsAutoPayout({ type: "CARD", accountNumber: "5555444433332222" })).toBe(true);
    expect(provider.supportsAutoPayout({ type: "SBP", accountNumber: "+79990001122" })).toBe(false);
  });

  it("Robokassa не берётся за авто-выплату ни по каким реквизитам", () => {
    for (const type of ["CARD", "SBP", "ENTITY", "ROBOKASSA"]) {
      expect(robokassaPayoutProvider.supportsAutoPayout({ type, accountNumber: "x" })).toBe(false);
    }
  });

  it("Robokassa возвращает FAILED с внятной причиной, а не мнимый успех", async () => {
    const result = await robokassaPayoutProvider.send({
      payoutId: "pay-9",
      details: { type: "CARD", accountNumber: "5555444433332222" },
      amountKopecks: 250_000,
    });
    expect(result.status).toBe("FAILED");
    expect(result.status === "FAILED" && result.error).toContain("pay-9");
    expect(result.status === "FAILED" && result.error).toMatch(/вручную/);
  });
});
