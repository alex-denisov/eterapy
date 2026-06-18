jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    booking: { findMany: jest.fn(), update: jest.fn() },
    timeSlot: { update: jest.fn() },
  },
}));

jest.mock("@/lib/notifications", () => ({
  __esModule: true,
  notify: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/session-payment", () => ({
  __esModule: true,
  captureGraceExpiredSessions: jest.fn().mockResolvedValue({ scanned: 0, captured: 0 }),
  cancelSessionHold: jest.fn().mockResolvedValue({ status: "cancelled" }),
}));

jest.mock("@/lib/session-complete", () => ({
  __esModule: true,
  completeBookingAtSessionEnd: jest.fn().mockResolvedValue({
    status: "completed",
    payout: { id: "payout-1", amountKopecks: 195_000, status: "HELD", holdReason: "dispute_window" },
  }),
}));

jest.mock("@/lib/email", () => ({
  __esModule: true,
  sendReviewRequestClient: jest.fn().mockResolvedValue(undefined),
}));

import db from "@/lib/db";
import { runBookingRemindersJob } from "@/lib/cron-jobs";
import { cancelSessionHold } from "@/lib/session-payment";
import { completeBookingAtSessionEnd } from "@/lib/session-complete";

const mockDb = db as unknown as {
  booking: { findMany: jest.Mock; update: jest.Mock };
  timeSlot: { update: jest.Mock };
};

const JOB = {
  id: "job-1",
  payload: { requestedAt: "2026-06-18T10:00:00.000Z" },
} as never;

describe("B425 cron session lifecycle", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDb.booking.update.mockResolvedValue({});
    mockDb.timeSlot.update.mockResolvedValue({});
  });

  it("settles delivered sessions through completion lifecycle and cancels holds for no-shows", async () => {
    mockDb.booking.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "completed-1",
          slot: { startAt: new Date("2026-06-18T08:00:00.000Z"), endAt: new Date("2026-06-18T09:00:00.000Z") },
          practitioner: { id: "practitioner-1" },
          client: { id: "client-1", name: "Client", email: "client@example.test" },
        },
      ])
      .mockResolvedValueOnce([
        {
          id: "expired-1",
          slotId: "slot-1",
          slot: { startAt: new Date("2026-06-18T08:00:00.000Z"), endAt: new Date("2026-06-18T09:00:00.000Z") },
          practitioner: { id: "practitioner-1" },
          client: { id: "client-1", name: "Client" },
        },
      ]);

    const result = await runBookingRemindersJob(JOB);

    expect(completeBookingAtSessionEnd).toHaveBeenCalledWith("completed-1", {
      userId: "system:cron.booking-reminders",
      isPractitioner: false,
    });
    expect(mockDb.booking.update).toHaveBeenCalledWith({
      where: { id: "expired-1" },
      data: { status: "EXPIRED" },
    });
    expect(cancelSessionHold).toHaveBeenCalledWith("expired-1");
    expect(mockDb.timeSlot.update).toHaveBeenCalledWith({
      where: { id: "slot-1" },
      data: { available: true },
    });
    expect(result).toEqual(expect.objectContaining({
      autoCompleted: 2,
      autoExpired: 1,
      processedCompleted: 1,
      processedExpired: 1,
    }));
  });
});
