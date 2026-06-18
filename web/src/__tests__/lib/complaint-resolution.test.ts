/**
 * Unit tests for complaint resolution + payout decision (backlog 11.C.3).
 */

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    complaint: { findUnique: jest.fn(), update: jest.fn() },
    payout: { findFirst: jest.fn(), updateMany: jest.fn() },
    booking: { update: jest.fn() },
    user: { update: jest.fn() },
    transaction: { create: jest.fn() },
    auditLog: { create: jest.fn() },
    notificationPreference: { findUnique: jest.fn() },
    notification: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/notifications", () => ({
  __esModule: true,
  notify: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/session-payment", () => ({
  __esModule: true,
  refundSessionForBooking: jest.fn().mockResolvedValue({ status: "refunded" }),
  settleSessionAfterDisputeWindow: jest.fn().mockResolvedValue({ status: "charged", priceKopecks: 300_000 }),
}));

import db from "@/lib/db";
import { resolveComplaint } from "@/lib/complaint-resolution";
import { refundSessionForBooking, settleSessionAfterDisputeWindow } from "@/lib/session-payment";

type MockedPrisma = {
  complaint: { findUnique: jest.Mock; update: jest.Mock };
  payout: { findFirst: jest.Mock; updateMany: jest.Mock };
  booking: { update: jest.Mock };
  user: { update: jest.Mock };
  transaction: { create: jest.Mock };
  auditLog: { create: jest.Mock };
  $transaction: jest.Mock;
};
const mockDb = db as unknown as MockedPrisma;

function reset() {
  mockDb.complaint.findUnique.mockReset();
  mockDb.complaint.update.mockReset();
  mockDb.payout.findFirst.mockReset();
  mockDb.payout.updateMany.mockReset();
  mockDb.booking.update.mockReset();
  mockDb.user.update.mockReset();
  mockDb.transaction.create.mockReset();
  mockDb.auditLog.create.mockReset();
  mockDb.$transaction.mockReset();
  mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) =>
    cb({
      complaint: { update: mockDb.complaint.update },
      payout: { updateMany: mockDb.payout.updateMany },
      booking: { update: mockDb.booking.update },
      user: { update: mockDb.user.update },
      transaction: { create: mockDb.transaction.create },
    }),
  );
}

const COMPLAINT_FIXTURE = {
  id: "c1",
  status: "OPEN",
  bookingId: "b1",
  booking: { id: "b1", clientId: "uClient", priceRub: 3000 },
};

