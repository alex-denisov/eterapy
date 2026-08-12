/**
 * B707 — источник тем B702 фазы 6 ходил на `t.me` напрямую и молчал на проде.
 *
 * Замер боевой ноды 2026-08-12 22:20 MSK: и `t.me`, и `api.telegram.org`
 * отвечают таймаутом — Telegram для РФ-ноды закрыт целиком. Бот об этом знает и
 * ходит через релей (`TELEGRAM_API_BASE`), а источник трендов ходил обычным
 * `fetch` и возвращал ноль тем без единой ошибки: `allSettled` глотает отказ
 * канала по построению, и «каналов не задано» выглядело ровно так же, как
 * «каналы недоступны».
 *
 * Тесты этого не ловили и поймать не могли: они подставляют `fetchImpl`, то
 * есть проверяют разбор страницы, а не дорогу до неё.
 *
 * Дорога берётся уже существующая — шлюз B633 с закрытым списком адресов
 * (`EDGE_RELAY_UPSTREAMS`). Второй механизм заводить нельзя: два способа выйти
 * наружу разойдутся молча, как разошлись бы два пути правки промта (B706).
 */

const settings: Record<string, string | null> = {};

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformValue: async (key: string) => settings[key] ?? null,
}));

import { EDGE_RELAY_UPSTREAMS } from "@/lib/integrations/edge-relay";
import {
  TELEGRAM_TREND_CHANNEL_LIMIT,
  telegramChannelPageRequest,
  telegramChannelTrends,
} from "@/lib/marketing/trend-telegram";

function page(...posts: string[]): string {
  return posts
    .map((text) => `<div class="tgme_widget_message_text js-message_text" dir="auto">${text}</div>`)
    .join("\n");
}

function respond(body: string) {
  return { ok: true, status: 200, text: async () => body } as unknown as Response;
}

const RELAY_BASE = "https://relay.example.test/api/integrations/meta/relay";
const RELAY_SECRET = "s3cret-value";

const savedEnv = {
  base: process.env.META_GRAPH_PROXY_BASE,
  secret: process.env.META_GRAPH_PROXY_SECRET,
};

function useRelay() {
  process.env.META_GRAPH_PROXY_BASE = RELAY_BASE;
  process.env.META_GRAPH_PROXY_SECRET = RELAY_SECRET;
}

function useNoRelay() {
  delete process.env.META_GRAPH_PROXY_BASE;
  delete process.env.META_GRAPH_PROXY_SECRET;
}

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
  settings.MARKETING_TREND_TELEGRAM_CHANNELS = "psy_channel";
  useNoRelay();
});

afterAll(() => {
  if (savedEnv.base === undefined) delete process.env.META_GRAPH_PROXY_BASE;
  else process.env.META_GRAPH_PROXY_BASE = savedEnv.base;
  if (savedEnv.secret === undefined) delete process.env.META_GRAPH_PROXY_SECRET;
  else process.env.META_GRAPH_PROXY_SECRET = savedEnv.secret;
});

describe("B707 — открытые каналы читаются через контролируемый шлюз", () => {
  it("веб-версия Telegram есть в закрытом списке адресов шлюза", () => {
    expect(EDGE_RELAY_UPSTREAMS["telegram-web"]).toBe("https://t.me");
  });

  it("при настроенном шлюзе запрос идёт на шлюз и несёт секрет", () => {
    useRelay();

    const request = telegramChannelPageRequest("psy_channel");

    expect(request.url).toBe(
      "https://relay.example.test/api/integrations/edge/relay/telegram-web/s/psy_channel",
    );
    expect(request.headers["x-eterapy-proxy"]).toBe(RELAY_SECRET);
  });

  it("без секрета шлюз не используется: адрес без секрета получил бы 403", () => {
    process.env.META_GRAPH_PROXY_BASE = RELAY_BASE;
    delete process.env.META_GRAPH_PROXY_SECRET;

    const request = telegramChannelPageRequest("psy_channel");

    expect(request.url).toBe("https://t.me/s/psy_channel");
    expect(request.headers).toEqual({});
  });

  it("без шлюза остаётся прямой адрес — поведение вне РФ не меняется", () => {
    const request = telegramChannelPageRequest("psy_channel");

    expect(request.url).toBe("https://t.me/s/psy_channel");
    expect(request.headers).toEqual({});
  });

  it("имя канала экранируется, а не подставляется в путь как есть", () => {
    useRelay();

    expect(telegramChannelPageRequest("a b/../admin").url).toBe(
      "https://relay.example.test/api/integrations/edge/relay/telegram-web/s/a%20b%2F..%2Fadmin",
    );
  });

  it("ссылка на источник остаётся публичной, а не адресом нашего шлюза", async () => {
    useRelay();
    const fetchImpl = jest.fn(async (_url: string, _init?: RequestInit) => respond(page(
      "Сегодня снова про эмоциональное выгорание: пишут каждый день",
      "Эмоциональное выгорание у молодых родителей — отдельный разговор",
      "Ставьте плюс, если знакомо эмоциональное выгорание на удалёнке",
    )));

    const trends = await telegramChannelTrends({ fetchImpl: fetchImpl as unknown as typeof fetch });

    // Ходили через шлюз…
    expect(fetchImpl.mock.calls[0][0]).toContain("/telegram-web/s/psy_channel");
    // …а сослались на страницу, которую видит человек.
    expect(trends.length).toBeGreaterThan(0);
    expect(trends[0].referenceUrl).toBe("https://t.me/s/psy_channel");
  });

  it("секрет шлюза уезжает заголовком запроса, а не в теме кандидата", async () => {
    useRelay();
    const fetchImpl = jest.fn(async (_url: string, _init?: RequestInit) => respond(page(
      "Разговор про эмоциональное выгорание продолжается",
      "Эмоциональное выгорание — тема недели",
    )));

    const trends = await telegramChannelTrends({ fetchImpl: fetchImpl as unknown as typeof fetch });

    const init = fetchImpl.mock.calls[0][1];
    expect((init?.headers as Record<string, string>)["x-eterapy-proxy"]).toBe(RELAY_SECRET);
    expect(JSON.stringify(trends)).not.toContain(RELAY_SECRET);
  });

  it("тринадцать каналов владельца читаются все: лимит выше их числа", async () => {
    const owner = [
      "SilaSlov", "st_ezoterika", "astrologiya_ezoterika_kosmos", "anael_numerolog",
      "psikhologiak", "otnoshenia_psi", "pcollege_EvaSneg", "astrogiks",
      "lykova_taro", "taro1", "tarogks", "natanlayakarta", "YourHumanDesignRu",
    ];
    settings.MARKETING_TREND_TELEGRAM_CHANNELS = owner.join("\n");
    const fetchImpl = jest.fn(async () => respond(page("пусто")));

    await telegramChannelTrends({ fetchImpl });

    expect(TELEGRAM_TREND_CHANNEL_LIMIT).toBeGreaterThanOrEqual(owner.length);
    expect(fetchImpl).toHaveBeenCalledTimes(owner.length);
  });
});
