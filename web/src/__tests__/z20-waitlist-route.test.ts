import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserActivePlan } from "@/lib/entitlements";
import { POST as joinWaitlist, DELETE as cancelWaitlist } from "@/app/api/waitlist/route";
import { PATCH as patchBookingById } from "@/app/api/bookings/[id]/route";
import { promoteWaitlistForReleasedSlot } from "@/lib/priority-booking";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    practitioner: { findUnique: jest.fn() },
    timeSlot: { findUnique: jest.fn(), update: jest.fn() },
    bookingWaitlistEntry: {
      findFirst: jest.fn(),
      count: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    booking: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    analyticsEvent: { create: jest.fn() },
  },
}));

jest.mock("@/lib/entitlements", () => ({
  __esModule: true,
  getUserActivePlan: jest.fn(),
}));

jest.mock("@/lib/priority-booking", () => {
  const actual = jest.requireActual("@/lib/priority-booking");
  return {
    __esModule: true,
    ...actual,
    promoteWaitlistForReleasedSlot: jest.fn().mockResolvedValue({ status: "no_candidate" }),
  };
});

jest.mock("@/lib/email", () => ({
  __esModule: true,
  sendBookingConfirmedClient: jest.fn().mockResolvedValue(undefined),
  sendBookingCancelledClient: jest.fn().mockResolvedValue(undefined),
  sendBookingCancelledPractitioner: jest.fn().mockResolvedValue(undefined),
  sendReviewRequestClient: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/notifications", () => ({
  __esModule: true,
  notify: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("@/lib/session-complete", () => ({
  __esModule: true,
  completeBookingAtSessionEnd: jest.fn(),
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
const mockDb = db as jest.Mocked<typeof db>;
const mockGetUserActivePlan = getUserActivePlan as jest.MockedFunction<typeof getUserActivePlan>;
const mockPromote = promoteWaitlistForReleasedSlot as jest.MockedFunction<typeof promoteWaitlistForReleasedSlot>;

function request(url: string, method: string, body?: unknown) {
  return {
    url,
    method,
    nextUrl: new URL(url),
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body ?? {},
  } as unknown as NextRequest;
}

function activeSession(userId = "client-1", role = "CLIENT") {
  mockAuth.mockResolvedValue({
    user: { id: userId, role },
    expires: "2026-07-01T00:00:00.000Z",
  } as never);
}

describe("Z20 waitlist route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    activeSession();
    mockGetUserActivePlan.mockResolvedValue({ key: "premium" } as never);
    (mockDb.practitioner.findUnique as jest.Mock).mockResolvedValue({
      id: "prac-1",
      status: "ACTIVE",
      verified: true,
    });
    (mockDb.timeSlot.findUnique as jest.Mock).mockResolvedValue({
      id: "slot-1",
      practitionerId: "prac-1",
      startAt: new Date("2026-06-08T12:00:00.000Z"),
      endAt: new Date("2026-06-08T13:00:00.000Z"),
    });
    (mockDb.bookingWaitlistEntry.count as jest.Mock).mockResolvedValue(0);
  });

  it("creates an idempotent Premium waitlist entry with priority", async () => {
    (mockDb.bookingWaitlistEntry.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.bookingWaitlistEntry.create as jest.Mock).mockResolvedValue({
      id: "wait-1",
      status: "ACTIVE",
      priority: 100,
      startAt: new Date("2026-06-08T12:00:00.000Z"),
      endAt: new Date("2026-06-08T13:00:00.000Z"),
    });

    const response = await joinWaitlist(request("https://app.eterapy.com/api/waitlist", "POST", {
      practitionerId: "prac-1",
      slotId: "slot-1",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.waitlistEntry.priority).toBe(100);
    expect(mockDb.bookingWaitlistEntry.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        clientId: "client-1",
        practitionerId: "prac-1",
        slotId: "slot-1",
        priority: 100,
        planKey: "premium",
      }),
    }));
  });

  it("cancels only the current user's active waitlist entry", async () => {
    (mockDb.bookingWaitlistEntry.updateMany as jest.Mock).mockResolvedValue({ count: 1 });

    const response = await cancelWaitlist(request("https://app.eterapy.com/api/waitlist", "DELETE", {
      waitlistId: "wait-1",
    }));

    expect(response.status).toBe(200);
    expect(mockDb.bookingWaitlistEntry.updateMany).toHaveBeenCalledWith({
      where: { id: "wait-1", clientId: "client-1", status: "ACTIVE" },
      data: { status: "CANCELLED" },
    });
  });

  it("caps active waitlist entries per client", async () => {
    (mockDb.bookingWaitlistEntry.findFirst as jest.Mock).mockResolvedValue(null);
    (mockDb.bookingWaitlistEntry.count as jest.Mock).mockResolvedValue(20);

    const response = await joinWaitlist(request("https://app.eterapy.com/api/waitlist", "POST", {
      practitionerId: "prac-1",
      slotId: "slot-1",
    }));

    expect(response.status).toBe(429);
    expect(mockDb.bookingWaitlistEntry.create).not.toHaveBeenCalled();
  });

  it("tries waitlist promotion when an occupied slot is cancelled", async () => {
    (mockDb.booking.findUnique as jest.Mock).mockResolvedValue({
      id: "booking-1",
      clientId: "client-1",
      practitionerId: "prac-1",
      slotId: "slot-1",
      status: "PENDING",
      priceRub: 3000,
      client: { name: "Клиент", email: "client@example.com" },
      practitioner: {
        id: "prac-1",
        userId: "practitioner-user",
        user: { name: "Практик", email: "pro@example.com" },
      },
      slot: {
        id: "slot-1",
        startAt: new Date("2026-06-08T12:00:00.000Z"),
        endAt: new Date("2026-06-08T13:00:00.000Z"),
      },
    });
    (mockDb.booking.update as jest.Mock).mockResolvedValue({});
    (mockDb.timeSlot.update as jest.Mock).mockResolvedValue({});

    const response = await patchBookingById(
      request("https://app.eterapy.com/api/bookings/booking-1", "PATCH", { status: "CANCELLED" }),
      { params: Promise.resolve({ id: "booking-1" }) },
    );

    expect(response.status).toBe(200);
    expect(mockPromote).toHaveBeenCalledWith(expect.objectContaining({ slotId: "slot-1" }));
  });
});
