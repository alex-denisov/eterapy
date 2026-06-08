import { readFileSync } from "fs";
import { join } from "path";

function source(rel: string): string {
  return readFileSync(join(process.cwd(), rel), "utf8");
}

/**
 * M25 — Механика 5: linking Telegram must enable every Telegram notification
 * toggle (TELEGRAM defaults to OFF), so the "вы будете получать уведомления"
 * promise is actually true.
 */
describe("M25 Telegram notifications on link (Механика 5)", () => {
  it("notifications lib exposes enableAllTelegramNotifications over ALL_EVENTS", () => {
    const lib = source("src/lib/notifications.ts");
    expect(lib).toContain("export async function enableAllTelegramNotifications");
    expect(lib).toContain('channel: "TELEGRAM"');
    expect(lib).toContain("ALL_EVENTS_LIST.map");
    expect(lib).toContain("enabled: true");
  });

  it("the webhook link handler enables Telegram toggles on link", () => {
    const webhook = source("src/app/api/telegram/webhook/route.ts");
    expect(webhook).toContain("enableAllTelegramNotifications(link.userId)");
  });
});
