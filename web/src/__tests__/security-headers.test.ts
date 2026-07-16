import { securityHeaders } from "@/lib/security-headers";

describe("security headers", () => {
  it("sets baseline browser hardening headers", () => {
    const headers = new Map(securityHeaders().map((header) => [header.key, header.value]));

    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("X-Frame-Options")).toBe("DENY");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Strict-Transport-Security")).toContain("includeSubDomains");
    expect(headers.get("Permissions-Policy")).toContain("geolocation=()");
  });

  it("keeps CSP compatible with payment, auth, media, and websocket flows", () => {
    const headers = securityHeaders({ production: true });
    const csp = headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    const reportOnly = headers.find((header) => header.key === "Content-Security-Policy-Report-Only")?.value ?? "";
    const reportOnlyScript = reportOnly.match(/script-src [^;]+/)?.[0] ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("frame-src https://yoomoney.ru https://*.yookassa.ru");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("https://id.vk.com");
    expect(csp).toContain("connect-src 'self' https: wss: ws:");
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toContain("'unsafe-inline'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(reportOnly).toContain("report-uri /api/csp-report");
    expect(reportOnlyScript).not.toContain("'unsafe-inline'");
    expect(reportOnlyScript).not.toContain("'unsafe-eval'");
  });

  it("B523: nonce-политика убирает unsafe-inline и режет inline-атрибуты", () => {
    const headers = securityHeaders({ production: true, nonce: "test-nonce" });
    const csp = headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
    const script = csp.match(/script-src [^;]+/)?.[0] ?? "";

    expect(script).toContain("'nonce-test-nonce'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
    expect(csp).toContain("script-src-attr 'none'");
    // Нарушения nonce-политики остаются видимыми в телеметрии.
    expect(csp).toContain("report-uri /api/csp-report");
    // Отдельный report-only заголовок при nonce не выпускается.
    expect(headers.find((header) => header.key === "Content-Security-Policy-Report-Only")).toBeUndefined();
  });

  it("B523: proxy выдаёт nonce-CSP для аутентифицированного дерева, config — base", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require("node:path") as typeof import("node:path");
    const proxy = fs.readFileSync(path.join(process.cwd(), "src/proxy.ts"), "utf8");
    expect(proxy).toContain("function enableNonce");
    expect(proxy).toContain("function applyDocumentCsp");
    expect(proxy).toContain("rendersAuthenticatedTree");
    // CSP выставляется на каждом рендер-ответе (next/rewrite).
    expect(proxy).toContain("applyDocumentCsp(withRequestContext(NextResponse.next");
    expect(proxy).toContain("applyDocumentCsp(withRequestContext(NextResponse.rewrite");
    // B477: proxy must strip client-supplied nonce/CSP request headers so a
    // caller cannot pin a known nonce and weaken their document CSP.
    expect(proxy).toContain('requestHeaders.delete(NONCE_REQUEST_HEADER)');
    expect(proxy).toContain('requestHeaders.delete("content-security-policy")');
    const config = fs.readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");
    // Глобально — только base-заголовки; CSP документа даёт proxy.
    expect(config).toContain("baseSecurityHeaders()");
    expect(config).not.toContain("securityHeaders()");
  });

  it("keeps eval available only for local development tooling", () => {
    const csp = securityHeaders({ production: false })
      .find((header) => header.key === "Content-Security-Policy")?.value ?? "";

    expect(csp).toContain("'unsafe-eval'");
    expect(securityHeaders({ production: false })).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "Content-Security-Policy-Report-Only" })]),
    );
  });
});
