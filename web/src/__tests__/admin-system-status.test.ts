import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { GET } from "@/app/api/admin/system/status/route";
import { REQUEST_ID_HEADER } from "@/lib/request-context";

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
    $queryRaw: jest.fn(),
    user: { count: jest.fn() },
    practitioner: { count: jest.fn() },
    booking: { count: jest.fn() },
    auditLog: { count: jest.fn() },
    notificationPreference: { count: jest.fn() },
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockGetUserPermissions = getUserPermissions as jest.MockedFunction<typeof getUserPermissions>;
const mockDb = db as jest.Mocked<typeof db>;

function request() {
  return new Request("https://admin.eterapy.com/api/admin/system/status", {
    headers: { [REQUEST_ID_HEADER]: "admin-status-123" },
  }) as NextRequest;
}

describe("admin system status API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      expires: "2026-04-28T00:00:00.000Z",
    });
    mockGetUserPermissions.mockResolvedValue(["system.read"]);
    mockDb.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
    mockDb.user.count.mockResolvedValueOnce(10).mockResolvedValueOnce(3);
    mockDb.practitioner.count.mockResolvedValue(4);
    mockDb.booking.count.mockResolvedValueOnce(20).mockResolvedValueOnce(2);
    mockDb.auditLog.count.mockResolvedValue(30);
    mockDb.notificationPreference.count.mockResolvedValue(5);
  });

  it("returns dependency status for admins with system.read", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requestId).toBe("admin-status-123");
    expect(body.ready.status).toBe("ok");
    expect(body.stats.users).toBe(10);
    expect(body.services).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "database", status: "ok" }),
    ]));
  });

  it("rejects admins without system.read", async () => {
    mockGetUserPermissions.mockResolvedValueOnce([]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
  });
});
