/**
 * B698 — ускорители ленты живут ровно столько, сколько живёт лента.
 *
 * ЧТО БЫЛО НЕ ТАК. Число 10 звалось «порогом площадки» и держало на себе два
 * механизма: черновики Дзена брались ВНЕ окна опережения, а сожжённые статьи
 * пополнения возвращались из архива. Оба обещали выключиться «сами, на десятом
 * материале в ленте».
 *
 * Обещание держалось на том, что лента растёт. Порог у площадки оказался в
 * десяти ПОДПИСЧИКАХ канала, выпуск переехал на браузерную сессию, лента расти
 * перестала — и условие окончания стало недостижимым. Ускорение без условия
 * окончания означает, что расписание материалов Дзена перестало значить
 * что-либо, а архив воскрешается бесконечно.
 */

const settings: Record<string, string | null> = {};
const findMany = jest.fn();

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformValue: async (key: string) => settings[key] ?? null,
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: { externalPublication: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

import { dzenFeedNeedsTopUp } from "@/lib/marketing/dzen-feed";

const feedRow = (key: string) => ({
  key,
  title: "Заголовок",
  body: "Текст",
  destinationUrl: null,
  mediaUrl: null,
  publishedAt: new Date("2026-08-01T06:30:00Z"),
  cluster: null,
});

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
  findMany.mockReset().mockResolvedValue([]);
});

describe("ускорение наполнения ленты", () => {
  it("выключено, пока выпуск идёт браузером: лента не растёт вовсе", async () => {
    await expect(dzenFeedNeedsTopUp()).resolves.toBe(false);
    // Реестр даже не читается: сначала спрашиваем, работает ли то, что ускоряем.
    expect(findMany).not.toHaveBeenCalled();
  });

  it("включено, когда владелец включил выпуск лентой и лента недобрана", async () => {
    settings.DZEN_FEED_PUBLISHING_ENABLED = "true";
    findMany.mockResolvedValue([feedRow("a"), feedRow("b")]);

    await expect(dzenFeedNeedsTopUp()).resolves.toBe(true);
  });

  it("выключается само, когда планка взята", async () => {
    settings.DZEN_FEED_PUBLISHING_ENABLED = "true";
    findMany.mockResolvedValue(Array.from({ length: 10 }, (_, index) => feedRow(`k${index}`)));

    await expect(dzenFeedNeedsTopUp()).resolves.toBe(false);
  });

  it("отказ базы не включает ускорение", async () => {
    settings.DZEN_FEED_PUBLISHING_ENABLED = "true";
    findMany.mockRejectedValue(new Error("база недоступна"));

    await expect(dzenFeedNeedsTopUp()).resolves.toBe(false);
  });
});
