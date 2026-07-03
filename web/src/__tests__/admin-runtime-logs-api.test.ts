import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { readRuntimeLogSnapshot } from "@/lib/admin-runtime-logs";
import { GET } from "@/app/api/admin/logs/runtime/route";
import { GET as streamRuntimeLogs } from "@/app/api/admin/logs/runtime/stream/route";
import { REQUEST_ID_HEADER } from "@/lib/request-context";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/admin-runtime-logs", () => ({
  __esModule: true,
  readRuntimeLogSnapshot: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockReadRuntimeLogSnapshot = readRuntimeLogSnapshot as jest.MockedFunction<typeof readRuntimeLogSnapshot>;

function request(path = "https://admin.eterapy.com/api/admin/logs/runtime?limit=1200&level=error&source=app-out&q=ai&tailBytes=2097152") {
  return new Request(path, {
    headers: { [REQUEST_ID_HEADER]: "runtime-logs-123" },
  }) as NextRequest;
}

describe("admin runtime logs API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "superadmin-1", role: "SUPERADMIN" },
      expires: "2026-05-27T00:00:00.000Z",
    } as never);
    mockReadRuntimeLogSnapshot.mockResolvedValue({
      generatedAt: "2026-05-27T10:00:00.000Z",
      sources: [],
      entries: [],
    });
  });

  it("returns runtime logs for superadmins with a larger searchable tail window", async () => {
    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.requestId).toBe("runtime-logs-123");
    expect(mockReadRuntimeLogSnapshot).toHaveBeenCalledWith({
      limit: 1000,
      source: "app-out",
      level: "error",
      search: "ai",
      tailBytes: 2_097_152,
    });
  });

  it("rejects non-superadmin users", async () => {
    mockAuth.mockResolvedValueOnce({
      user: { id: "admin-1", role: "ADMIN" },
      expires: "2026-05-27T00:00:00.000Z",
    } as never);

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(mockReadRuntimeLogSnapshot).not.toHaveBeenCalled();
  });

  it("streams runtime snapshots for superadmins as SSE", async () => {
    const response = await streamRuntimeLogs(request("https://admin.eterapy.com/api/admin/logs/runtime/stream?intervalMs=1000"));

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");

    const reader = response.body?.getReader();
    expect(reader).toBeDefined();
    const firstChunk = await reader!.read();
    await reader!.cancel();
    const text = new TextDecoder().decode(firstChunk.value);

    expect(text).toContain("event: snapshot");
    expect(text).toContain("generatedAt");
  });
});
