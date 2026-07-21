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

  it("по умолчанию — прежний ЮKassa-путь, поведение не изменилось", async () => {
    delete process.env.PAYMENT_PROVIDER;
    const provider = await resolvePayoutProvider();
    expect(provider.name).toBe("yookassa");
    expect(provider.supportsAutoPayout({ type: "CARD", accountNumber: "5555444433332222" })).toBe(true);
    expect(provider.supportsAutoPayout({ type: "SBP", accountNumber: "+79990001122" })).toBe(false);
    expect(provider.supportsAutoPayout({ type: "ENTITY", accountNumber: "40702810" })).toBe(false);
  });

  it("при PAYMENT_PROVIDER=robokassa выбирается Robokassa", async () => {
    process.env.PAYMENT_PROVIDER = "robokassa";
    expect((await resolvePayoutProvider()).name).toBe("robokassa");
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
