import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B7 — dedicated Telegram support bot", () => {
  it("adds a support-bot sender that uses TELEGRAM_SUPPORT_BOT_TOKEN", () => {
    const lib = source("src/lib/telegram.ts");
    expect(lib).toContain("TELEGRAM_SUPPORT_BOT_TOKEN");
    expect(lib).toContain("export async function sendTelegramSupport");
    expect(lib).toContain("export async function setSupportTelegramWebhook");
    expect(lib).toContain("export function hasSupportBot");
  });

  it("forwards cabinet support messages via the support bot", () => {
    const route = source("src/app/api/support/messages/route.ts");
    expect(route).toContain("sendTelegramSupport(SUPPORT_GROUP_CHAT_ID");
    expect(route).not.toContain("await sendTelegram(SUPPORT_GROUP_CHAT_ID");
  });

  it("has a dedicated support webhook that only bridges staff replies", () => {
    const route = source("src/app/api/telegram/support-webhook/route.ts");
    expect(route).toContain('role: "STAFF"');
    expect(route).toContain("conversation:");
    // no account-linking / command spam in the support bot
    expect(route).not.toContain('text.startsWith("/start")');
    expect(route).not.toContain("Доступные команды");
    expect(route).toContain('result: "ignored"');
  });

  it("silences the notification bot inside the support group (no /start spam)", () => {
    const route = source("src/app/api/telegram/webhook/route.ts");
    expect(route).toContain('result: "support-group-ignored"');
  });

  it("exposes a superadmin endpoint to register the support webhook", () => {
    const route = source("src/app/api/admin/telegram/register-support-webhook/route.ts");
    expect(route).toContain('session?.user?.role !== "SUPERADMIN"');
    expect(route).toContain("setSupportTelegramWebhook");
  });
});
