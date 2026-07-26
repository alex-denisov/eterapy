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

  it("keeps the saved-card management block (the card rail for sessions/subscriptions)", () => {
    expect(page).toContain('data-testid="client-saved-cards"');
    expect(page).toContain('data-testid="client-saved-card"');
    expect(page).toContain("handleSetDefaultCard");
  });

  it("the add-card tile says «Привязать карту» when empty, «Ещё карта» otherwise (Баг 8)", () => {
    // INC-084: плитка «Привязать карту» вела в ЮKassa — к провайдеру, с которым
    // платформа больше не работает. Снята до рекуррентных платежей Robokassa.
    expect(page).not.toContain("Ещё карта");
    expect(page).toContain("Сохранённых карт нет");
    expect(page).not.toContain('linkedCards.length === 0 ? "Привязать карту" : "Ещё карта"');
    expect(page).not.toContain("/api/billing/save-card");
  });
});
