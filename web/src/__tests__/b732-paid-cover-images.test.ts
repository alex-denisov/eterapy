/**
 * B732 — ПЛАТНАЯ ОБЛОЖКА ДЗЕНА И INSTAGRAM.
 *
 * Прогон меряет ровно то, из-за чего прошлый механизм был выкачен мёртвым
 * (B727, дефект 3): ключ брался из окружения, которого в контейнере нет, и
 * функция возвращала `null` на первой строке — при зелёном тесте на моках.
 * Поэтому здесь проверяется, что учётка приходит из ХРАНИЛИЩА ШЛЮЗА, что
 * потолок останавливает расход, и что любой отказ отдаёт откат на шаблон, а не
 * исключение в путь публикации.
 */

import {
  PAID_COVER_COST_MICROS,
  PAID_COVER_DAILY_LIMIT,
  PAID_COVER_MODEL,
  generatePaidCover,
  isPaidCoverPlatform,
  paidCoverPrompt,
} from "@/lib/marketing/cover-image";
import { hasAiImageMetadata } from "@/lib/marketing/image-hygiene";

const SAMPLE_PNG =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

const CREDENTIAL = {
  id: "cred-openrouter",
  provider: "OPENROUTER",
  label: "OpenRouter",
  apiKey: "key-from-gateway-store",
  baseUrlOverride: null,
  modelOverride: null,
  enabled: true,
  priority: 1,
  consecutiveFailures: 0,
  cooldownUntil: null,
  regionBlocked: false,
} as never;

function imageResponse(data = SAMPLE_PNG) {
  // Ответ `/images`: голый base64 в `data[0].b64_json` и тип файла отдельным
  // полем `media_type`. Data-URI, как у `chat/completions`, здесь НЕ приходит,
  // и искать его — верный способ решить, что модель не ответила.
  return {
    ok: true,
    status: 200,
    json: async () => ({
      data: [{ b64_json: data, media_type: "image/png" }],
      usage: { cost: 0.01 },
    }),
  } as unknown as Response;
}

function fakeClient(options: { drawnToday?: number } = {}) {
  const upserts: Array<Record<string, unknown>> = [];
  const spends: string[] = [];
  return {
    upserts,
    spends,
    client: {
      $queryRaw: async () => [{ request_count: options.drawnToday ?? 0 }],
      $executeRaw: async () => { spends.push("recorded"); return 1; },
      marketingCoverImage: {
        upsert: async (args: Record<string, unknown>) => { upserts.push(args); return args; },
      },
    } as never,
  };
}

