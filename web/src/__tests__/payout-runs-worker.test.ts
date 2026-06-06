import db from "@/lib/db";
import { assertPractitionerPayoutAllowed } from "@/lib/practitioner-antifraud";
import { emitPayoutScheduled } from "@/lib/payout-notifications";
import { runPayoutRun } from "@/lib/payout-runs";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    payoutRun: {
      upsert: jest.fn(),
      update: jest.fn(),
    },
    payout: {
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/practitioner-antifraud", () => ({
  assertPractitionerPayoutAllowed: jest.fn(),
}));

jest.mock("@/lib/payout-notifications", () => ({
  emitPayoutScheduled: jest.fn(),
}));

const mockDb = db as unknown as {
  payoutRun: { upsert: jest.Mock; update: jest.Mock };
  payout: { findMany: jest.Mock };
  $transaction: jest.Mock;
};
const mockAssertPractitionerPayoutAllowed = assertPractitionerPayoutAllowed as jest.Mock;
const mockEmitPayoutScheduled = emitPayoutScheduled as jest.Mock;

describe("runPayoutRun worker", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.payoutRun.upsert.mockResolvedValue({ id: "run-1" });
    mockDb.payoutRun.update.mockResolvedValue({ id: "run-1", status: "RUNNING" });
    mockDb.payout.findMany.mockResolvedValue([
      {
        id: "payout-1",
        practitionerId: "practitioner-1",
        amountKopecks: 100_000,
        reserveKopecks: 5_000,
        practitioner: { payoutDetails: { type: "CARD", kycStatus: "NOT_REQUIRED" } },
      },
      {
        id: "payout-2",
        practitionerId: "practitioner-1",
        amountKopecks: 80_000,
        reserveKopecks: 4_000,
        practitioner: { payoutDetails: { type: "CARD", kycStatus: "NOT_REQUIRED" } },
      },
    ]);
    mockDb.$transaction.mockImplementation(async (callback: (tx: unknown) => Promise<void>) => callback({
      payout: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
      payoutRun: { update: jest.fn().mockResolvedValue({}) },
    }));
    mockAssertPractitionerPayoutAllowed.mockResolvedValue({ allowed: true, reasons: [] });
    mockEmitPayoutScheduled.mockResolvedValue(undefined);
  });

  it("deduplicates anti-fraud gate checks by practitioner within one payout run", async () => {
    await runPayoutRun({
      payoutRunId: "run-1",
      scheduledFor: new Date("2026-06-15T00:00:00.000Z"),
      now: new Date("2026-06-16T09:00:00.000Z"),
      initiatedBy: "cron",
    });

    expect(mockAssertPractitionerPayoutAllowed).toHaveBeenCalledTimes(1);
    expect(mockAssertPractitionerPayoutAllowed).toHaveBeenCalledWith("practitioner-1");
  });

  it("does not overwrite a completed payout run on retry", async () => {
    mockDb.payoutRun.upsert.mockResolvedValueOnce({
      id: "run-1",
      status: "COMPLETED",
      scheduledFor: new Date("2026-06-15T00:00:00.000Z"),
      candidateCount: 2,
      processingCount: 2,
      heldCount: 0,
      totalAmountKopecks: 180_000,
      totalDisbursedKopecks: 171_000,
      totalReserveKopecks: 9_000,
    });

    const result = await runPayoutRun({
      payoutRunId: "run-1",
      scheduledFor: new Date("2026-06-15T00:00:00.000Z"),
      now: new Date("2026-06-16T09:00:00.000Z"),
      initiatedBy: "cron",
    });

    expect(mockDb.payout.findMany).not.toHaveBeenCalled();
    expect(mockDb.$transaction).not.toHaveBeenCalled();
    expect(mockEmitPayoutScheduled).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      ok: true,
      payoutRunId: "run-1",
      alreadyCompleted: true,
      candidateCount: 2,
      totalDisbursedKopecks: 171_000,
    }));
  });
});
