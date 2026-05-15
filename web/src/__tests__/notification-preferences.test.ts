import { readFileSync } from "fs";
import path from "path";
import { GET, PATCH, PUT } from "@/app/api/notifications/preferences/route";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getSetting, setSetting } from "@/lib/platform-settings";
import { ALL_EVENTS, NOTIFICATION_CATEGORY_META } from "@/lib/notification-events";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    notificationPreference: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/platform-settings", () => ({
  __esModule: true,
  getSetting: jest.fn(),
  setSetting: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockGetSetting = getSetting as jest.MockedFunction<typeof getSetting>;
const mockSetSetting = setSetting as jest.MockedFunction<typeof setSetting>;

function request(body: unknown) {
  return new Request("https://app.eterapy.com/api/notifications/preferences", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("notification preference center", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com", role: "CLIENT" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    } as never);
    (db.notificationPreference.findMany as jest.Mock).mockResolvedValue([]);
    (db.user.findUnique as jest.Mock).mockResolvedValue({ timezone: "Europe/Moscow" });
    (db.notificationPreference.upsert as jest.Mock).mockResolvedValue({});
    (db.$transaction as jest.Mock).mockResolvedValue([]);
    mockGetSetting.mockResolvedValue("");
    mockSetSetting.mockResolvedValue();
  });

  it("returns full channel matrix with categories and default quiet hours", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quietHours).toEqual({
      enabled: false,
      from: "22:00",
      to: "09:00",
      timezone: "Europe/Moscow",
    });
    expect(body.prefs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        event: "BOOKING_CONFIRMED",
        category: "booking",
        channel: "EMAIL",
        enabled: true,
        remindBeforeHours: [],
      }),
      expect.objectContaining({
        event: "BOOKING_CONFIRMED",
        category: "booking",
        channel: "TELEGRAM",
        enabled: false,
      }),
    ]));
    expect(body.prefs).toHaveLength(ALL_EVENTS.length * 3);
  });

  it("loads persisted quiet hours from per-user settings", async () => {
    mockGetSetting.mockResolvedValueOnce(JSON.stringify({
      enabled: true,
      from: "21:30",
      to: "08:15",
      timezone: "Asia/Tbilisi",
    }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.quietHours).toEqual({
      enabled: true,
      from: "21:30",
      to: "08:15",
      timezone: "Asia/Tbilisi",
    });
  });

  it("validates single preference updates", async () => {
    const bad = await PATCH(request({
      event: "UNKNOWN_EVENT",
      channel: "EMAIL",
      enabled: true,
    }) as unknown as import("next/server").NextRequest);

    expect(bad.status).toBe(400);
    expect(db.notificationPreference.upsert).not.toHaveBeenCalled();
  });

  it("saves preferences and quiet hours through one payload", async () => {
    const response = await PUT(request({
      prefs: [
        {
          event: "BOOKING_REMINDER",
          channel: "EMAIL",
          enabled: true,
          remindBeforeHours: [24],
        },
        {
          event: "BOOKING_REMINDER",
          channel: "TELEGRAM",
          enabled: false,
          remindBeforeHours: [],
        },
      ],
      quietHours: {
        enabled: true,
        from: "22:00",
        to: "09:00",
        timezone: "Europe/Moscow",
      },
    }) as unknown as import("next/server").NextRequest);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(db.notificationPreference.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ remindBeforeHours: 24 }),
      update: expect.objectContaining({ remindBeforeHours: 24 }),
    }));
    expect(mockSetSetting).toHaveBeenCalledWith(
      "notification.quiet_hours.user-1",
      JSON.stringify({ enabled: true, from: "22:00", to: "09:00", timezone: "Europe/Moscow" }),
      "user-1",
    );
  });

  it("keeps category metadata and quiet-hours UX discoverable in settings", () => {
    expect(NOTIFICATION_CATEGORY_META.booking.label).toBe("Записи");
    expect(NOTIFICATION_CATEGORY_META.payments.label).toBe("Платежи");

    const source = readFileSync(
      path.join(process.cwd(), "src/components/notifications/notification-settings.tsx"),
      "utf8",
    );

    expect(source).toContain("data-testid=\"notification-quiet-hours\"");
    expect(source).toContain("data-testid=\"notification-category-preferences\"");
    expect(source).toContain("Тихие часы");
    expect(source).toContain("Часовой пояс");
  });
});
