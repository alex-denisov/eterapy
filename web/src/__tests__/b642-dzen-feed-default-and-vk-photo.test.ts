/**
 * B642 — Дзен и VK на том доступе, который у нас есть.
 *
 * Две проверки на два тупика, найденных живьём 03.08:
 *  • Дзен: материал попадал в ленту только после подтверждения владельца, а
 *    владелец мог подтвердить только уже наполненную ленту. Круг замкнут —
 *    лента пустая, очередь стоит.
 *  • VK: загрузка обложки недоступна токену сообщества, и из-за обложки падал
 *    весь пост.
 */

const settings: Record<string, string | null> = {};
const rows: Array<Record<string, unknown>> = [];
const updateMany = jest.fn();
const update = jest.fn();
const browserPublish = jest.fn();

jest.mock("@/lib/db", () => {
  const db = {
    externalPublication: { findMany: async () => rows, updateMany, update },
  };
  return { __esModule: true, db, default: db };
});

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

jest.mock("@/lib/marketing/browser-publisher", () => ({
  __esModule: true,
  browserFallbackConfigured: async () => Boolean(settings.DZEN_BROWSER_ENDPOINT),
  publishToDzenBrowser: (...args: unknown[]) => browserPublish(...args),
}));

jest.mock("@/lib/telegram", () => ({ callTelegramApi: jest.fn() }));

import { publishToDzen, publishToVk } from "@/lib/marketing/publish";
import { dzenBodyHtml } from "@/lib/marketing/dzen-feed";

const dzenPublication = {
  key: "b642-dzen-2026-08-03",
  title: "Заголовок",
  body: "Текст материала.",
  mediaUrl: null,
};

beforeEach(() => {
  for (const key of Object.keys(settings)) delete settings[key];
  rows.length = 0;
  updateMany.mockReset();
  update.mockReset();
  browserPublish.mockReset();
  settings.DZEN_CHANNEL_URL = "https://dzen.ru/eterapy";
  settings.DZEN_FEED_CONFIRMED = null;
});

describe("B642 → B698 · Дзен: дорога выпуска", () => {
  /**
   * B642 объявил ленту путём по умолчанию, чтобы разорвать замкнутый круг
   * «лента нужна для подтверждения, подтверждение нужно для ленты». Порог
   * оказался другим: владелец 2026-08-07 выяснил, что площадка требует 10
   * ПОДПИСЧИКОВ канала. Пока их нет, лента не доставляет читателю ничего, и
   * путь по умолчанию у Дзена теперь браузерный (B698).
   */
  it("без браузерной сессии и без явного включения ленты — отказ канала, а не тихий выпуск в никуда", async () => {
    const error = await publishToDzen(dzenPublication).then(() => "", (reason: Error) => reason.message);

    expect(browserPublish).not.toHaveBeenCalled();
    expect(error).toMatch(/not configured/i);
  });

  it("настроенная браузерная сессия — действующий путь", async () => {
    settings.DZEN_BROWSER_ENDPOINT = "http://10.77.0.2:7801";
    settings.DZEN_BROWSER_TOKEN = "secret";
    browserPublish.mockResolvedValue({ externalPostId: "dzen-123", publicUrl: "https://dzen.ru/a/123" });

    const published = await publishToDzen(dzenPublication);

    expect(browserPublish).toHaveBeenCalledTimes(1);
    expect(published.externalPostId).toBe("dzen-123");
  });

  it("отметка «лента подключена» больше не отбирает выпуск у браузера", async () => {
    settings.DZEN_BROWSER_ENDPOINT = "http://10.77.0.2:7801";
    settings.DZEN_BROWSER_TOKEN = "secret";
    settings.DZEN_FEED_CONFIRMED = "true";
    settings.DZEN_FEED_PUBLISHING_ENABLED = "true";
    browserPublish.mockResolvedValue({ externalPostId: "dzen-123", publicUrl: "https://dzen.ru/a/123" });

    await publishToDzen(dzenPublication);

    expect(browserPublish).toHaveBeenCalledTimes(1);
  });

  it("лента остаётся рабочей дорогой — её включают явно, когда наберётся 10 подписчиков", async () => {
    settings.DZEN_FEED_PUBLISHING_ENABLED = "true";

    const published = await publishToDzen(dzenPublication);

    expect(published.externalPostId).toBe("dzen-feed:b642-dzen-2026-08-03");
    // Лента — pull: адреса в момент передачи ещё нет, и выдумывать его нельзя.
    expect(published.publicUrl).toBeNull();
  });
});

