/**
 * B523/INC-066 — app-host cabinet CSP nonce.
 *
 * A middleware NextResponse.rewrite behind nginx can never stay internal
 * (x-forwarded-proto=https → https loopback target EPROTOs; the http target is
 * an EXTERNAL self-proxy whose second middleware pass strips the nonce marker).
 * The architecture therefore moves the app-host /cabinet mapping into
 * next.config router rewrites (beforeFiles + host match): middleware only
 * authenticates/redirects and sets the nonce headers; the router resolves the
 * /cabinet path in-process, so the nonce survives with no self-proxy hop.
 */
import { NextRequest } from "next/server";

jest.mock("@/lib/session-from-cookie", () => ({ getSessionFromCookie: jest.fn() }));
jest.mock("@/lib/impersonation", () => ({ getImpersonationFromRequest: jest.fn(async () => null) }));

const { getSessionFromCookie } = jest.requireMock("@/lib/session-from-cookie") as {
  getSessionFromCookie: jest.Mock;
};

function appRequest(path: string): NextRequest {
  return new NextRequest(`https://localhost:3000${path}`, {
    headers: {
      host: "app.eterapy.com",
      "x-forwarded-proto": "https",
    },
  });
}

// USE_SUBDOMAINS is read once at proxy import time — set it before the first
// (and only) dynamic import; resetModules would detach the mocked session lib.
process.env.NEXT_PUBLIC_USE_SUBDOMAINS = "true";
async function loadProxy() {
  const mod = await import("@/proxy");
  return mod.default;
}

describe("B523 app-host nonce topology", () => {
  it("client cabinet request gets a direct render (no middleware rewrite) with nonce CSP", async () => {
    getSessionFromCookie.mockResolvedValue({ id: "client-1", role: "CLIENT" });
    const proxy = await loadProxy();
    const response = await proxy(appRequest("/diary"));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    const csp = response.headers.get("content-security-policy") ?? "";
    expect(csp).toContain("'nonce-");
    expect(csp).not.toContain("script-src 'self' 'unsafe-inline'");
    // Nonce also travels as a request header so Next tags its inline scripts.
    const forwarded = response.headers.get("x-middleware-request-content-security-policy") ?? "";
    expect(forwarded).toContain("'nonce-");
  });

  it("admin result inspection on the app host passes through without a middleware rewrite", async () => {
    getSessionFromCookie.mockResolvedValue({ id: "admin-1", role: "SUPERADMIN" });
    const proxy = await loadProxy();
    const response = await proxy(appRequest("/results/abc123"));

    expect(response.headers.get("x-middleware-rewrite")).toBeNull();
    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("content-security-policy") ?? "").toContain("'nonce-");
  });

  it("unauthenticated app-host request still redirects to login", async () => {
    getSessionFromCookie.mockResolvedValue({ id: null, role: null });
    const proxy = await loadProxy();
    const response = await proxy(appRequest("/diary"));

    expect(response.headers.get("location")).toContain("/login?next=");
  });
});

describe("B523 next.config app-host router rewrites", () => {
  async function beforeFiles() {
    const config = (await import("../../next.config")).default;
    const rewrites = await config.rewrites!();
    return (rewrites as { beforeFiles: Array<{ source: string; has?: Array<{ type: string; value: string }>; destination: string }> }).beforeFiles;
  }

  function pathRegex(source: string): RegExp {
    const match = source.match(/^\/:path\((.+)\)$/);
    if (!match) throw new Error(`unexpected rewrite source: ${source}`);
    return new RegExp(`^/(${match[1]})$`);
  }

  it("maps the app-host root and stripped paths onto the /cabinet tree", async () => {
    const rules = await beforeFiles();
    expect(rules[0]).toEqual(expect.objectContaining({ source: "/", destination: "/cabinet" }));
    expect(rules[0].has?.[0]).toEqual(expect.objectContaining({ type: "host" }));
    expect(rules[1].destination).toBe("/cabinet/:path");
    expect(rules[1].has?.[0]).toEqual(expect.objectContaining({ type: "host" }));
  });

  it("rewrite pattern matches cabinet paths and skips pass-through surfaces", async () => {
    const rules = await beforeFiles();
    const regex = pathRegex(rules[1].source);

    for (const path of ["/diary", "/results/abc", "/practitioner/clients", "/wallet", "/modalities/checkin"]) {
      expect(regex.test(path)).toBe(true);
    }
    for (const path of [
      "/cabinet", "/cabinet/diary", // already prefixed
      "/help", "/help/faq", // static passport stays unprefixed
      "/auth/error", "/callback/vk", // ALWAYS_ALLOW
      "/api/bookings", "/_next/static/x", // never middleware/page surface
      "/favicon.ico", "/icon.svg", // dotted files
      "/__product-not-found",
    ]) {
      expect(regex.test(path)).toBe(false);
    }
  });
});
