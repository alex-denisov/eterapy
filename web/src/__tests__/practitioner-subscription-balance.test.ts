import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466: подписка практика живёт на «Финансы → Тариф»; старый /subscription
// редиректит туда. Оплата — с баланса практика ИЛИ картой (без trial).

describe("Practitioner subscription balance flow (B466 Тариф tab)", () => {
  it("redirects the legacy subscription page into «Финансы → Тариф»", () => {
    const page = source("src/app/cabinet/practitioner/subscription/page.tsx");
    expect(page).toContain('redirect(appUrl("/practitioner/finance?tab=tariff"))');
  });

  it("keeps both payment paths on the Тариф tab (balance + card)", () => {
    const plans = source("src/app/cabinet/practitioner/finance/tariff-plans.tsx");
    // B466 R9-4 P4: эндпоинты оплаты — в общем хуке (десктоп + мобайл); кнопки — в карточках.
    const actions = source("src/app/cabinet/practitioner/finance/use-tariff-plan-actions.ts");
    expect(actions).toContain("/api/practitioner/subscriptions/start-from-earnings");
    expect(actions).toContain('checkoutSource: "practitioner_subscription_card"');
    expect(plans).toContain("С баланса");
    expect(plans).toContain("Картой");
    // Owner 2026-07-06: no free trial anywhere on practitioner plans.
    expect(plans).not.toContain("дней теста");
    expect(plans).not.toContain("бесплатно");
  });

  it("deducts internal subscription charges from practitioner earnings balance", () => {
    const balance = source("src/lib/practitioner-balance.ts");
    expect(balance).toContain("internalCharges");
    expect(balance).toContain("practitioner_earnings_balance");
    expect(balance).toContain("currentBalance = accruedNet - paidOut - pendingPayout - internalCharges");
  });

  it("drops trialDays from practitioner plans (owner: нет бесплатного периода)", () => {
    const entitlements = source("src/lib/entitlements.ts");
    const practitionerBlock = entitlements.slice(entitlements.indexOf("practitioner_pro:"));
    expect(practitionerBlock).toContain("trialDays: 0");
    expect(practitionerBlock).not.toContain("trialDays: 7");
  });
});
