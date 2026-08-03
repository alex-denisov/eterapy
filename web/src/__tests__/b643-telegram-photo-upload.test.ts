/**
 * B643 — обложку в Telegram грузим байтами, а не ссылкой.
 *
 * ЧТО ПОКАЗАЛИ ЛОГИ ПРОДА. Три материала умерли с «Telegram sendPhoto failed:
 * Bad Request: failed to get HTTP URL content». В журнале nginx за всё время
 * существования эндпоинта картинки — 91 запрос, из них 87 наши собственные
 * (сборщик метрик) и 4 из Москвы. Обращений от Telegram нет НИ ОДНОГО.
 *
 * То есть серверы Telegram нашу ссылку не забирали вовсе. eterapy.com смотрит
 * на РФ-ноду напрямую (A-запись, без прокси Cloudflare), и это зеркало INC-098:
 * там api.telegram.org недоступен с нашей ноды, здесь наша нода недоступна для
 * Telegram. Отказ происходит вне нашего периметра и не оставляет следов —
 * отлаживать нечего.
 *
 * Наша нода при этом свою же картинку берёт, а до Bot API дотягивается через
 * релей. Значит байты надо донести самим.
 */

const callTelegramApi = jest.fn();
const callTelegramApiWithPhoto = jest.fn();

jest.mock("@/lib/telegram", () => ({
  __esModule: true,
  callTelegramApi: (...args: unknown[]) => callTelegramApi(...args),
  callTelegramApiWithPhoto: (...args: unknown[]) => callTelegramApiWithPhoto(...args),
}));

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformEnabled: jest.fn().mockResolvedValue(true),
  marketingPlatformValue: jest.fn().mockResolvedValue("@eterapy_channel"),
  requiredMarketingPlatformValue: jest.fn().mockResolvedValue("@eterapy_channel"),
}));

import { publishToTelegram } from "@/lib/marketing/publish";

const MEDIA_URL = "https://eterapy.com/api/marketing/media/b610-2w-telegram-20260805-01";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const okResponse = {
  ok: true,
  result: { message_id: 77, chat: { username: "eterapy_channel" } },
};

function mockMediaFetch(init: { ok: boolean; contentType?: string }) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: init.ok,
    status: init.ok ? 200 : 404,
    headers: { get: () => init.contentType ?? "image/png" },
    arrayBuffer: async () => PNG.buffer,
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  callTelegramApi.mockReset().mockResolvedValue(okResponse);
  callTelegramApiWithPhoto.mockReset().mockResolvedValue(okResponse);
});

describe("обложка в Telegram", () => {
  it("уходит байтами, а ссылка на нашу ноду Telegram не передаётся", async () => {
    mockMediaFetch({ ok: true });

    const result = await publishToTelegram({ body: "текст поста", mediaUrl: MEDIA_URL });

    expect(callTelegramApiWithPhoto).toHaveBeenCalledTimes(1);
    const [method, fields] = callTelegramApiWithPhoto.mock.calls[0];
    expect(method).toBe("sendPhoto");
    expect(fields.caption).toBe("текст поста");
    // Ссылка не должна попасть в вызов ни под каким полем: именно она и была
    // единственной причиной отказа.
    expect(JSON.stringify(fields)).not.toContain(MEDIA_URL);
    expect(result.externalPostId).toBe("77");
  });

  it("недоступная собственная картинка не убивает публикацию — пост уходит текстом", async () => {
    mockMediaFetch({ ok: false });

    const result = await publishToTelegram({ body: "текст поста", mediaUrl: MEDIA_URL });

    // Тот же размен, что в B642 у VK: материал важнее обложки.
    expect(callTelegramApiWithPhoto).not.toHaveBeenCalled();
    expect(callTelegramApi).toHaveBeenCalledWith("sendMessage", expect.objectContaining({
      text: "текст поста",
    }));
    expect(result.note).toContain("обложка не приложена");
    expect(result.externalPostId).toBe("77");
  });

  it("материал без обложки идёт обычным сообщением и картинку не запрашивает", async () => {
    mockMediaFetch({ ok: true });

    await publishToTelegram({ body: "текст поста", mediaUrl: null });

    expect(callTelegramApiWithPhoto).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
    expect(callTelegramApi).toHaveBeenCalledWith("sendMessage", expect.objectContaining({
      text: "текст поста",
    }));
  });

  it("подпись длиннее предела площадки по-прежнему отвергается до отправки", async () => {
    mockMediaFetch({ ok: true });

    await expect(publishToTelegram({ body: "x".repeat(1025), mediaUrl: MEDIA_URL }))
      .rejects.toThrow(/1024/);
  });
});
