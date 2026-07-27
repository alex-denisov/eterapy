import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const page = read("src/components/cabinet/billing-panel.tsx");

describe("W12/Z1-Ф1 — billing saved-card wallet (no ₽ balance rail)", () => {
  it("removes the ₽ balance + top-up wallet block", () => {
    // Z1-Ф1: the client ₽ balance rail is gone — no balance figure, no top-up.
    expect(page).not.toContain('data-testid="client-wallet-balance"');
    expect(page).not.toContain('data-testid="client-topup-submit"');
    expect(page).not.toContain("Оплатить другой картой");
    expect(page).not.toContain("handlePayWithSavedCard");
  });

  it("B602: блока «Карты» больше нет — ни блока, ни заглушки", () => {
    // Владелец 2026-07-27: «можешь убрать тогда блок "Карты", а не оставлять
    // заглушку». Блок и не мог работать: привязка снята в INC-084, а Robokassa
    // токена карты не отдаёт — показывать в нём нечего.
    expect(page).not.toContain('data-testid="client-saved-cards"');
    expect(page).not.toContain('data-testid="client-saved-card"');
    expect(page).not.toContain("handleSetDefaultCard");
    expect(page).not.toContain("Сохранённых карт нет");
    expect(page).not.toContain("/api/billing/save-card");
  });

  it("B602: подписка не списывается сохранённой картой без экрана суммы", () => {
    // Красный флаг проекта B602: один клик по «Оформить картой» уводил деньги
    // через `pay-with-saved-card` — без подтверждения суммы.
    expect(page).not.toContain("/api/billing/pay-with-saved-card");
    expect(page).toContain("/api/billing/create-payment");
  });
});
