import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserActivePlan } from "@/lib/entitlements";
import {
  canAccessPrioritySlot,
  isPremiumPlan,
  selectWaitlistPromotionCandidate,
  bookingPriorityForPlan,
} from "@/lib/priority-booking";
import { GET as getSlots } from "@/app/api/slots/route";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    timeSlot: {
      findMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/entitlements", () => ({
  __esModule: true,
  getUserActivePlan: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db>;
const mockGetUserActivePlan = getUserActivePlan as jest.MockedFunction<typeof getUserActivePlan>;

function request(url: string) {
  return {
    url,
    nextUrl: new URL(url),
  } as unknown as NextRequest;
}

describe("Z20 priority booking", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue(null as never);
    mockGetUserActivePlan.mockResolvedValue(null as never);
  });

  it("treats only client Premium as the priority booking tier", () => {
    expect(isPremiumPlan(null)).toBe(false);
    expect(isPremiumPlan("plus")).toBe(false);
    expect(isPremiumPlan("premium")).toBe(true);
    expect(isPremiumPlan("practitioner_pro_plus")).toBe(false);
    expect(bookingPriorityForPlan("premium")).toBe(100);
    expect(bookingPriorityForPlan("plus")).toBe(0);
  });

  it("opens early-access slots to Premium before general visibility", () => {
    const now = new Date("2026-06-06T12:00:00.000Z");
    const slot = {
      visibleFrom: new Date("2026-06-07T12:00:00.000Z"),
      earlyAccessFrom: new Date("2026-06-06T10:00:00.000Z"),
    };

    expect(canAccessPrioritySlot(slot, "premium", now)).toBe(true);
    expect(canAccessPrioritySlot(slot, "plus", now)).toBe(false);
    expect(canAccessPrioritySlot(slot, null, now)).toBe(false);
    expect(canAccessPrioritySlot(slot, "plus", new Date("2026-06-07T12:00:00.000Z"))).toBe(true);
  });

  it("promotes active Premium waitlist entries before older Free entries", () => {
    const olderFree = {
      id: "wait-free",
      status: "ACTIVE",
      priority: 0,
      createdAt: new Date("2026-06-06T09:00:00.000Z"),
    };
    const newerPremium = {
      id: "wait-premium",
      status: "ACTIVE",
      priority: 100,
      createdAt: new Date("2026-06-06T10:00:00.000Z"),
    };
    const cancelledPremium = {
      id: "wait-cancelled",
      status: "CANCELLED",
      priority: 100,
      createdAt: new Date("2026-06-06T08:00:00.000Z"),
    };

    expect(selectWaitlistPromotionCandidate([olderFree, newerPremium, cancelledPremium])?.id)
      .toBe("wait-premium");
  });

  it("hides persisted early-access slots from guests while showing them to Premium clients", async () => {
    const now = Date.now();
    const earlySlot = {
      id: "slot-early",
      practitionerId: "prac-1",
      startAt: new Date(now + 48 * 60 * 60 * 1000),
      endAt: new Date(now + 49 * 60 * 60 * 1000),
      visibleFrom: new Date(now + 24 * 60 * 60 * 1000),
      earlyAccessFrom: new Date(now - 60 * 60 * 1000),
    };
    const publicSlot = {
      id: "slot-public",
      practitionerId: "prac-1",
      startAt: new Date(now + 50 * 60 * 60 * 1000),
      endAt: new Date(now + 51 * 60 * 60 * 1000),
      visibleFrom: null,
      earlyAccessFrom: null,
    };
    (mockDb.timeSlot.findMany as jest.Mock).mockResolvedValue([earlySlot, publicSlot]);

    const guestResponse = await getSlots(request("https://app.eterapy.com/api/slots?practitionerId=prac-1"));
    const guestBody = await guestResponse.json();
    expect(guestBody.slots.map((slot: { id: string }) => slot.id)).toEqual(["slot-public"]);

    mockAuth.mockResolvedValue({
      user: { id: "user-premium", role: "CLIENT" },
      expires: "2026-07-01T00:00:00.000Z",
    } as never);
    mockGetUserActivePlan.mockResolvedValue({ key: "premium" } as never);

    const premiumResponse = await getSlots(request("https://app.eterapy.com/api/slots?practitionerId=prac-1"));
    const premiumBody = await premiumResponse.json();
    expect(premiumBody.slots).toEqual([
      expect.objectContaining({ id: "slot-early", earlyAccess: true }),
      expect.objectContaining({ id: "slot-public", earlyAccess: false }),
    ]);
  });
});
