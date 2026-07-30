import fs from "fs";
import path from "path";
import {
  formatTelegramGrowthMessage,
  getTrackedTelegramMiniAppUrl,
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

  it("adds stable source attribution to Bot API Mini App launches", () => {
    const menu = new URL(getTrackedTelegramMiniAppUrl("https://eterapy.com/miniapp?miniapp=telegram", "bot_menu"));
    expect(menu.searchParams.get("source")).toBe("telegram");
    expect(menu.searchParams.get("channel")).toBe("telegram_bot");
    expect(menu.searchParams.get("entry")).toBe("bot_menu");
    expect(menu.searchParams.get("utm_source")).toBe("telegram");
    expect(menu.searchParams.get("utm_medium")).toBe("bot");
    expect(menu.searchParams.get("utm_campaign")).toBe("miniapp");

    const preserved = new URL(getTrackedTelegramMiniAppUrl("https://eterapy.com/miniapp?utm_campaign=custom", "bot_welcome"));
    expect(preserved.searchParams.get("utm_campaign")).toBe("custom");
    expect(preserved.searchParams.get("entry")).toBe("bot_welcome");
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

  it("records the resolved Mini App platform and guards the deploy secret identity", () => {
    const shell = source("src/components/miniapp/miniapp-shell.tsx");
    const deploy = source("../.github/workflows/deploy.yml");

    expect(shell).toContain("if (!platform) return");
    expect(shell).toContain("channel: search.get(\"channel\")");
    expect(shell).toContain("entry: search.get(\"entry\")");
    // B627: шаг проверяет личность обоих ботов — продуктового и деплойного.
    // Подробности разделения держит b627-deploy-bot-identity.test.ts.
    expect(deploy).toContain("Verify Telegram bot identities");
    expect(deploy).toContain('verify "$TG_PRODUCT_TOKEN" "eterapy_bot" "TELEGRAM_BOT_TOKEN"');
  });
});
