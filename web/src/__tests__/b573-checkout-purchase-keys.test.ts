import { CREDIT_PACKS, resolveBillingPurchase } from "@/lib/entitlements";
import { miniAppOffers } from "@/lib/miniapp/journey-data";
import { purchaseBodyFor } from "@/lib/miniapp/purchase-body";

// B573 — ключи витрины мини-аппа ПРЕФИКСОВАНЫ видом покупки
// (`credits:pack-10`, `plan:premium`, `service:<productKey>`), а прейскурант
// знает их без префикса.
//
// Найдено при подключении оплаты звёздами: экран оплаты ВСЕГДА слал
// `productKey`, даже когда покупали пакет баллов или подписку. То есть на
// карте эти два предложения не оплачивались вовсе — запрос падал на разборе
// покупки. Дефект тихий: кнопка есть, ошибка общая («не удалось открыть
// оплату»), а причина — в ключе.

describe("B573 — ключ предложения доезжает до прейскуранта", () => {
  it("пакет баллов уходит как creditPackKey без префикса", () => {
    const body = purchaseBodyFor(
      { key: "credits:pack-10", kind: "credits" },
      "test",
    );
    expect(body).toMatchObject({ creditPackKey: "pack-10" });
    expect(CREDIT_PACKS["pack-10"]).toBeDefined();
  });

  it("подписка уходит как planKey без префикса", () => {
    const body = purchaseBodyFor(
      { key: "plan:premium", kind: "subscription" },
      "test",
    );
    expect(body).toMatchObject({ planKey: "premium" });
  });

  it("услуга уходит как productKey без префикса", () => {
    const body = purchaseBodyFor(
      { key: "service:deep-report", kind: "service" },
      "test",
    );
    expect(body).toMatchObject({ productKey: "deep-report" });
  });

  it("КАЖДОЕ предложение витрины разбирается прейскурантом", () => {
    // Главный тест: он ловит рассинхрон каталога и прейскуранта целиком, а не
    // три вручную выписанных случая.
    const offers = miniAppOffers();
    expect(offers.length).toBeGreaterThan(0);

    for (const offer of offers) {
      const body = purchaseBodyFor(offer, "test");
      expect(() => resolveBillingPurchase(body)).not.toThrow();
      const purchase = resolveBillingPurchase(body);
      expect(purchase.amountKopecks).toBeGreaterThan(0);
    }
  });
});
