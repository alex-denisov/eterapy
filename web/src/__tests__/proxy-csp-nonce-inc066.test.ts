/**
 * INC-066 / B523: nonce-CSP должен доезжать до ответа на ВСЕХ аутентифицированных
 * поверхностях, включая app-хост, где документ отдаётся через rewriteWithContext
 * (внутренний rewrite / → /cabinet, /diary → /cabinet/diary). Регресс на прод-
 * симптом: app-хост отдавал script-src 'unsafe-inline' + report-only без nonce.
 */
import type { NextRequest } from "next/server";

process.env.NEXT_PUBLIC_USE_SUBDOMAINS = "true";

jest.mock("@/lib/session-from-cookie", () => ({
  getSessionFromCookie: jest.fn(),
}));
jest.mock("@/lib/impersonation", () => ({
  getImpersonationFromRequest: jest.fn(async () => null),
}));

import proxy from "@/proxy";
import { getSessionFromCookie } from "@/lib/session-from-cookie";

const mockSession = getSessionFromCookie as jest.Mock;

function makeRequest(url: string, host: string): NextRequest {
  const nextUrl = new URL(url) as URL & { clone(): URL };
  nextUrl.clone = () => new URL(url);
  return {
    url,
    nextUrl,
    headers: new Headers({ host }),
    cookies: { get: () => undefined, getAll: () => [] },
  } as unknown as NextRequest;
}

describe("INC-066 — nonce CSP on the app-host rewrite path", () => {
  beforeEach(() => {
    mockSession.mockReset();
  });

  function expectNonceCsp(response: Response) {
    const csp = response.headers.get("content-security-policy") ?? "";
    const script = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
    expect(script).toContain("'nonce-");
    expect(script).not.toContain("'unsafe-inline'");
    // nonce-политика enforced, report-only слой не нужен
    expect(response.headers.get("content-security-policy-report-only")).toBeNull();
  }

  it("app host / (client) → rewrite to /cabinet carries the nonce CSP", async () => {
    mockSession.mockResolvedValue({ id: "u1", role: "CLIENT" });
    const response = await proxy(makeRequest("https://app.eterapy.com/", "app.eterapy.com"));
    expectNonceCsp(response);
  });

  it("app host /diary (client) → rewrite to /cabinet/diary carries the nonce CSP", async () => {
    mockSession.mockResolvedValue({ id: "u1", role: "CLIENT" });
    const response = await proxy(makeRequest("https://app.eterapy.com/diary", "app.eterapy.com"));
    expectNonceCsp(response);
  });

  it("app host /practitioner (practitioner) carries the nonce CSP", async () => {
    mockSession.mockResolvedValue({ id: "p1", role: "PRACTITIONER" });
    const response = await proxy(
      makeRequest("https://app.eterapy.com/practitioner", "app.eterapy.com"),
    );
    expectNonceCsp(response);
  });

  it("admin host /admin (direct render) keeps the nonce CSP", async () => {
    mockSession.mockResolvedValue({ id: "a1", role: "ADMIN" });
    const response = await proxy(
      makeRequest("https://admin.eterapy.com/admin", "admin.eterapy.com"),
    );
    expectNonceCsp(response);
  });

  it("main host public page keeps static policy + report-only (no nonce)", async () => {
    mockSession.mockResolvedValue({ id: null, role: null });
    const response = await proxy(makeRequest("https://eterapy.com/pricing", "eterapy.com"));
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).not.toContain("'nonce-");
    // report-only слой добавляется только в production (см. security-headers.test)
    expect(csp).toContain("'unsafe-inline'");
  });

  it("rewrite forwards the nonce marker to the rendered route's request headers", async () => {
    mockSession.mockResolvedValue({ id: "u1", role: "CLIENT" });
    const response = await proxy(makeRequest("https://app.eterapy.com/", "app.eterapy.com"));
    // Next переносит подменённые request-заголовки через x-middleware-request-*
    const override = response.headers.get("x-middleware-override-headers") ?? "";
    expect(override).toContain("x-eterapy-csp-nonce");
    expect(response.headers.get("x-middleware-request-x-eterapy-csp-nonce")).toBeTruthy();
    // Root cause INC-066: rewrite обязан быть same-origin, иначе Next проксирует
    // запрос сам в себя и второй проход proxy срезает nonce.
    expect(response.headers.get("x-middleware-rewrite")).toBe("https://app.eterapy.com/cabinet");
  });
});
