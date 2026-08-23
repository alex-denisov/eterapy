/**
 * B702 фаза 6 — живые темы из открытых Telegram-каналов.
 *
 * Поправка владельца 2026-08-11: «у тебя есть еще разного рода Telegram каналы
 * открытые, которые тоже можно парсить». Читаем публичную веб-версию канала
 * (`t.me/s/<канал>`) — без бота, без вступления и без чужих прав.
 */

const settings: Record<string, string | null> = {};

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformValue: async (key: string) => settings[key] ?? null,
}));

import {
  TELEGRAM_TREND_MIN_POSTS,
  telegramChannelTrends,
  TELEGRAM_TREND_DEFAULT_CHANNELS,
} from "@/lib/marketing/trend-telegram";

/** Страница канала: каждый пост — один блок `tgme_widget_message_text`. */
function page(...posts: string[]): string {
  return posts
    .map((text) => `<div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div>`)
    .join("\n");
}

function respond(body: string) {
  return { ok: true, status: 200, text: async () => body } as unknown as Response;
}

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
  settings.MARKETING_TREND_TELEGRAM_CHANNELS = "psy_channel";
});

describe("B702 фаза 6 — тренды из открытых Telegram-каналов", () => {
  it("тема, повторяющаяся в нескольких постах, становится кандидатом", async () => {
    const fetchImpl = jest.fn(async () => respond(page(
      "Сегодня снова про эмоциональное выгорание: читатели пишут каждый день",
      "Эмоциональное выгорание у молодых родителей — отдельный разговор",
      "Ставьте плюс, если знакомо эмоциональное выгорание на удалёнке",
    )));

    const trends = await telegramChannelTrends({ fetchImpl });

    expect(fetchImpl).toHaveBeenCalledWith("https://t.me/s/psy_channel", expect.anything());
    expect(trends.length).toBeGreaterThan(0);
    expect(trends[0].topic).toContain("выгорание");
    expect(trends[0].source).toBe("telegramChannels");
    expect(trends[0].keywords.length).toBeGreaterThan(0);
  });

  it("тема из одного поста трендом не считается", async () => {
    const fetchImpl = jest.fn(async () => respond(page(
      "Единственное упоминание про нумерологический код судьбы за всю ленту",
      "Совсем другой пост про совсем другое",
      "И третий пост ни о чём похожем",
    )));

    const trends = await telegramChannelTrends({ fetchImpl });

    expect(TELEGRAM_TREND_MIN_POSTS).toBeGreaterThan(1);
    expect(trends.some((item) => item.topic.includes("нумерологическ"))).toBe(false);
  });

  it("сбой одного канала не отменяет остальные", async () => {
    settings.MARKETING_TREND_TELEGRAM_CHANNELS = "dead_channel, live_channel";
    const fetchImpl = jest.fn(async (url: string) => {
      if (url.includes("dead_channel")) throw new Error("сеть недоступна");
      return respond(page(
        "Тревога перед сном стала темой недели",
        "Опять тревога перед сном: пишут каждый вечер",
      ));
    });

    const trends = await telegramChannelTrends({ fetchImpl: fetchImpl as never });

    expect(trends.length).toBeGreaterThan(0);
    expect(trends.every((item) => item.referenceUrl === "https://t.me/s/live_channel")).toBe(true);
  });

  /**
   * B719 — ПОВЕДЕНИЕ ПРИ ПУСТОЙ НАСТРОЙКЕ ИЗМЕНЕНО НАМЕРЕННО.
   *
   * Прежде источник при пустой настройке молчал. Это выглядело безопасно и
   * было худшим из исходов: нода, где настройку не заполнили, теряла источник
   * трендов ЦЕЛИКОМ и не сообщала об этом — планировщик просто получал на
   * один сигнал меньше. Правило владельца от 2026-07-22 закрывает такой класс
   * ошибок: значение, живущее только в ручной настройке, до прода не доезжает.
   *
   * Теперь пустая настройка означает «берём список из кода», а молчание
   * остаётся только у явно пустого списка, переданного вызывающим.
   */
  it("пустая настройка берёт список каналов из кода, а не молчит", async () => {
    settings.MARKETING_TREND_TELEGRAM_CHANNELS = null;
    const fetchImpl = jest.fn(async () => respond(page("тема одна", "тема одна")));

    await telegramChannelTrends({ fetchImpl: fetchImpl as never });
    expect(fetchImpl.mock.calls.length).toBe(TELEGRAM_TREND_DEFAULT_CHANNELS.length);
  });

  it("явно пустой список каналов в сеть не ходит", async () => {
    const fetchImpl = jest.fn();
    await expect(telegramChannelTrends({ channels: [], fetchImpl: fetchImpl as never }))
      .resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("разметка и служебные слова не попадают в тему", async () => {
    const fetchImpl = jest.fn(async () => respond(page(
      'Разбор <a href="https://example.com">по ссылке</a> про <b>детские травмы</b> и их следы',
      "Ещё раз про детские травмы — и почему они не приговор",
    )));

    const trends = await telegramChannelTrends({ fetchImpl });

    expect(trends.length).toBeGreaterThan(0);
    for (const item of trends) {
      expect(item.topic).not.toMatch(/[<>]/);
      expect(item.topic).not.toMatch(/https?:/);
      // «про», «и», «их» — служебные, темой быть не могут.
      expect(item.topic.split(" ").every((word) => word.length >= 3)).toBe(true);
    }
  });
});
