/**
 * B660/B661 — обложка поста VK и правда о готовности площадок.
 *
 * Владелец 2026-08-05 увидел в сообществе VK пост без единой картинки и Дзен,
 * помеченный как «нужна настройка» при рабочем канале. Две разные причины:
 *
 *  • VK: стеновая загрузка фотографии токену сообщества недоступна (живой
 *    ответ прода — `error_code 27, Group authorization failed`), но открыт путь
 *    через диалоговое хранилище сообщества. Проверяем, что публикация ходит
 *    именно им и что ссылка на фотографию доезжает до `wall.post`.
 *  • Дзен: недостачей считались НЕОБЯЗАТЕЛЬНЫЕ поля, в том числе слепок
 *    браузерной сессии, который после перехода на ленту не нужен вовсе.
 */

const settings: Record<string, string | null> = {};
const enabled: Record<string, boolean> = {};

jest.mock("@/lib/db", () => {
  const db = { externalPublication: { findMany: async () => [], update: jest.fn(), updateMany: jest.fn() } };
  return { __esModule: true, db, default: db };
});

jest.mock("@/lib/marketing/platform-settings", () => {
  const actual = jest.requireActual("@/lib/marketing/platform-settings");
  return {
    __esModule: true,
    MARKETING_PLATFORM_FIELDS: actual.MARKETING_PLATFORM_FIELDS,
    marketingPlatformEnabled: async (platform: string) => enabled[platform] ?? false,
    marketingPlatformValue: async (key: string) => settings[key] ?? null,
    requiredMarketingPlatformValue: async (key: string) => {
      const value = settings[key];
      if (!value) throw new Error(`${key} is not configured`);
      return value;
    },
  };
});

jest.mock("@/lib/marketing/browser-publisher", () => ({
  __esModule: true,
  browserFallbackConfigured: async () => false,
  publishToDzenBrowser: jest.fn(),
}));

jest.mock("@/lib/telegram", () => ({ callTelegramApi: jest.fn() }));

import { publishToVk } from "@/lib/marketing/publish";
import { marketingConnectorStates } from "@/lib/marketing/discovery";
import { platformPublishLimits } from "@/lib/marketing/platform-limits";

type Call = { url: string; body: string };

function mockVkFetch(calls: Call[], overrides: Record<string, unknown> = {}) {
  return jest.fn(async (input: unknown, init?: { body?: unknown }) => {
    const url = String(input);
    const body = init?.body instanceof URLSearchParams ? init.body.toString() : "";
    calls.push({ url, body });

    if (url.includes("/api/marketing/media/")) {
      return {
        ok: true,
        status: 200,
        headers: { get: () => "image/png" },
        arrayBuffer: async () => new ArrayBuffer(16),
      };
    }
    if (url in overrides) return overrides[url];
    if (url.endsWith("photos.getMessagesUploadServer")) {
      return { ok: true, status: 200, json: async () => ({ response: { upload_url: "https://pu.vk.com/upload" } }) };
    }
    if (url === "https://pu.vk.com/upload") {
      return { ok: true, status: 200, json: async () => ({ server: 906118, photo: "[]", hash: "h" }) };
    }
    if (url.endsWith("photos.saveMessagesPhoto")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ response: [{ owner_id: -240493895, id: 457239021, access_key: "ak" }] }),
      };
    }
    if (url.endsWith("wall.post")) {
      return { ok: true, status: 200, json: async () => ({ response: { post_id: 42 } }) };
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
  for (const key of Object.keys(enabled)) delete enabled[key];
});