describe("B642 · VK: обложка не топит пост", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    settings.VK_COMMUNITY_TOKEN = "vk-community-token";
    settings.VK_COMMUNITY_ID = "-123456";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it("групповая авторизация без загрузки фото — пост уходит текстом и говорит почему", async () => {
    jest.spyOn(console, "warn").mockImplementation(() => undefined);
    const calls: string[] = [];
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push(url);
      if (url.includes("/media.png")) {
        return new Response(new ArrayBuffer(8), { status: 200, headers: { "content-type": "image/png" } });
      }
      if (url.includes("photos.getMessagesUploadServer")) {
        return Response.json({
          error: { error_msg: "Group authorization failed: method is unavailable with group auth." },
        });
      }
      if (url.includes("wall.post")) {
        const body = String(init?.body ?? "");
        // Главное: пост ушёл, и в нём нет ссылки на несуществующее вложение.
        expect(body).not.toContain("attachments");
        return Response.json({ response: { post_id: 77 } });
      }
      throw new Error(`unexpected call ${url}`);
    }) as typeof fetch;

    const published = await publishToVk({
      body: "Текст поста со ссылкой https://eterapy.com/library/x",
      mediaUrl: "https://eterapy.com/media.png",
    });

    expect(published.externalPostId).toBe("77");
    expect(published.publicUrl).toBe("https://vk.com/wall-123456_77");
    expect(published.note).toContain("обложка не приложена");
    expect(calls.some((url) => url.includes("wall.post"))).toBe(true);
  });

  // B660: путь загрузки сменился со стенового на диалоговый — стеновой токену
  // сообщества недоступен в принципе. Проверка «загрузилась → приложена»
  // остаётся той же по смыслу, методы другие.
  it("когда обложка загрузилась, она прикладывается и заметки нет", async () => {
    global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes("/media.png")) {
        return new Response(new ArrayBuffer(8), { status: 200, headers: { "content-type": "image/png" } });
      }
      if (url.includes("photos.getMessagesUploadServer")) {
        return Response.json({ response: { upload_url: "https://upload.vk.com/x" } });
      }
      if (url.includes("upload.vk.com")) {
        return Response.json({ server: 1, photo: "[]", hash: "h" });
      }
      if (url.includes("photos.saveMessagesPhoto")) {
        return Response.json({ response: [{ owner_id: -123456, id: 9 }] });
      }
      if (url.includes("wall.post")) {
        expect(String(init?.body ?? "")).toContain("attachments=photo-123456_9");
        return Response.json({ response: { post_id: 78 } });
      }
      throw new Error(`unexpected call ${url}`);
    }) as typeof fetch;

    const published = await publishToVk({
      body: "Текст поста",
      mediaUrl: "https://eterapy.com/media.png",
    });

    expect(published.note).toBeUndefined();
    expect(published.externalPostId).toBe("78");
  });

  it("отказ самой стены остаётся отказом — деградация только по обложке", async () => {
    global.fetch = (async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("wall.post")) {
        return Response.json({ error: { error_code: 214, error_msg: "Access to adding post denied" } });
      }
      throw new Error(`unexpected call ${url}`);
    }) as typeof fetch;

    await expect(publishToVk({ body: "Текст поста", mediaUrl: null }))
      .rejects.toThrow(/wall\.post failed \(214\)/);
  });
});

describe("B642 · разметка выделений в ленте", () => {
  it("**жирный** становится тегом, а не звёздочками в тексте", () => {
    expect(dzenBodyHtml("**Три вопроса:**\nПервый")).toBe(
      "<p><strong>Три вопроса:</strong><br />Первый</p>",
    );
  });

  it("одиночная звёздочка и умножение остаются текстом", () => {
    expect(dzenBodyHtml("Цена 5 * 3 и звёздочка *тут*")).toBe(
      "<p>Цена 5 * 3 и звёздочка *тут*</p>",
    );
  });

  it("экранирование остаётся первым: чужие теги внутрь не проходят", () => {
    expect(dzenBodyHtml("**<script>alert(1)</script>**")).toBe(
      "<p><strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong></p>",
    );
  });
});
