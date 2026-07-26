import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserActivePlan } from "@/lib/entitlements";
import { POST as createBooking } from "@/app/api/bookings/route";
// B572: слаг версии оферты меняется вместе с датой публикации пакета —
// фикстура берёт его из источника, а не повторяет строкой.
import { AGENT_OFFER_VERSION } from "@/lib/practitioner-compliance";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => {
  const txMock = {
    booking: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
    timeSlot: {
      update: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  return {
    __esModule: true,
    default: {
      $transaction: jest.fn(async (fn: (tx: typeof txMock) => unknown) => fn(txMock)),
      practitioner: { findUnique: jest.fn() },
      booking: {
        create: jest.fn(),
        findFirst: jest.fn(),
      },
      timeSlot: {
        findUnique: jest.fn(),
        update: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
      },
      analyticsEvent: { create: jest.fn() },
      __tx: txMock,
    },
  };
});

jest.mock("@/lib/entitlements", () => ({
  __esModule: true,
  getUserActivePlan: jest.fn(),
}));

jest.mock("@/lib/email", () => ({
  __esModule: true,
  sendBookingRequestedClient: jest.fn().mockResolvedValue(undefined),
  sendBookingRequestedPractitioner: jest.fn().mockResolvedValue(undefined),
  sendBookingConfirmedClient: jest.fn().mockResolvedValue(undefined),
  sendBookingConfirmedPractitioner: jest.fn().mockResolvedValue(undefined),
  sendBookingCancelledClient: jest.fn().mockResolvedValue(undefined),
  sendBookingCancelledPractitioner: jest.fn().mockResolvedValue(undefined),
  sendReviewRequestClient: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/platform-settings", () => ({
  __esModule: true,
  getSetting: jest.fn().mockResolvedValue("false"),
}));

jest.mock("@/lib/notifications", () => ({
  __esModule: true,
  notify: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/session-payment", () => ({
  __esModule: true,
  holdSessionForBooking: jest.fn().mockResolvedValue({ status: "free" }),
  captureSessionForBooking: jest.fn(),
  cancelSessionHold: jest.fn(),
}));

jest.mock("@/lib/session-complete", () => ({
  __esModule: true,
  completeBookingAtSessionEnd: jest.fn(),
}));

jest.mock("@/lib/channel-attribution", () => ({
  __esModule: true,
  markChannelConversion: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/antifraud", () => ({
  __esModule: true,
  requestFingerprint: jest.fn(() => ({ ipHash: "ip", userAgentHash: "ua", deviceHash: "dev" })),
  logFraudEvent: jest.fn(),
}));

jest.mock("@/lib/practitioner-antifraud", () => ({
  __esModule: true,
  assessBookingRisk: jest.fn().mockResolvedValue({ shouldBlock: false, shouldReview: false, riskScore: 0, riskFlags: [] }),
}));

jest.mock("@/lib/byoc", () => ({
  __esModule: true,
  resolveByocBookingCommission: jest.fn().mockResolvedValue({
    shouldBlock: false,
    source: "PLATFORM",
    referrerPractitionerId: null,
    commissionPercentApplied: 35,
    riskFlags: [],
    firstTouchInviteId: null,
  }),
  finalizeByocBookingAttribution: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/analytics", () => ({
  __esModule: true,
  trackServerEvent: jest.fn(),
}));

jest.mock("@/lib/logger", () => ({
  __esModule: true,
  log: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db> & {
  __tx: {
    booking: { create: jest.Mock; findFirst: jest.Mock };
    timeSlot: { update: jest.Mock; findFirst: jest.Mock; create: jest.Mock };
  };
};
const mockGetUserActivePlan = getUserActivePlan as jest.MockedFunction<typeof getUserActivePlan>;

function request(body: unknown) {
  return {
    url: "https://app.eterapy.com/api/bookings",
    method: "POST",
    nextUrl: new URL("https://app.eterapy.com/api/bookings"),
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
  } as unknown as NextRequest;
}

function activePractitioner() {
  return {
    id: "prac-1",
    userId: "practitioner-user",
    status: "ACTIVE",
    verified: true,
    demoAccount: false,
    agentOfferAcceptedAt: new Date("2026-06-18T10:00:00.000Z"),
    agentOfferVersion: AGENT_OFFER_VERSION,
    taxStatus: "SELF_EMPLOYED",
    taxReviewStatus: "VERIFIED",
    taxStatusVerifiedAt: new Date("2026-06-18T10:05:00.000Z"),
    payoutDetails: { type: "CARD", inn: "123456789012", kycStatus: "NOT_REQUIRED", robokassaAccount: "eterapy-spec-01" },
    pricePerSession: 3000,
    sessionDuration: 60,
    user: { name: "Практик", email: "pro@example.com" },
  };
}

function earlySlot() {
  const now = Date.now();
  return {
    id: "slot-early",
    practitionerId: "prac-1",
    available: true,
    startAt: new Date(now + 48 * 60 * 60 * 1000),
    endAt: new Date(now + 49 * 60 * 60 * 1000),
    visibleFrom: new Date(now + 24 * 60 * 60 * 1000),
    earlyAccessFrom: new Date(now - 60 * 60 * 1000),
  };
}

describe("Z20 booking route priority gates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "client-1", role: "CLIENT" },
      expires: "2026-07-01T00:00:00.000Z",
    } as never);
    (mockDb.practitioner.findUnique as jest.Mock).mockResolvedValue(activePractitioner());
    (mockDb.timeSlot.findUnique as jest.Mock).mockResolvedValue(earlySlot());
    (mockDb.timeSlot.update as jest.Mock).mockResolvedValue({});
    // B458 (item 14): default to a repeat booking so the priority-gate tests don't
    // trip the first-booking required-context rule. Context cases override this.
    (mockDb.booking.findFirst as jest.Mock).mockResolvedValue({ id: "prev-booking" });
    mockDb.__tx.booking.create.mockResolvedValue({
      id: "booking-1",
      clientId: "client-1",
      practitionerId: "prac-1",
      priceRub: 3000,
      status: "PENDING",
      createdAt: new Date(),
      updatedAt: new Date(),
      slot: earlySlot(),
      client: { name: "Клиент", email: "client@example.com" },
    });
  });

  it("blocks non-Premium clients from booking an early-access slot before visibleFrom", async () => {
    mockGetUserActivePlan.mockResolvedValue(null as never);

    const response = await createBooking(request({ practitionerId: "prac-1", slotId: "slot-early" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("Premium");
    expect(mockDb.timeSlot.update).not.toHaveBeenCalled();
    expect(mockDb.__tx.booking.create).not.toHaveBeenCalled();
  });

  it("stores high booking priority for Premium clients who book during early access", async () => {
    mockGetUserActivePlan.mockResolvedValue({ key: "premium" } as never);

    const response = await createBooking(request({ practitionerId: "prac-1", slotId: "slot-early" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockDb.__tx.booking.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        priority: 100,
      }),
    }));
  });

  // B458 (item 14): meeting context is required server-side on a first booking
  // with a new practitioner; a repeat booking may omit it.
  it("rejects a first booking when meeting context is missing", async () => {
    mockGetUserActivePlan.mockResolvedValue({ key: "premium" } as never);
    (mockDb.booking.findFirst as jest.Mock).mockResolvedValueOnce(null); // нет прошлой записи

    const response = await createBooking(request({ practitionerId: "prac-1", slotId: "slot-early" }));

    expect(response.status).toBe(400);
    expect(mockDb.timeSlot.update).not.toHaveBeenCalled();
    expect(mockDb.__tx.booking.create).not.toHaveBeenCalled();
  });

  it("accepts a first booking when meeting context is provided", async () => {
    mockGetUserActivePlan.mockResolvedValue({ key: "premium" } as never);
    (mockDb.booking.findFirst as jest.Mock).mockResolvedValueOnce(null);

    const response = await createBooking(
      request({ practitionerId: "prac-1", slotId: "slot-early", meetingContext: "тревога перед собеседованием" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockDb.__tx.booking.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ meetingContext: "тревога перед собеседованием" }),
    }));
  });
});
