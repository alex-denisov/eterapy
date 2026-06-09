import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

// B351 / Баг 16 — 24h-grace escrow capture (spec: «после 24ч grace переводится
// платформе»). Captures held CONFIRMED bookings whose session ended >24h ago.

jest.mock("@/lib/yukassa", () => ({
  __esModule: true,
  createTwoStagePayment: jest.fn(),
  createTwoStagePaymentFromSavedMethod: jest.fn(),
  capturePayment: jest.fn(),
  cancelPayment: jest.fn(),
  createRefund: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    booking: { findMany: jest.fn(), findUnique: jest.fn(), updateMany: jest.fn() },
  },
}));

import { captureGraceExpiredSessions } from "@/lib/session-payment";
import db from "@/lib/db";

const mockDb = db as unknown as {
  booking: { findMany: jest.Mock; findUnique: jest.Mock; updateMany: jest.Mock };
};

const NOW = new Date("2026-06-09T18:00:00.000Z");

beforeEach(() => jest.clearAllMocks());

describe("captureGraceExpiredSessions", () => {
  it("queries CONFIRMED held bookings whose slot ended before now-24h", async () => {
    mockDb.booking.findMany.mockResolvedValue([]);
    await captureGraceExpiredSessions(NOW);

    const where = mockDb.booking.findMany.mock.calls[0][0].where;
    expect(where.status).toBe("CONFIRMED");
    expect(where.paymentId).toEqual({ not: null });
    const cutoff = where.slot.endAt.lte as Date;
    expect(cutoff.getTime()).toBe(NOW.getTime() - 24 * 60 * 60 * 1000);
  });

  it("captures each due booking (free session → charged) and counts it", async () => {
    mockDb.booking.findMany.mockResolvedValue([{ id: "bk-1" }, { id: "bk-2" }]);
    // captureSessionForBooking path: findUnique returns a free CONFIRMED booking,
    // updateMany flips it → status "charged".
    mockDb.booking.findUnique.mockResolvedValue({
      id: "bk-1", clientId: "c1", priceRub: 0, status: "CONFIRMED", paymentId: null,
      practitioner: { userId: "p1" },
    });
    mockDb.booking.updateMany.mockResolvedValue({ count: 1 });

    const res = await captureGraceExpiredSessions(NOW);
    expect(res.scanned).toBe(2);
    expect(res.captured).toBe(2);
  });

  it("honours a custom grace window", async () => {
    mockDb.booking.findMany.mockResolvedValue([]);
    await captureGraceExpiredSessions(NOW, 48);
    const cutoff = mockDb.booking.findMany.mock.calls[0][0].where.slot.endAt.lte as Date;
    expect(cutoff.getTime()).toBe(NOW.getTime() - 48 * 60 * 60 * 1000);
  });
});

describe("B351 cron wiring", () => {
  it("registers cron.session-escrow-capture + route + PRODUCT_CRONS entry", () => {
    expect(source("src/lib/cron-jobs.ts")).toContain("cron.session-escrow-capture");
    expect(source("src/app/api/cron/session-escrow-capture/route.ts")).toContain("cron.session-escrow-capture");
    expect(source("src/lib/admin-system-status.ts")).toContain("/api/cron/session-escrow-capture");
  });
});
