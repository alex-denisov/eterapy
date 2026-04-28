import { GET } from "@/app/api/admin/notifications/diagnostics/route";
import { getAdminNotificationDiagnostics } from "@/lib/admin-notification-diagnostics";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/moderator-permissions", () => ({
  __esModule: true,
  getUserPermissions: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    job: {
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockGetUserPermissions = getUserPermissions as jest.MockedFunction<typeof getUserPermissions>;

function request() {
  return new Request("https://admin.eterapy.com/api/admin/notifications/diagnostics");
}

describe("admin notification diagnostics", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", email: "admin@example.com", role: "ADMIN" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
    mockGetUserPermissions.mockResolvedValue(["notifications.diagnose"] as never);
    (db.job.groupBy as jest.Mock).mockResolvedValue([
      { status: "PENDING", _count: { _all: 2 } },
      { status: "DEAD", _count: { _all: 1 } },
    ]);
    (db.job.findMany as jest.Mock).mockResolvedValue([
      {
        id: "job-1",
        status: "DEAD",
        attempts: 3,
        maxAttempts: 3,
        runAfter: new Date("2026-04-28T10:00:00.000Z"),
        error: "Telegram relay timeout",
        payload: {
          userId: "user-1",
          event: "BOOKING_CONFIRMED",
          channel: "TELEGRAM",
          requestId: "req-1",
          recipient: { email: "private@example.com", telegramId: "tg-secret" },
        },
        createdAt: new Date("2026-04-28T09:00:00.000Z"),
        updatedAt: new Date("2026-04-28T10:00:00.000Z"),
      },
    ]);
  });

  it("requires notifications.diagnose permission", async () => {
    mockGetUserPermissions.mockResolvedValueOnce([] as never);

    const response = await GET(request() as never);

    expect(response.status).toBe(403);
    expect(db.job.findMany).not.toHaveBeenCalled();
  });

  it("returns delivery stats and redacted recent payload summaries", async () => {
    const response = await GET(request() as never);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.stats).toEqual(expect.objectContaining({ PENDING: 2, DEAD: 1 }));
    expect(body.recent[0].payload).toEqual({
      userId: "user-1",
      event: "BOOKING_CONFIRMED",
      channel: "TELEGRAM",
      requestId: "req-1",
    });
    expect(JSON.stringify(body)).not.toContain("private@example.com");
    expect(JSON.stringify(body)).not.toContain("tg-secret");
  });

  it("queries only notification delivery jobs", async () => {
    await getAdminNotificationDiagnostics();

    expect(db.job.groupBy).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: "notification.delivery" },
    }));
    expect(db.job.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { type: "notification.delivery" },
      take: 25,
    }));
  });
});
