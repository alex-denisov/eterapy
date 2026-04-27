import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { GET as getHealth } from "@/app/api/health/route";
import { GET as getLiveHealth } from "@/app/api/health/live/route";
import { GET as getReadyHealth } from "@/app/api/health/ready/route";
import { REQUEST_ID_HEADER } from "@/lib/request-context";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    $queryRaw: jest.fn(),
  },
}));

const mockedDb = db as jest.Mocked<typeof db>;
let consoleErrorSpy: jest.SpyInstance;

function request(path: string, requestId = "test-request-123") {
  return new Request(`https://eterapy.com${path}`, {
    headers: {
      [REQUEST_ID_HEADER]: requestId,
    },
  }) as NextRequest;
}

describe("health endpoints", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    mockedDb.$queryRaw.mockResolvedValue([{ "?column?": 1 }]);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("returns live health without checking dependencies", async () => {
    const response = await getLiveHealth(request("/api/health/live"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.requestId).toBe("test-request-123");
    expect(response.headers.get(REQUEST_ID_HEADER)).toBe("test-request-123");
    expect(mockedDb.$queryRaw).not.toHaveBeenCalled();
  });

  it("returns ready health with database latency", async () => {
    const response = await getReadyHealth(request("/api/health/ready"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks).toEqual([
      expect.objectContaining({
        name: "database",
        status: "ok",
        latencyMs: expect.any(Number),
      }),
    ]);
  });

  it("returns 503 when readiness dependency fails", async () => {
    mockedDb.$queryRaw.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await getReadyHealth(request("/api/health/ready"));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe("down");
    expect(body.checks[0]).toEqual(
      expect.objectContaining({
        name: "database",
        status: "down",
        message: "database unavailable",
      })
    );
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining("health-ready-db-check-failed"));
  });

  it("keeps the legacy health endpoint as a 200 smoke check", async () => {
    mockedDb.$queryRaw.mockRejectedValueOnce(new Error("database unavailable"));

    const response = await getHealth(request("/api/health"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.live.status).toBe("ok");
    expect(body.ready.status).toBe("down");
    expect(body.db).toBe("down");
  });
});