describe("B660 · обложка поста VK", () => {
  beforeEach(() => {
    enabled.VK = true;
    settings.VK_COMMUNITY_TOKEN = "vk1.a.token";
    settings.VK_COMMUNITY_ID = "240493895";
  });

  it("грузит картинку через диалоговое хранилище и прикладывает её к посту", async () => {
    const calls: Call[] = [];
    global.fetch = mockVkFetch(calls) as unknown as typeof fetch;

    const published = await publishToVk({
      body: "Текст поста",
      mediaUrl: "https://eterapy.com/api/marketing/media/b660",
    });

    const methods = calls.map((call) => call.url);
    // Стеновой путь токену сообщества недоступен — его быть не должно вовсе.
    expect(methods.some((url) => url.includes("photos.getWallUploadServer"))).toBe(false);
    expect(methods.some((url) => url.includes("photos.saveWallPhoto"))).toBe(false);
    expect(methods.some((url) => url.includes("photos.getMessagesUploadServer"))).toBe(true);
    expect(methods.some((url) => url.includes("photos.saveMessagesPhoto"))).toBe(true);

    const wallPost = calls.find((call) => call.url.endsWith("wall.post"));
    expect(wallPost?.body).toContain(encodeURIComponent("photo-240493895_457239021_ak"));
    expect(published.publicUrl).toBe("https://vk.com/wall-240493895_42");
    // Обложка приложена — оговорки о деградации быть не должно.
    expect(published.note).toBeUndefined();
  });

  it("если площадка закроет и этот путь, пост уходит текстом с названной причиной", async () => {
    const calls: Call[] = [];
    global.fetch = mockVkFetch(calls, {
      "https://api.vk.com/method/photos.getMessagesUploadServer": {
        ok: true,
        status: 200,
        json: async () => ({ error: { error_msg: "Group authorization failed" } }),
      },
    }) as unknown as typeof fetch;

    const published = await publishToVk({
      body: "Текст поста",
      mediaUrl: "https://eterapy.com/api/marketing/media/b660",
    });

    expect(published.publicUrl).toBe("https://vk.com/wall-240493895_42");
    expect(published.note).toContain("обложка не приложена");
    const wallPost = calls.find((call) => call.url.endsWith("wall.post"));
    expect(wallPost?.body).not.toContain("attachments");
  });

  it("у VK появилась обязательная визуальная идея — иначе лента остаётся сплошным текстом", () => {
    expect(platformPublishLimits("vk").mediaBriefRequired).toBe(true);
  });
});

describe("B661 · «нужна настройка» только там, где действительно не задано обязательное", () => {
  it("Дзен готов публиковать, когда есть адрес канала и браузерный сервис", async () => {
    // B698: слепок сессии заменён адресом сервиса и маркером доступа. Оба
    // обязательны — без них выпускать в Дзен нечем, а лента читателя не видит.
    enabled.Dzen = true;
    settings.DZEN_CHANNEL_URL = "https://dzen.ru/eterapy";
    settings.DZEN_BROWSER_ENDPOINT = "http://10.77.0.2:7801";
    settings.DZEN_BROWSER_TOKEN = "secret";

    const dzen = (await marketingConnectorStates()).find((row) => row.platform === "Dzen");

    expect(dzen?.ownedPublishing).toBe(true);
    expect(dzen?.missing).toEqual([]);
  });

  it("VK без необязательных полей Callback API не числится ненастроенным", async () => {
    enabled.VK = true;
    settings.VK_COMMUNITY_TOKEN = "vk1.a.token";
    settings.VK_COMMUNITY_ID = "240493895";

    const vk = (await marketingConnectorStates()).find((row) => row.platform === "VK");

    expect(vk?.ownedPublishing).toBe(true);
    expect(vk?.missing).toEqual([]);
  });

  it("отсутствие ОБЯЗАТЕЛЬНОГО поля по-прежнему видно", async () => {
    enabled.Telegram = true;
    settings.TELEGRAM_BOT_TOKEN = "bot:token";

    const telegram = (await marketingConnectorStates()).find((row) => row.platform === "Telegram");

    expect(telegram?.ownedPublishing).toBe(false);
    expect(telegram?.missing).toContain("TELEGRAM_CHANNEL_ID");
    // Необязательная группа обсуждений в недостачу не попадает.
    expect(telegram?.missing).not.toContain("TELEGRAM_DISCUSSION_CHAT_ID");
  });
});
