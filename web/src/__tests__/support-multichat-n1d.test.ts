import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("B482 — retired Telegram bidirectional support", () => {
  it("has no per-client Telegram topics or reply routing", () => {
    const lib = source("src/lib/telegram.ts");
    const outbound = source("src/app/api/support/messages/route.ts");
    const inbound = source("src/app/api/telegram/support-webhook/route.ts");
    expect(lib).not.toContain("createForumTopic");
    expect(outbound).not.toContain("messageThreadId");
    expect(inbound).not.toContain("telegramThreadId");
    expect(inbound).not.toContain("conversation:");
  });

  it("keeps the old relay path harmless while infrastructure is cleaned up", () => {
    const worker = source("../deploy/telegram-proxy-worker.js");
    const inbound = source("src/app/api/telegram/support-webhook/route.ts");
    expect(worker).toContain('path.startsWith("/support-webhook")');
    expect(inbound).toContain("supportRepliesDisabled: true");
  });
});
