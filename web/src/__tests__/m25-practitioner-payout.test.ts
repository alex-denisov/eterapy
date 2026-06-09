/**
 * B352 / Баг 12 — реальные выплаты практикам через ЮKassa.
 */
const yk = { createPayout: jest.fn() };
jest.mock("@/lib/yukassa", () => ({ __esModule: true, ...yk }));

const mockDb = { payout: { update: jest.fn() } };
jest.mock("@/lib/db", () => ({ __esModule: true, default: mockDb }));

import { readFileSync } from "fs";
import { join } from "path";
import { payoutDestinationFromDetails, sendPractitionerPayout } from "@/lib/practitioner-payout";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.payout.update.mockResolvedValue({});
});

describe("B352 — payout destination mapping", () => {
  it("maps a CARD to a bank_card destination", () => {
    expect(payoutDestinationFromDetails({ type: "CARD", accountNumber: "5555444433332222" }))
      .toEqual({ type: "bank_card", cardNumber: "5555444433332222" });
  });
  it("returns null for SBP/ENTITY (manual payout)", () => {
    expect(payoutDestinationFromDetails({ type: "SBP", accountNumber: "+79990001122" })).toBeNull();
    expect(payoutDestinationFromDetails({ type: "ENTITY", accountNumber: "40702810..." })).toBeNull();
  });
});

describe("B352 — sendPractitionerPayout", () => {
  const dest = { type: "bank_card" as const, cardNumber: "5555444433332222" };

  it("marks DONE on a succeeded payout and records the external id", async () => {
    yk.createPayout.mockResolvedValueOnce({ id: "po-1", status: "succeeded" });
    const res = await sendPractitionerPayout("pay-1", dest, 250_000);
    expect(yk.createPayout).toHaveBeenCalledWith(expect.objectContaining({ payoutId: "pay-1", amountKopecks: 250_000, destination: dest }));
    expect(res).toEqual({ status: "DONE", externalId: "po-1" });
    expect(mockDb.payout.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pay-1" }, data: expect.objectContaining({ status: "DONE", externalId: "po-1" }),
    }));
  });

  it("marks PROCESSING when the provider returns pending", async () => {
    yk.createPayout.mockResolvedValueOnce({ id: "po-2", status: "pending" });
    const res = await sendPractitionerPayout("pay-2", dest, 100_000);
    expect(res).toEqual({ status: "PROCESSING", externalId: "po-2" });
  });

  it("marks FAILED (never throws) when the provider rejects or errors", async () => {
    yk.createPayout.mockResolvedValueOnce({ id: "po-3", status: "canceled" });
    const cancelled = await sendPractitionerPayout("pay-3", dest, 100_000);
    expect(cancelled.status).toBe("FAILED");

    yk.createPayout.mockRejectedValueOnce(new Error("payouts not enabled"));
    const errored = await sendPractitionerPayout("pay-4", dest, 100_000);
    expect(errored.status).toBe("FAILED");
    expect(mockDb.payout.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "pay-4" }, data: expect.objectContaining({ status: "FAILED" }),
    }));
  });
});

describe("B352 — wiring", () => {
  it("the payout route sends a real ЮKassa payout by реквизиты", () => {
    const route = source("src/app/api/admin/practitioners/[id]/payout/route.ts");
    expect(route).toContain("payoutDestinationFromDetails");
    expect(route).toContain("sendPractitionerPayout");
    expect(route).toContain("payoutDetails.findUnique");
    expect(route).toContain("не указаны платёжные реквизиты");
  });

  it("the admin panel calls the payout endpoint (no placeholder) for single + bulk", () => {
    const panel = source("src/app/admin/payments/payments-panel.tsx");
    expect(panel).toContain("/payout`, { method: \"POST\" }");
    expect(panel).not.toContain("Placeholder — реальная выплата");
    expect(panel).toContain("markSelectedPaid");
  });
});
