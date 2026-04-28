import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { GET } from "@/app/api/admin/ai/usage/route";
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
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockGetUserPermissions = getUserPermissions as jest.MockedFunction<typeof getUserPermissions>;
const mockDb = db as jest.Mocked<typeof db>;

function request(path = "https://admin.eterapy.com/api/admin/ai/usage?period=2026-04-28") {
  return new Request(path, {
    headers: { [REQUEST_ID_HEADER]: "admin-ai-usage-123" },
  }) as NextRequest;
}

describe("admin AI usage API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "admin-1", role: "ADMIN" },
      expires: "2026-04-28T00:00:00.000Z",
    });
    mockGetUserPermissions.mockResolvedValue(["analytics.view"]);
    mockDb.$queryRaw.mockResolvedValue([
      {
        scope_type: "global",
        scope_key: "all",
        period: "2026-04-28",
        tokens: 100,
        cost_micros: 200,
        request_count: 3,
      },
    ]);
  });

  it("returns usage rows and totals for admins with analytics access", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requestId).toBe("admin-ai-usage-123");
    expect(body.period).toBe("2026-04-28");
    expect(body.rows).toEqual([
      {
        scopeType: "global",
        scopeKey: "all",
        period: "2026-04-28",
        tokens: 100,
        costMicros: 200,
        requestCount: 3,
      },
    ]);
    expect(body.totals).toEqual({
      tokens: 100,
      costMicros: 200,
      requestCount: 3,
    });
  });

  it("rejects admins without analytics or AI config permissions", async () => {
    mockGetUserPermissions.mockResolvedValueOnce(["system.read"]);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.code).toBe("FORBIDDEN");
  });

  it("rejects invalid periods", async () => {
    const response = await GET(request("https://admin.eterapy.com/api/admin/ai/usage?period=today"));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("BAD_REQUEST");
  });
});
