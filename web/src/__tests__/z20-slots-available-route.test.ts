import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserActivePlan } from "@/lib/entitlements";
import { GET as getAvailableSlots } from "@/app/api/slots/available/route";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    scheduleRule: { findUnique: jest.fn() },
    blockedSlot: { findMany: jest.fn() },
    booking: { findMany: jest.fn() },
    timeSlot: { findMany: jest.fn() },
    analyticsEvent: { create: jest.fn().mockResolvedValue({}) },
  },
}));

jest.mock("@/lib/entitlements", () => ({
  __esModule: true,
  getUserActivePlan: jest.fn(),
}));

jest.mock("@/lib/analytics", () => ({
  __esModule: true,
  trackServerEvent: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db>;
const mockGetUserActivePlan = getUserActivePlan as jest.MockedFunction<typeof getUserActivePlan>;

function request(date: string) {
  return {
    url: `https://app.eterapy.com/api/slots/available?practitionerId=prac-1&date=${date}&durationMin=60`,
    nextUrl: new URL(`https://app.eterapy.com/api/slots/available?practitionerId=prac-1&date=${date}&durationMin=60`),
  } as unknown as NextRequest;
}

function futureDateStr() {
  const date = new Date(Date.now() + 48 * 60 * 60 * 1000);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function setupDb(dateStr: string) {
  const startAt = new Date(`${dateStr}T12:00:00`);
  const endAt = new Date(`${dateStr}T13:00:00`);
  (mockDb.scheduleRule.findUnique as jest.Mock).mockResolvedValue({
    enabled: true,
    startHour: 12,
    startMinute: 0,
    endHour: 14,
    endMinute: 0,
  });
  (mockDb.blockedSlot.findMany as jest.Mock).mockResolvedValue([]);
  (mockDb.booking.findMany as jest.Mock).mockResolvedValue([]);
  (mockDb.timeSlot.findMany as jest.Mock)
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([{
      id: "slot-early",
      practitionerId: "prac-1",
      available: true,
      startAt,
      endAt,
      visibleFrom: new Date(Date.now() + 24 * 60 * 60 * 1000),
      earlyAccessFrom: new Date(Date.now() - 60 * 60 * 1000),
    }]);
}

describe("Z20 generated availability respects persisted early-access slots", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(null as never);
    mockGetUserActivePlan.mockResolvedValue(null as never);
  });

  it("does not leak hidden persisted slots to guests", async () => {
    const dateStr = futureDateStr();
    setupDb(dateStr);

    const response = await getAvailableSlots(request(dateStr));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.slots).toHaveLength(1);
    expect(body.slots[0]).toEqual(expect.objectContaining({ earlyAccess: false }));
    expect(body.slots[0].slotId).toBeUndefined();
  });

  it("returns matching slotId and earlyAccess flag to Premium clients", async () => {
    const dateStr = futureDateStr();
    mockAuth.mockResolvedValue({
      user: { id: "premium-user", role: "CLIENT" },
      expires: "2026-07-01T00:00:00.000Z",
    } as never);
    mockGetUserActivePlan.mockResolvedValue({ key: "premium" } as never);
    setupDb(dateStr);

    const response = await getAvailableSlots(request(dateStr));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.slots[0]).toEqual(expect.objectContaining({
      slotId: "slot-early",
      earlyAccess: true,
    }));
  });
});
