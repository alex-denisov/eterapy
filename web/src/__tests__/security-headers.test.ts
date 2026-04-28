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
    const csp = securityHeaders().find((header) => header.key === "Content-Security-Policy")?.value ?? "";

    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("frame-src https://yoomoney.ru https://*.yookassa.ru");
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("https://id.vk.com");
    expect(csp).toContain("connect-src 'self' https: wss: ws:");
    expect(csp).toContain("worker-src 'self' blob:");
  });
});
