import fs from "fs";
import path from "path";
import {
  formatTelegramGrowthMessage,
  getTelegramStartUrl,
  resolveTelegramGrowthPayload,
  TELEGRAM_GROWTH_ENTRIES,
} from "@/lib/telegram-growth";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B204 Telegram growth surfaces", () => {
  it("defines start payloads for dialogue, practice, circle, and pair", () => {
    expect(TELEGRAM_GROWTH_ENTRIES.map((entry) => entry.key)).toEqual([
      "dialogue",
      "practice",
      "circle",
      "pair",
    ]);
    // B385: legacy "circle" payload kept for back-compat but now routes to «Вместе» (/pair).
    expect(resolveTelegramGrowthPayload("tg_circle")?.webPath).toContain("/pair");
    expect(resolveTelegramGrowthPayload("tg_circle")?.label).toBe("Вместе");
    expect(resolveTelegramGrowthPayload("pair")?.webPath).toContain("/pair");
    expect(getTelegramStartUrl("practice")).toContain("start=practice");
  });

  it("formats Telegram messages with web fallback links and channel attribution", () => {
    const entry = resolveTelegramGrowthPayload("practice");
    expect(entry).toBeTruthy();
    const message = formatTelegramGrowthMessage(entry!);

    expect(message).toContain("Ежедневная практика");
    expect(message).toContain("channel=telegram_bot");
    expect(message).toContain("Открыть в ETerapy");
  });

  it("wires deeplinks into the public Telegram page and webhook without breaking link tokens", () => {
    const page = source("src/app/telegram/page.tsx");
    const webhook = source("src/app/api/telegram/webhook/route.ts");

    expect(page).toContain("TELEGRAM_GROWTH_ENTRIES");
    expect(page).toContain('data-testid="telegram-growth-deeplinks"');
    expect(webhook).toContain("resolveTelegramGrowthPayload");
    expect(webhook).toContain("formatTelegramGrowthMessage");
    expect(webhook.indexOf("resolveTelegramGrowthPayload")).toBeLessThan(webhook.indexOf("db.telegramLinkToken.findUnique"));
  });
});
