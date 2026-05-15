import { readFileSync } from "fs";
import path from "path";
import { GET } from "@/app/api/notifications/route";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    notification: { findMany: jest.fn() },
    notificationPreference: { findMany: jest.fn() },
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;

describe("web notification bell", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com", role: "CLIENT" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    } as never);
    (db.notificationPreference.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("filters WEB notifications to events authorized for the current role", async () => {
    (db.notification.findMany as jest.Mock).mockResolvedValue([
      {
        id: "n-1",
        event: "BOOKING_CONFIRMED",
        title: "Запись подтверждена",
        body: "29.04 в 10:00",
        href: "/cabinet/bookings",
        readAt: null,
        createdAt: new Date("2026-04-28T10:00:00.000Z"),
      },
      {
        id: "n-2",
        event: "PAYOUT_SCHEDULED",
        title: "Выплата",
        body: "Admin only",
        href: "/admin/payouts",
        readAt: null,
        createdAt: new Date("2026-04-28T10:00:00.000Z"),
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notifications).toEqual([
      expect.objectContaining({ id: "n-1", event: "BOOKING_CONFIRMED" }),
    ]);
  });

  it("hides events explicitly disabled for the WEB channel", async () => {
    (db.notificationPreference.findMany as jest.Mock).mockResolvedValue([
      { event: "BOOKING_CONFIRMED" },
    ]);
    (db.notification.findMany as jest.Mock).mockResolvedValue([
      {
        id: "n-1",
        event: "BOOKING_CONFIRMED",
        title: "Запись подтверждена",
        body: "29.04 в 10:00",
        href: "/cabinet/bookings",
        readAt: null,
        createdAt: new Date("2026-04-28T10:00:00.000Z"),
      },
    ]);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.notifications).toEqual([]);
  });

  it("keeps loading, error, empty, and all v5 payment/account icons in the bell UI", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/notification-bell.tsx"),
      "utf8",
    );

    expect(source).toContain("data-testid=\"notification-bell-loading\"");
    expect(source).toContain("data-testid=\"notification-bell-error\"");
    expect(source).toContain("Повторить");
    expect(source).toContain("BALANCE_TOPUP");
    expect(source).toContain("CARD_LINKED");
    expect(source).toContain("CARD_REMOVED");
  });
});
