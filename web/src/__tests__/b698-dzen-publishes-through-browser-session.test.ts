/**
 * B698 — выпуск в Дзен идёт браузерной сессией, лента RSS выключена.
 *
 * Владелец 2026-08-07: порог площадки — 10 ПОДПИСЧИКОВ канала, а не 10
 * материалов в ленте. Пока их нет, лента не доставляет читателю ничего: замер
 * прода показал, что у строк, «выпущенных» лентой, публичного адреса нет вовсе.
 *
 * Здесь держатся три свойства:
 *   1. настроенная браузерная сессия побеждает ленту всегда;
 *   2. лента используется, только если владелец включил её ЯВНО;
 *   3. когда не настроено ничего — отказ распознаётся как отказ КАНАЛА,
 *      то есть материал не бракуется и слот не сгорает (класс B695/B636).
 */

const settings: Record<string, string | null> = {};

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformEnabled: async () => true,
  marketingPlatformValue: async (key: string) => settings[key] ?? null,
  requiredMarketingPlatformValue: async (key: string) => {
    const value = settings[key];
    if (!value) throw new Error(`${key} is not configured`);
    return value;
  },
}));

const publishToDzenBrowser = jest.fn();
jest.mock("@/lib/marketing/browser-publisher", () => ({
  __esModule: true,
  browserFallbackConfigured: async () => Boolean(settings.DZEN_BROWSER_ENDPOINT && settings.DZEN_BROWSER_TOKEN),
  publishToDzenBrowser: (...args: unknown[]) => publishToDzenBrowser(...args),
}));

import { publishToDzen } from "@/lib/marketing/publish";
import { isChannelLevelPublicationError } from "@/lib/marketing/publish-hold";

const MATERIAL = {
  key: "b620-rss-dzen-01",
  title: "Что делать, когда партнёр молчит",
  body: "Текст статьи.",
  mediaUrl: null,
};

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
  publishToDzenBrowser.mockReset().mockResolvedValue({
    externalPostId: "anPQHOLDOGLM",
    publicUrl: "https://dzen.ru/a/anPQHOLDOGLM",
  });
});

describe("дорога выпуска", () => {
  it("идёт браузером, когда сессия настроена", async () => {
    settings.DZEN_BROWSER_ENDPOINT = "http://10.77.0.2:7801";
    settings.DZEN_BROWSER_TOKEN = "secret";

    await expect(publishToDzen(MATERIAL)).resolves.toMatchObject({
      publicUrl: "https://dzen.ru/a/anPQHOLDOGLM",
    });
    expect(publishToDzenBrowser).toHaveBeenCalledTimes(1);
  });

  it("идёт браузером ДАЖЕ если владелец отметил ленту подключённой", async () => {
    // Прежний порядок отдавал ленте приоритет по этому признаку — и материал
    // уходил в ленту, которую никто не читает.
    settings.DZEN_BROWSER_ENDPOINT = "http://10.77.0.2:7801";
    settings.DZEN_BROWSER_TOKEN = "secret";
    settings.DZEN_FEED_CONFIRMED = "true";
    settings.DZEN_FEED_PUBLISHING_ENABLED = "true";

    await publishToDzen(MATERIAL);
    expect(publishToDzenBrowser).toHaveBeenCalledTimes(1);
  });

  it("лентой — только когда владелец включил выпуск лентой явно", async () => {
    settings.DZEN_FEED_PUBLISHING_ENABLED = "true";

    await expect(publishToDzen(MATERIAL)).resolves.toMatchObject({
      externalPostId: expect.stringContaining("dzen-feed:"),
      publicUrl: null,
    });
    expect(publishToDzenBrowser).not.toHaveBeenCalled();
  });

  it("одной отметки «лента подключена» больше не хватает", async () => {
    settings.DZEN_FEED_CONFIRMED = "true";
    await expect(publishToDzen(MATERIAL)).rejects.toThrow(/not configured/i);
  });
});

describe("когда не настроено ничего", () => {
  it("отказ распознаётся как отказ канала, а не как брак материала", async () => {
    // Это и есть защита слота: отказ канала ставит площадку на паузу, строки
    // остаются SCHEDULED (B636), а не архивируются с освобождением слота.
    const error = await publishToDzen(MATERIAL).then(() => null, (reason: Error) => reason.message);
    expect(error).not.toBeNull();
    expect(isChannelLevelPublicationError(error)).toBe(true);
  });

  it("объясняет владельцу причину словами, а не кодом поля", async () => {
    const error = await publishToDzen(MATERIAL).then(() => "", (reason: Error) => reason.message);
    expect(error).toContain("10 подписчиков");
    expect(error).toContain("Площадки и возможности");
  });
});
