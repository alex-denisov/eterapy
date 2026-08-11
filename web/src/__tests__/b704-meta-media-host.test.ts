/**
 * B704 — Meta приходит за обложкой сама, и до российского имени не доходит.
 *
 * Прогон закрывает не «функция переписывает строку», а два решения, которые
 * легко потерять при следующей правке: переписывается ТОЛЬКО наш маршрут
 * обложек, и в запрос к площадке уходит именно переписанный адрес.
 */
import { metaFetchableMediaUrl } from "@/lib/marketing/meta-endpoints";

describe("B704 · адрес обложки для скачивателя Meta", () => {
  const OLD_ENV = process.env.META_WEBHOOK_HOST;

  afterEach(() => {
    if (OLD_ENV === undefined) delete process.env.META_WEBHOOK_HOST;
    else process.env.META_WEBHOOK_HOST = OLD_ENV;
  });

  it("переносит нашу обложку на имя за Cloudflare", () => {
    expect(metaFetchableMediaUrl("https://eterapy.com/api/marketing/media/b610-01"))
      .toBe("https://hooks.eterapy.com/api/marketing/media/b610-01");
  });

  it("сохраняет путь целиком и строку запроса", () => {
    expect(metaFetchableMediaUrl("https://eterapy.com/api/marketing/media/b610-01--r2?v=3"))
      .toBe("https://hooks.eterapy.com/api/marketing/media/b610-01--r2?v=3");
  });

  it("подчиняется переопределению имени входа", () => {
    process.env.META_WEBHOOK_HOST = "https://hooks.example.test/";
    expect(metaFetchableMediaUrl("https://eterapy.com/api/marketing/media/b610-01"))
      .toBe("https://hooks.example.test/api/marketing/media/b610-01");
  });

  it("НЕ трогает чужой адрес, даже если он картинка", () => {
    const foreign = "https://images.unsplash.com/photo-1506744038136?fm=jpg";
    expect(metaFetchableMediaUrl(foreign)).toBe(foreign);
  });

  it("НЕ трогает наш же адрес вне маршрута обложек", () => {
    const other = "https://eterapy.com/api/og/library/karta-dnya";
    expect(metaFetchableMediaUrl(other)).toBe(other);
  });

  it("возвращает нечитаемую строку как есть, а не бросает", () => {
    expect(metaFetchableMediaUrl("не адрес вовсе")).toBe("не адрес вовсе");
  });
});

describe("B704 · переписанный адрес доходит до площадки", () => {
  const media = "https://eterapy.com/api/marketing/media/b704-probe";
  const expected = "https://hooks.eterapy.com/api/marketing/media/b704-probe";

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  async function loadPublishWithStubs() {
    jest.doMock("@/lib/marketing/platform-settings", () => ({
      marketingPlatformEnabled: jest.fn().mockResolvedValue(true),
      marketingPlatformValue: jest.fn().mockResolvedValue(null),
      requiredMarketingPlatformValue: jest.fn().mockResolvedValue("stub-value"),
    }));
    jest.doMock("@/lib/marketing/meta-brand-account", () => ({
      assertMetaBrandAccount: jest.fn().mockResolvedValue(undefined),
    }));
    return import("@/lib/marketing/publish");
  }

  function bodyOf(call: [string, RequestInit]): URLSearchParams {
    return new URLSearchParams(String(call[1].body));
  }

  it("Instagram: image_url указывает на имя за Cloudflare", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "container" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "post" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ permalink: "https://instagr.am/p/1" }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { publishToInstagram } = await loadPublishWithStubs();
    await publishToInstagram({ body: "текст", mediaUrl: media });

    const create = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(bodyOf(create).get("image_url")).toBe(expected);
  });

  it("Threads: image_url указывает на имя за Cloudflare", async () => {
    const fetchMock = jest.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "container" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: "post" }) });
    global.fetch = fetchMock as unknown as typeof fetch;

    const { publishToThreads } = await loadPublishWithStubs();
    await publishToThreads({ body: "текст", mediaUrl: media });

    const create = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(bodyOf(create).get("media_type")).toBe("IMAGE");
    expect(bodyOf(create).get("image_url")).toBe(expected);
  });
});
