import fs from "node:fs";
import path from "node:path";
import { parseDevice, ipFromHeaders } from "@/lib/request-meta";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("U5 — request-meta device + IP parsing", () => {
  it("derives a Browser · OS label from common user agents", () => {
    expect(parseDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36"))
      .toBe("Chrome · macOS");
    expect(parseDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"))
      .toBe("Safari · iOS");
    expect(parseDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Firefox/121.0"))
      .toBe("Firefox · Windows");
    expect(parseDevice("Mozilla/5.0 (Linux; Android 14) Chrome/120.0 Mobile Safari/537.36"))
      .toBe("Chrome · Android");
  });

  it("returns null for a missing user agent", () => {
    expect(parseDevice(null)).toBeNull();
    expect(parseDevice(undefined)).toBeNull();
  });

  it("takes the first hop of x-forwarded-for, falling back to x-real-ip", () => {
    const headers1 = new Map([["x-forwarded-for", "203.0.113.7, 10.0.0.1"]]);
    expect(ipFromHeaders((name) => headers1.get(name) ?? null)).toBe("203.0.113.7");

    const headers2 = new Map([["x-real-ip", "198.51.100.4"]]);
    expect(ipFromHeaders((name) => headers2.get(name) ?? null)).toBe("198.51.100.4");

    expect(ipFromHeaders(() => null)).toBeNull();
  });
});

describe("U5 — login events captured with IP + device + channel", () => {
  const auth = read("src/lib/auth.ts");

  it("records a structured LOGIN event for both email and OAuth logins", () => {
    expect(auth).toContain("getRequestMeta");
    expect(auth).toContain("async function logLoginEvent");
    expect(auth).toContain('logLoginEvent(user.id, "email")');
    expect(auth).toContain("logLoginEvent(dbUser.id, provider)");
    // IP goes in the audit ip column, device/channel into JSON details
    expect(auth).toContain("meta.ip");
    expect(auth).toContain("device: meta.device");
  });
});

describe("U5 — admin user card surfaces last-session provenance", () => {
  it("page queries the latest LOGIN audit per user and derives registration source", () => {
    const page = read("src/app/admin/users/page.tsx");
    expect(page).toContain('action: "LOGIN"');
    expect(page).toContain('distinct: ["userId"]');
    expect(page).toContain("lastLoginByUser");
    expect(page).toContain("registrationSource: user.registrationChannel ?? user.provider");
  });

  it("table shows a Последний вход column", () => {
    const panel = read("src/app/admin/users/users-control-panel.tsx");
    expect(panel).toContain("Последний вход");
    expect(panel).toContain("row.lastLogin");
  });

  it("modal shows a read-only security/antifraud section", () => {
    const modal = read("src/app/admin/users/user-edit-modal.tsx");
    expect(modal).toContain("Безопасность и антифрод");
    expect(modal).toContain("Источник регистрации");
    expect(modal).toContain("IP последнего входа");
    expect(modal).toContain("row.lastLogin?.device");
  });
});
