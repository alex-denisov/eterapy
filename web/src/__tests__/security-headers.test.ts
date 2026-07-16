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

  it("keeps eval available only for local development tooling", () => {
    const csp = securityHeaders({ production: false })
      .find((header) => header.key === "Content-Security-Policy")?.value ?? "";

    expect(csp).toContain("'unsafe-eval'");
    expect(securityHeaders({ production: false })).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "Content-Security-Policy-Report-Only" })]),
    );
  });
});
