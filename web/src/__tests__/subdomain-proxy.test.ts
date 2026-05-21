import type { NextRequest } from "next/server";

jest.mock("@/lib/session-from-cookie", () => ({
  getSessionFromCookie: jest.fn(),
}));

import { internalRewriteUrl, shouldRedirectAppPublicPathToMain } from "@/proxy";

function request(url: string): NextRequest {
  return { url } as NextRequest;
}

describe("subdomain proxy rewrites", () => {
  it("forces local HTTPS rewrite targets back to HTTP for the PM2 listener", () => {
    const url = internalRewriteUrl(request("https://localhost:3000/"), "/cabinet");

    expect(url.toString()).toBe("http://localhost:3000/cabinet");
  });

  it("keeps real domain rewrite targets on their original protocol", () => {
    const url = internalRewriteUrl(request("https://app.eterapy.com/"), "/cabinet");

    expect(url.toString()).toBe("https://app.eterapy.com/cabinet");
  });

  it("keeps public product and funnel routes canonical on the main domain", () => {
    for (const path of ["/products/deep-report", "/pricing", "/tarot", "/joint", "/checkin"]) {
      expect(shouldRedirectAppPublicPathToMain(path)).toBe(true);
    }

    for (const path of ["/products", "/", "/billing", "/questions", "/cabinet", "/cabinet/billing"]) {
      expect(shouldRedirectAppPublicPathToMain(path)).toBe(false);
    }
  });
});
