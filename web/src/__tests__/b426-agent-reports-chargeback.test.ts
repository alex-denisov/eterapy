import db from "@/lib/db";
import { addBusinessDays, autoAcceptAgentReports } from "@/lib/agent-reports";
import { recordChargebackClawback } from "@/lib/chargeback-evidence";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    agentReport: { updateMany: jest.fn() },
    booking: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/antifraud", () => ({
  logFraudEvent: jest.fn(),
}));

const mockDb = db as unknown as {
  agentReport: { updateMany: jest.Mock };
  booking: { findUnique: jest.Mock };
  $transaction: jest.Mock;
};

describe("B426 agent reports and chargeback clawback", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("auto-accepts agent reports after three business days, skipping weekends", async () => {
    expect(addBusinessDays(new Date("2026-06-19T09:00:00.000Z"), 3).toISOString())
      .toBe("2026-06-24T09:00:00.000Z");

    const now = new Date("2026-06-24T09:00:00.000Z");
    mockDb.agentReport.updateMany.mockResolvedValue({ count: 2 });
    await autoAcceptAgentReports(now);
    expect(mockDb.agentReport.updateMany).toHaveBeenCalledWith({
      where: { status: "ISSUED", autoAcceptAt: { lte: now }, objectedAt: null },
      data: { status: "ACCEPTED", acceptedAt: now },
    });
  });

  it("creates a future-payout clawback hold after a chargeback", async () => {
    mockDb.booking.findUnique.mockResolvedValue({ practitionerId: "practitioner-1" });
    mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) => callback({
      payout: { updateMany: jest.fn().mockResolvedValue({ count: 3 }) },
      practitioner: { update: jest.fn().mockResolvedValue({}) },
      fraudEvent: { create: jest.fn().mockResolvedValue({}) },
    }));

    const result = await recordChargebackClawback({
      bookingId: "booking-1",
      amountKopecks: 50_000,
      actorUserId: "admin-1",
    });

    expect(result).toEqual({ practitionerId: "practitioner-1", heldFuturePayouts: 3 });
  });
});
