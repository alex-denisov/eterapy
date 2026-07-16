import { NextRequest } from "next/server";
import { POST } from "@/app/api/csp-report/route";
import { resetAuthRateLimitForTests } from "@/lib/auth-rate-limit";
import { log } from "@/lib/logger";

jest.mock("@/lib/logger", () => ({ log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));

describe("CSP report endpoint", () => {
  beforeEach(() => {
    resetAuthRateLimitForTests();
    jest.clearAllMocks();
  });

  it("accepts a browser report without logging URL query data", async () => {
    const response = await POST(new NextRequest("https://eterapy.com/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/csp-report", "x-forwarded-for": "203.0.113.20" },
      body: JSON.stringify({
        "csp-report": {
          "document-uri": "https://eterapy.com/cabinet/results/private-id?token=secret",
          "effective-directive": "script-src-elem",
          "blocked-uri": "https://unexpected.example/track.js?email=private@example.com",
        },
      }),
    }));

    expect(response.status).toBe(204);
    expect(log.info).toHaveBeenCalledWith("security.csp_violation", {
      directive: "script-src-elem",
      blockedOrigin: "https://unexpected.example",
      documentOrigin: "https://eterapy.com",
      disposition: "report",
    });
  });

  it("rejects unsupported and oversized bodies", async () => {
    const unsupported = await POST(new NextRequest("https://eterapy.com/api/csp-report", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "{}",
    }));
    const oversized = await POST(new NextRequest("https://eterapy.com/api/csp-report", {
      method: "POST",
      headers: { "content-type": "application/json", "content-length": String(16 * 1024 + 1) },
      body: "{}",
    }));

    expect(unsupported.status).toBe(415);
    expect(oversized.status).toBe(413);
    expect(log.info).not.toHaveBeenCalled();
  });
});