describe("resolveComplaint", () => {
  beforeEach(reset);

  it("returns decision_required when transitioning to RESOLVED with HELD payout but no decision", async () => {
    mockDb.complaint.findUnique.mockResolvedValueOnce(COMPLAINT_FIXTURE);
    mockDb.payout.findFirst.mockResolvedValueOnce({ id: "po1", amountKopecks: 225_000 });

    const out = await resolveComplaint(
      { complaintId: "c1", status: "RESOLVED" },
      { userId: "uMod" },
    );

    expect(out).toEqual({
      status: "decision_required",
      heldKopecks: 225_000,
      heldPayoutId: "po1",
    });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("captures the hold and releases HELD payout when decision=release", async () => {
    mockDb.complaint.findUnique.mockResolvedValueOnce(COMPLAINT_FIXTURE);
    mockDb.payout.findFirst.mockResolvedValueOnce({ id: "po1", amountKopecks: 225_000 });
    mockDb.payout.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.complaint.update.mockResolvedValueOnce({});

    const out = await resolveComplaint(
      { complaintId: "c1", status: "RESOLVED", payoutDecision: "release" },
      { userId: "uMod" },
    );

    expect(out).toEqual({
      status: "ok",
      complaintStatus: "RESOLVED",
      payoutAction: "released",
      heldPayoutId: "po1",
    });
    expect(settleSessionAfterDisputeWindow).toHaveBeenCalledWith("b1", { releaseAnyHeldPayout: true });
    expect(mockDb.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { status: "COMPLETED" },
    });
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
  });

  it("withholds HELD payout (→ FAILED) and refunds client when decision=withhold", async () => {
    mockDb.complaint.findUnique.mockResolvedValueOnce(COMPLAINT_FIXTURE);
    mockDb.payout.findFirst.mockResolvedValueOnce({ id: "po1", amountKopecks: 225_000 });
    mockDb.payout.updateMany.mockResolvedValueOnce({ count: 1 });
    mockDb.user.update.mockResolvedValueOnce({});
    mockDb.transaction.create.mockResolvedValueOnce({});
    mockDb.complaint.update.mockResolvedValueOnce({});

    const out = await resolveComplaint(
      { complaintId: "c1", status: "RESOLVED", payoutDecision: "withhold" },
      { userId: "uMod" },
    );

    expect(out).toEqual({
      status: "ok",
      complaintStatus: "RESOLVED",
      payoutAction: "withheld",
      heldPayoutId: "po1",
    });
    expect(mockDb.payout.updateMany).toHaveBeenCalledWith({
      where: { id: "po1", status: "HELD" },
      data: expect.objectContaining({ status: "FAILED", processedAt: expect.any(Date) }),
    });
    // Z1a: возврат идёт на карту через YooKassa (refundSessionForBooking),
    // а не на ₽-баланс — баланс клиента удалён.
    expect(refundSessionForBooking).toHaveBeenCalledWith("b1", 300_000); // 3000 ₽ * 100
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(mockDb.booking.update).toHaveBeenCalledWith({
      where: { id: "b1" },
      data: { status: "REFUNDED" },
    });
  });

  it("returns payoutAction=none when no HELD payout exists (e.g. post-session complaint)", async () => {
    mockDb.complaint.findUnique.mockResolvedValueOnce(COMPLAINT_FIXTURE);
    mockDb.payout.findFirst.mockResolvedValueOnce(null);
    mockDb.complaint.update.mockResolvedValueOnce({});

    const out = await resolveComplaint(
      { complaintId: "c1", status: "RESOLVED", resolution: "Жалоба после сессии" },
      { userId: "uMod" },
    );

    expect(out).toEqual({
      status: "ok",
      complaintStatus: "RESOLVED",
      payoutAction: "none",
    });
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("does not look up payout when transitioning to non-terminal status (REVIEWING)", async () => {
    mockDb.complaint.findUnique.mockResolvedValueOnce(COMPLAINT_FIXTURE);
    mockDb.complaint.update.mockResolvedValueOnce({});

    const out = await resolveComplaint(
      { complaintId: "c1", status: "REVIEWING" },
      { userId: "uMod" },
    );

    expect(out).toEqual({
      status: "ok",
      complaintStatus: "REVIEWING",
      payoutAction: "none",
    });
    expect(mockDb.payout.findFirst).not.toHaveBeenCalled();
  });

  it("returns not_found when complaint does not exist", async () => {
    mockDb.complaint.findUnique.mockResolvedValueOnce(null);

    const out = await resolveComplaint(
      { complaintId: "missing", status: "RESOLVED", payoutDecision: "release" },
      { userId: "uMod" },
    );

    expect(out).toEqual({ status: "not_found" });
    expect(mockDb.$transaction).not.toHaveBeenCalled();
  });

  it("is idempotent — second resolve finds no HELD payout and refunds nothing", async () => {
    mockDb.complaint.findUnique.mockResolvedValueOnce(COMPLAINT_FIXTURE);
    mockDb.payout.findFirst.mockResolvedValueOnce(null); // already withheld
    mockDb.complaint.update.mockResolvedValueOnce({});

    const out = await resolveComplaint(
      { complaintId: "c1", status: "CLOSED", payoutDecision: "release" },
      { userId: "uMod" },
    );

    expect(out.status).toBe("ok");
    if (out.status !== "ok") throw new Error("expected ok");
    expect(out.payoutAction).toBe("none");
    expect(mockDb.user.update).not.toHaveBeenCalled();
    expect(mockDb.transaction.create).not.toHaveBeenCalled();
  });
});
