import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B482 — Telegram is an owner-only availability pager", () => {
  it("keeps the dedicated bot sender for content-free alerts", () => {
    const lib = source("src/lib/telegram.ts");
    expect(lib).toContain("TELEGRAM_SUPPORT_BOT_TOKEN");
    expect(lib).toContain("export async function sendTelegramSupport");
    expect(lib).not.toContain("createSupportForumTopic");
    expect(lib).not.toContain("setSupportTelegramWebhook");
  });

  it("sends a generic admin alert without client data or routing metadata", () => {
    const route = source("src/app/api/support/messages/route.ts");
    const alertBlock = route.slice(route.indexOf("// Telegram is an owner-only pager"));
    expect(route).toContain("TELEGRAM_SUPPORT_ALERT_CHAT_ID");
    expect(route).not.toContain("process.env.TELEGRAM_SUPPORT_CHAT_ID ??");
    expect(alertBlock).toContain("Новое сообщение в поддержке ETerapy");
    expect(alertBlock).toContain('absoluteAdminUrl("/admin/support")');
    expect(alertBlock).not.toContain("parsed.data.content");
    expect(alertBlock).not.toContain("session.user");
    expect(alertBlock).not.toContain("conversation.id}");
    expect(alertBlock).not.toContain("createSupportForumTopic");
  });

  it("does not parse or persist inbound support-bot messages", () => {
    const route = source("src/app/api/telegram/support-webhook/route.ts");
    expect(route).toContain("supportRepliesDisabled: true");
    expect(route).not.toContain("req.json");
    expect(route).not.toContain("supportMessage.create");
    expect(route).not.toContain('role: "STAFF"');
  });

  it("ignores the old group before storing a webhook idempotency payload", () => {
    const route = source("src/app/api/telegram/webhook/route.ts");
    const ignore = route.indexOf("supportGroupIgnored: true");
    const claim = route.indexOf("claimWebhookEvent({");
    expect(ignore).toBeGreaterThan(-1);
    expect(claim).toBeGreaterThan(ignore);
  });

  it("prevents the legacy registration endpoint from restoring reply ingress", () => {
    const route = source("src/app/api/admin/telegram/register-support-webhook/route.ts");
    expect(route).toContain('session?.user?.role !== "SUPERADMIN"');
    expect(route).toContain("status: 410");
    expect(route).not.toContain("setSupportTelegramWebhook");
  });
});
