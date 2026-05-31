import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("N1d — support chat bidirectional + multichat", () => {
  it("telegram lib creates per-conversation forum topics and supports thread sends", () => {
    const lib = source("src/lib/telegram.ts");
    expect(lib).toContain("export async function createSupportForumTopic");
    expect(lib).toContain("createForumTopic");
    expect(lib).toContain("messageThreadId");
    expect(lib).toContain("message_thread_id");
  });

  it("the webhook routes staff replies by forum topic AND reply-to, human-only", () => {
    const route = source("src/app/api/telegram/support-webhook/route.ts");
    // topic routing
    expect(route).toContain("telegramThreadId: msg.message_thread_id");
    // reply-to fallback kept
    expect(route).toContain("conversation:\\s*");
    // ignore the bot's own forwarded messages / other bots
    expect(route).toContain("is_bot");
    expect(route).toContain('isOwnForward');
    expect(route).toContain('role: "STAFF"');
  });

  it("the Cloudflare worker relays the support webhook (bypasses the edge timeout)", () => {
    const worker = source("../deploy/telegram-proxy-worker.js");
    expect(worker).toContain('path.startsWith("/support-webhook")');
    expect(worker).toContain("/api/telegram");
  });
});