describe("B732 — платная обложка для Дзена и Instagram", () => {
  it("модель — та, что выиграла живой замер: лучше и дешевле прежней", () => {
    // Живой замер 2026-09-09, после подтверждения 18+ в аккаунте OpenRouter:
    // Elo 1116 против 1089 у `gemini-3.1-flash-lite-image` при $0,01 против
    // $0,0336 — выше и втрое дешевле, кадр в запрошенной пропорции.
    expect(PAID_COVER_MODEL).toBe("meta/muse-image");
    expect(PAID_COVER_COST_MICROS).toBe(10);
  });

  it("рисуется только там, где её одобрил владелец", () => {
    expect(isPaidCoverPlatform("dzen")).toBe(true);
    expect(isPaidCoverPlatform("Instagram")).toBe(true);
    // Остальные площадки остаются на 0-токенных шаблонах Satori (B718, B731).
    for (const platform of ["telegram", "vk", "threads"]) {
      expect(isPaidCoverPlatform(platform)).toBe(false);
    }
  });

  it("ключ берётся из хранилища шлюза, а не из окружения", async () => {
    // Ровно этим прошлый модуль и был мёртв: `process.env.GEMINI_API_KEY` в
    // контейнере нет и не было ([[reference_llm_host_differs_from_key_name]]).
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const { client, upserts, spends } = fakeClient();

    const result = await generatePaidCover({
      key: "b610-2w-dzen-20260910-01",
      platform: "dzen",
      title: "Почему он замолчал",
      cluster: "отношения",
      mediaBrief: "утренняя кухня, свет из окна",
      client,
      pickCredentialImpl: async () => CREDENTIAL,
      fetchImpl: (async (url: string, init: RequestInit) => {
        seen.push({ url, init });
        return imageResponse();
      }) as unknown as typeof fetch,
    });

    expect(result).not.toBeNull();
    expect(result?.model).toBe(PAID_COVER_MODEL);
    // ⚠ Конечная точка — `/images`: на `chat/completions` выбранная модель
    // отвечает 404 «is an image generation model and cannot be used with the
    // chat/completions endpoint», а это читается как «модель недоступна».
    expect(seen[0].url).toMatch(/\/images$/);
    const body = JSON.parse(String(seen[0].init.body));
    expect(body.model).toBe(PAID_COVER_MODEL);
    // Пропорция уходит числами, а не только словами промта.
    expect(body.size).toBe("1200x675");
    // JPEG, а не WebP по умолчанию: Instagram принимает от Meta только JPEG.
    expect(body.output_format).toBe("jpeg");
    // Ключ уходит заголовком: строка запроса попадает в журналы прокси целиком.
    expect((seen[0].init.headers as Record<string, string>).Authorization)
      .toBe("Bearer key-from-gateway-store");
    expect(seen[0].url).not.toContain("key-from-gateway-store");
    // ⚠ Адрес — НЕ `openrouter.ai` напрямую и не шлюз Cloudflare: с боевой
    // ноды оба отвечают 403 «Access denied by security policy». Путь только
    // через контролируемый шлюз, если он настроен.
    expect(seen[0].url).not.toContain("gateway.ai.cloudflare.com");
    // Картинка сохранена под ключом материала и расход записан.
    expect(upserts).toHaveLength(1);
    expect(spends).toHaveLength(1);
    // C2PA и EXIF сняты до записи в базу.
    expect(await hasAiImageMetadata(result!.bytes)).toBe(false);
  });

  it("суточный потолок останавливает расход и не молчит об этом", async () => {
    const { client, upserts, spends } = fakeClient({ drawnToday: PAID_COVER_DAILY_LIMIT });
    const fetchImpl = jest.fn();

    const result = await generatePaidCover({
      key: "b610-2w-instagram-20260910-01",
      platform: "instagram",
      title: "Он написал спустя полгода",
      client,
      pickCredentialImpl: async () => CREDENTIAL,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    expect(result).toBeNull();
    // До модели дело не дошло вовсе: потолок спрашивается ДО обращения.
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(upserts).toHaveLength(0);
    expect(spends).toHaveLength(0);
  });

  it("любой отказ отдаёт откат на шаблон, а не исключение", async () => {
    const cases: Array<[string, () => Promise<Response>]> = [
      ["отказ модели", async () => ({ ok: false, status: 429, text: async () => "quota" } as unknown as Response)],
      ["ответ без картинки", async () => ({
        ok: true,
        status: 200,
        json: async () => ({ data: [], error: { message: "не могу" } }),
      } as unknown as Response)],
      ["сеть молчит", async () => { throw new Error("ETIMEDOUT"); }],
    ];

    for (const [, respond] of cases) {
      const { client, spends } = fakeClient();
      const result = await generatePaidCover({
        key: "b610-2w-dzen-20260911-01",
        platform: "dzen",
        title: "Почему он замолчал",
        client,
        pickCredentialImpl: async () => CREDENTIAL,
        fetchImpl: respond as unknown as typeof fetch,
      });
      expect(result).toBeNull();
      // Неудачная попытка ничего не стоит: деньги берут за отданный файл.
      expect(spends).toHaveLength(0);
    }

    // Нет учётки — тоже откат, а не падение пути публикации.
    const { client } = fakeClient();
    await expect(generatePaidCover({
      key: "b610-2w-dzen-20260912-01",
      platform: "dzen",
      title: "Почему он замолчал",
      client,
      pickCredentialImpl: async () => null,
      fetchImpl: (async () => imageResponse()) as unknown as typeof fetch,
    })).resolves.toBeNull();
  });

  it("промт запрещает лица и текст на картинке", () => {
    const prompt = paidCoverPrompt({
      platform: "dzen",
      title: "Почему он замолчал",
      cluster: "отношения",
      mediaBrief: "утренняя кухня",
    });
    // Лица и пальцы модель рисует узнаваемо-неправильно, а надпись на чужом
    // языке выдаёт генерацию мгновенно — приёмка глазами, как в B731.
    expect(prompt).toMatch(/БЕЗ людей и лиц/);
    expect(prompt).toMatch(/БЕЗ любого текста/);
    expect(prompt).toContain("Почему он замолчал");
    expect(prompt).toContain("утренняя кухня");
  });
});
