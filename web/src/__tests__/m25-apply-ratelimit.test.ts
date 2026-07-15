import fs from "node:fs";
import path from "node:path";

// B341 / Баг 7 — anonymous mutating/costly endpoints must be guarded. The
// practitioner application endpoint writes a DB row AND sends an email, so it
// must be rate-limited like registration.

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("practitioner apply rate-limit", () => {
  const route = source("src/app/api/practitioners/apply/route.ts");

  it("applies a per-IP burst limit before any DB write or email send", () => {
    expect(route).toContain("checkRequestAuthRateLimit");
    expect(route).toMatch(/checkRequestAuthRateLimit\(req,\s*"practitioner-apply"/);
    // the limit check must come before the body is parsed / row created
    const limitIdx = route.indexOf("checkRequestAuthRateLimit");
    const createIdx = route.indexOf("practitionerApplication.create");
    expect(limitIdx).toBeGreaterThan(-1);
    expect(createIdx).toBeGreaterThan(limitIdx);
  });

  it("applies a daily IP cap as well", () => {
    expect(route).toMatch(/practitioner-apply:daily:ip/);
  });

  it("returns the standard rate-limit response when exceeded", () => {
    expect(route).toContain("authRateLimitResponse");
  });
});

describe("B341 anonymous-route audit invariants", () => {
  it("the retired Telegram support webhook does not consume inbound data", () => {
    const wh = source("src/app/api/telegram/support-webhook/route.ts");
    expect(wh).toContain("supportRepliesDisabled: true");
    expect(wh).not.toContain("req.json");
    expect(wh).not.toContain("db.");
  });

  it("email verification is gated by a token", () => {
    const ve = source("src/app/api/auth/verify-email/route.ts");
    expect(ve).toMatch(/getByVerificationToken|verificationToken/);
  });
});
