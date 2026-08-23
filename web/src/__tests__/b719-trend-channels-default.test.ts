/**
 * B719 — список каналов-источников трендов.
 *
 * Владелец 2026-08-23: «список телеграм-каналов я хочу чтобы ты составил сам».
 *
 * ⚠ ЧТО ПРОГОН МОЖЕТ И ЧЕГО НЕ МОЖЕТ. Он не звонит в Telegram — открытость и
 * живость каждого канала проверены обращением к `t.me/s/<канал>` 2026-08-23, и
 * это доказательство живёт в комментарии у самого списка. Прогон сторожит
 * СВОЙСТВА списка: что умолчание существует (иначе источник молча пуст на
 * ноде, где настройку забыли), что настройка его переопределяет, что список
 * влезает в предел чтения за проход и что тематическое разнообразие не
 * схлопнулось в двадцать лент одного гороскопа.
 */

import {
  TELEGRAM_TREND_CHANNEL_LIMIT,
  TELEGRAM_TREND_DEFAULT_CHANNELS,
  telegramChannelTrends,
} from "@/lib/marketing/trend-telegram";

jest.mock("@/lib/marketing/platform-settings", () => ({
  marketingPlatformValue: jest.fn(async () => null),
}));

describe("B719 — умолчание списка каналов", () => {
  it("список не пуст и влезает в предел чтения за проход", () => {
    expect(TELEGRAM_TREND_DEFAULT_CHANNELS.length).toBeGreaterThan(10);
    expect(TELEGRAM_TREND_DEFAULT_CHANNELS.length)
      .toBeLessThanOrEqual(TELEGRAM_TREND_CHANNEL_LIMIT);
  });

  it("ни один канал не повторяется: дубль читался бы дважды за проход", () => {
    expect(new Set(TELEGRAM_TREND_DEFAULT_CHANNELS).size)
      .toBe(TELEGRAM_TREND_DEFAULT_CHANNELS.length);
  });

  it("имена записаны без @ и без адреса — их подставляет сам источник", () => {
    for (const channel of TELEGRAM_TREND_DEFAULT_CHANNELS) {
      expect(channel).toMatch(/^[A-Za-z0-9_]{4,32}$/u);
    }
  });

  it("каждый наш кластер представлен хотя бы одной лентой", () => {
    const list = new Set<string>(TELEGRAM_TREND_DEFAULT_CHANNELS);
    // Расчёты по дате рождения — самый крупный кластер спроса и самый узкий по
    // предложению открытых каналов. Если эти две строки исчезнут, темы матрицы
    // перестанут находиться вовсе, и знать об этом надо сразу.
    expect(list.has("st_ezoterika")).toBe(true);
    expect(list.has("anael_numerolog")).toBe(true);
    expect(list.has("YourHumanDesignRu")).toBe(true);
    expect(list.has("natanlayakarta")).toBe(true);
  });

  it("разнообразие: ни один подвид не занимает больше половины списка", () => {
    const tarot = TELEGRAM_TREND_DEFAULT_CHANNELS.filter((c) => /taro/i.test(c));
    const horoscope = TELEGRAM_TREND_DEFAULT_CHANNELS.filter((c) => /goro|astro|kosmo|zeml/i.test(c));
    const half = TELEGRAM_TREND_DEFAULT_CHANNELS.length / 2;
    expect(tarot.length).toBeLessThan(half);
    expect(horoscope.length).toBeLessThan(half);
  });
});

describe("B719 — умолчание уступает настройке, а не спорит с ней", () => {
  const settings = jest.requireMock("@/lib/marketing/platform-settings") as {
    marketingPlatformValue: jest.Mock;
  };

  afterEach(() => settings.marketingPlatformValue.mockReset());

  const readChannels = async () => {
    const seen: string[] = [];
    await telegramChannelTrends({
      fetchImpl: (async (url: string) => {
        seen.push(String(url));
        return { ok: true, text: async () => "" } as unknown as Response;
      }) as unknown as typeof fetch,
    });
    return seen;
  };

  it("пустая настройка — читаются каналы из кода", async () => {
    settings.marketingPlatformValue.mockResolvedValue(null);
    const seen = await readChannels();
    expect(seen.length).toBe(TELEGRAM_TREND_DEFAULT_CHANNELS.length);
    expect(seen.join(" ")).toContain("st_ezoterika");
  });

  it("заполненная настройка сильнее кода: владелец правит список без выкатки", async () => {
    settings.marketingPlatformValue.mockResolvedValue("own_channel_one\nown_channel_two");
    const seen = await readChannels();
    expect(seen.length).toBe(2);
    expect(seen.join(" ")).toContain("own_channel_one");
    expect(seen.join(" ")).not.toContain("st_ezoterika");
  });
});
