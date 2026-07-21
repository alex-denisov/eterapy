import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { NextRequest } from "next/server";
import {
  TelegramLaunchError,
  telegramMiniAppSsoEnabled,
  verifyTelegramInitData,
} from "@/lib/miniapp/telegram/auth";
import { isSameOriginMiniAppRequest, readMiniAppInitData } from "@/lib/miniapp/telegram/request";

const BOT_TOKEN = "123456:test-token-for-b528";
const NOW = new Date("2026-07-18T12:00:00.000Z");

function signedInitData(overrides: { authDate?: number; user?: Record<string, unknown>; extra?: Record<string, string> } = {}) {
  const params = new URLSearchParams({
    auth_date: String(overrides.authDate ?? Math.floor(NOW.getTime() / 1000)),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify(overrides.user ?? { id: 987654321, first_name: "Анна", last_name: "Тест", username: "anna_test" }),
    ...(overrides.extra ?? {}),
  });
  const check = Array.from(params.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = crypto.createHmac("sha256", "WebAppData").update(BOT_TOKEN).digest();
  params.set("hash", crypto.createHmac("sha256", secret).update(check).digest("hex"));
  return params.toString();
}

describe("B528 — bounded Telegram Mini App identity", () => {
  const originalToken = process.env.TELEGRAM_BOT_TOKEN;
  const originalFlag = process.env.TELEGRAM_MINIAPP_SSO_ENABLED;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = BOT_TOKEN;
    process.env.TELEGRAM_MINIAPP_SSO_ENABLED = "true";
  });

  afterAll(() => {
    if (originalToken === undefined) delete process.env.TELEGRAM_BOT_TOKEN;
    else process.env.TELEGRAM_BOT_TOKEN = originalToken;
    if (originalFlag === undefined) delete process.env.TELEGRAM_MINIAPP_SSO_ENABLED;
    else process.env.TELEGRAM_MINIAPP_SSO_ENABLED = originalFlag;
  });

  it("validates signed initData and normalizes the Telegram subject as a string", () => {
    expect(verifyTelegramInitData(signedInitData(), NOW)).toMatchObject({
      provider: "telegram",
      subjectId: "987654321",
      firstName: "Анна",
      lastName: "Тест",
      username: "anna_test",
    });
  });

  it("rejects tampering even when the client-side user object looks valid", () => {
    const params = new URLSearchParams(signedInitData());
    params.set("user", JSON.stringify({ id: 1, first_name: "Подмена" }));
    expect(() => verifyTelegramInitData(params.toString(), NOW)).toThrow(expect.objectContaining({ code: "INVALID_SIGNATURE" }));
  });

  it.each([
    ["stale", Math.floor(NOW.getTime() / 1000) - 301],
    ["future", Math.floor(NOW.getTime() / 1000) + 31],
  ])("rejects %s launch data", (_label, authDate) => {
    expect(() => verifyTelegramInitData(signedInitData({ authDate }), NOW)).toThrow(expect.objectContaining({ code: "STALE_INIT_DATA" }));
  });

  it("rejects bots, unsafe numeric subjects and oversized payloads", () => {
    expect(() => verifyTelegramInitData(signedInitData({ user: { id: 7, first_name: "Bot", is_bot: true } }), NOW)).toThrow(expect.objectContaining({ code: "BOT_USER" }));
    expect(() => verifyTelegramInitData(signedInitData({ user: { id: "9007199254740993", first_name: "Unsafe" } }), NOW)).toThrow(expect.objectContaining({ code: "INVALID_USER" }));
    expect(() => verifyTelegramInitData("x".repeat(16_385), NOW)).toThrow(TelegramLaunchError);
  });

  it("uses an explicit default-off feature flag", () => {
    delete process.env.TELEGRAM_MINIAPP_SSO_ENABLED;
    expect(telegramMiniAppSsoEnabled()).toBe(false);
    process.env.TELEGRAM_MINIAPP_SSO_ENABLED = "TRUE";
    expect(telegramMiniAppSsoEnabled()).toBe(true);
  });

  it("keeps identity linking explicit and cleans one-time grants through the daily job", () => {
    const root = process.cwd();
    const bootstrap = fs.readFileSync(path.join(root, "src/components/miniapp/telegram-bootstrap.tsx"), "utf8");
    const account = fs.readFileSync(path.join(root, "src/components/miniapp/journey-screens.tsx"), "utf8");
    const home = fs.readFileSync(path.join(root, "src/components/miniapp/screens/home-screen.tsx"), "utf8");
    const checkinPage = fs.readFileSync(path.join(root, "src/app/checkin/page.tsx"), "utf8");
    const checkin = fs.readFileSync(path.join(root, "src/components/dialogue/checkin-experience.tsx"), "utf8");
    const cronJobs = fs.readFileSync(path.join(root, "src/lib/cron-jobs.ts"), "utf8");

    expect(bootstrap).not.toContain("/api/miniapp/auth/telegram/link");
    expect(account).toContain("Подключить Telegram");
    expect(home).toContain("/miniapp/checkin?miniappDraft=1");
    expect(checkinPage).toContain("CheckinExperience");
    expect(checkin).toContain('sessionStorage.getItem("eterapy:miniapp-question")');
    expect(cronJobs).toContain("cleanupExpiredMiniAppAuthGrants");
  });

  it("accepts the public forwarded origin and rejects missing or cross-site origins", () => {
    const valid = new NextRequest("http://127.0.0.1:3000/api/miniapp/auth/telegram", {
      method: "POST",
      headers: { origin: "https://staging.eterapy.com", host: "127.0.0.1:3000", "x-forwarded-host": "staging.eterapy.com", "x-forwarded-proto": "https", "sec-fetch-site": "same-origin" },
    });
    expect(isSameOriginMiniAppRequest(valid)).toBe(true);
    expect(isSameOriginMiniAppRequest(new NextRequest(valid.url, { method: "POST" }))).toBe(false);
    const crossSite = new NextRequest(valid.url, { method: "POST", headers: { origin: "https://evil.example", host: "staging.eterapy.com", "sec-fetch-site": "cross-site" } });
    expect(isSameOriginMiniAppRequest(crossSite)).toBe(false);
  });

  it("parses a bounded JSON body and rejects other media types or large bodies", async () => {
    const initData = signedInitData();
    const valid = new NextRequest("https://staging.eterapy.com/api/miniapp/auth/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ initData }) });
    await expect(readMiniAppInitData(valid)).resolves.toEqual({ ok: true, initData });

    const wrongType = new NextRequest(valid.url, { method: "POST", headers: { "content-type": "text/plain" }, body: "{}" });
    await expect(readMiniAppInitData(wrongType)).resolves.toMatchObject({ ok: false, status: 415 });
    const large = new NextRequest(valid.url, { method: "POST", headers: { "content-type": "application/json", "content-length": "20001" }, body: "{}" });
    await expect(readMiniAppInitData(large)).resolves.toMatchObject({ ok: false, status: 413 });
  });
});
