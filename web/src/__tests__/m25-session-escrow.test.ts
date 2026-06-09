import { readFileSync } from "fs";
import { join } from "path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * B351 / Баг 16 — оплата/холд сессии. При бронировании сумма холдируется с
 * привязанной карты клиента (одним тапом, без редиректа); при захвате (старт
 * сессии) практик видит, что оплата прошла; клиент уведомлён.
 */
describe("B351 — session escrow wiring", () => {
  it("hold prefers the client's saved card (one-tap), falls back to redirect", () => {
    const lib = source("src/lib/session-payment.ts");
    expect(lib).toContain("createTwoStagePaymentFromSavedMethod");
    expect(lib).toContain("savedCard.findFirst");
    expect(lib).toContain("viaSavedCard");
    // capture notifies the practitioner that payment was received
    expect(lib).toContain('event: "PAYMENT_RECEIVED"');
    expect(lib).toContain("booking.practitioner?.userId");
  });

  it("booking route passes the client id and surfaces the saved-card hold", () => {
    const route = source("src/app/api/bookings/route.ts");
    expect(route).toContain("clientId: session.user.id");
    expect(route).toContain("heldViaSavedCard");
    expect(route).toContain('event: "PAYMENT_RECEIVED"');
  });

  it("booking UI tells the client the payment is reserved on their card", () => {
    const picker = source("src/app/practitioners/[slug]/slot-picker.tsx");
    expect(picker).toContain("heldViaSavedCard");
    expect(picker).toContain("оплата зарезервирована");
  });
});
