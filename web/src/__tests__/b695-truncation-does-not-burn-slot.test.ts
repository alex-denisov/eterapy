/**
 * B695 — обрыв по НАШЕМУ потолку и отказ дороги жгли слоты контент-плана.
 *
 * Замер прода 2026-08-06 после выкатки B694: `MISSING_ADAPTER` исчез (правка
 * подтвердилась), но публикаций всё равно нет. В реестре видно почему:
 *
 *   telegram ARCHIVED recovery_count=2
 *     «Ответ модели nvidia/nemotron-3-super-120b-a12b:free (OPENROUTER) обрезан
 *      по лимиту вывода 16000 токенов (finishReason=length)»
 *
 * Всего по реестру 36 строк архивированы с освобождением слота, из них 9 — по
 * обрыву вывода; пять слотов сгорело за один день.
 *
 * Две границы, которые здесь держатся.
 *
 * 1. Обрыв по потолку выводит из перебора ЭТУ модель, а не весь проход.
 *    Довод B644 «остальные маршруты вернут тот же обрыв» замер опроверг:
 *    обрывается ДУМАЮЩАЯ модель (размышление тратится из того же бюджета и в
 *    `completion_tokens` не видно), а `mistral-small` в той же очереди отвечает
 *    в свои 4000 без обрыва. Модели разные — и исход разный.
 *
 * 2. Отказ ДОРОГИ (`TIMEOUT`, `HTTP_5xx`, `EMPTY_RESPONSE`, `PROVIDER_ERROR`)
 *    ничего не говорит о материале. Правило B692 «откладываем, только если ВСЕ
 *    коды ёмкостные» отправляло такой материал в `FAILED`, а оттуда за две
 *    попытки восстановления — в `ARCHIVED` с освобождением слота (B643).
 *    Настоящий брак материала приходит не кодом маршрута: он приходит ошибкой
 *    разбора ПОЛНОГО ответа, safety-флагом или решением редактора.
 */

import { AIGatewayRoutingError } from "@/lib/ai-gateway/routing";
import { INBOUND_REPLY_CONTENT_TYPE } from "@/lib/marketing/perimeter";
import {
  MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS,
  MARKETING_REVIEWER_MAX_TOKENS,
  MARKETING_WRITER_MAX_TOKENS,
  MarketingInfrastructureError,
  MarketingTruncatedOutputError,
  isCapacityError,
  isDeferrableError,
  processMarketingDraft,
} from "@/lib/marketing/agent";

const aiComplete = jest.fn();
const findUnique = jest.fn();
const update = jest.fn();

jest.mock("@/lib/marketing/pool-capacity", () => ({
  __esModule: true,
  // B699: пул с двумя независимыми моделями — предусловие этих тестов, а не их
  // предмет. Проверка «есть ли вторая модель» разбирается в
  // b699-last-surviving-provider-must-be-usable.
  marketingPoolAvailability: async () => ({
    providers: ["GROQ", "GEMINI"],
    canSeparateRoles: true,
  }),
  marketingHourlyCapacity: async () => ({
    perHour: 2,
    materialsLeftToday: 2,
    providers: ["GROQ", "GEMINI"],
    canSeparateRoles: true,
  }),
  marketingPoolResumeAt: async () => null,
}));

jest.mock("@/lib/ai", () => ({
  __esModule: true,
  aiComplete: (...args: unknown[]) => aiComplete(...args),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    // B741: счётчик расхода платных маршрутов читается на каждом материале —
    // у Gemini появился потолок, а он голова обеих ролей. Отказ чтения
    // намеренно трактуется как «потолок выбран» (деньги дороже вызова),
    // поэтому мок обязан отдавать пустой счётчик: иначе прогон проверял бы не
    // обход очереди, а поведение при недоступной базе.
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    externalPublication: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0),
    },
    platformSetting: { findUnique: jest.fn().mockResolvedValue({ value: "true" }) },
    marketingAutomationSignal: { upsert: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock("@/lib/marketing/research", () => ({
  __esModule: true,
  buildMarketingResearchBrief: jest.fn().mockResolvedValue({ facts: [] }),
  // B743: мера однотипности читает недавние материалы площадки тем же
  // запросом, что и сводка автору. Здесь сравнивать не с чем — пусто.
  recentOwnMaterials: jest.fn().mockResolvedValue([]),
}));

jest.mock("@/lib/marketing/moderation", () => ({
  __esModule: true,
  requestMarketingModeration: jest.fn().mockResolvedValue(undefined),
}));

function routingError(codes: string[]) {
  return new AIGatewayRoutingError(
    "All AI providers failed for marketing-agent-writer",
    "ALL_PROVIDERS_FAILED",
    codes.map((code) => ({
      provider: "GROQ" as never,
      status: "failed" as const,
      code,
      retryable: true,
    })),
  );
}

const WRITER_ANSWER = JSON.stringify({
  title: "Ответ",
  text: "Спасибо, что написали. Коротко по сути: разбор помогает отделить факты от догадок — "
    + "и вы сами увидите следующий шаг.",
  audienceNeed: "поддержка",
  goal: "ответить человеку",
  disclosure: "",
  cta: "",
  mediaBrief: "",
  researchUsed: [],
  safetyFlags: [],
});

const REVIEWER_ANSWER = JSON.stringify({
  decision: "APPROVE",
  scores: {
    relevance: 5,
    value: 5,
    authenticity: 5,
    safety: 5,
    platformFit: 5,
    completeness: 5,
    language: 5,
    cta: 5,
    visual: 5,
    antiSlop: 5,
    toneFit: 5,
  },
  issues: [],
  revisionBrief: [],
  revisedText: "",
  summary: "Готово",
});

/** Ровно то, что приходит с прода: начало JSON и обрыв на полуслове. */
const TRUNCATED = '{"title": "Отв';

const DRAFT_ROW = {
  id: "pub-1",
  key: "smm-inbound-1",
  status: "DRAFT",
  platform: "vk",
  title: "Ответ на входящее",
  contentType: INBOUND_REPLY_CONTENT_TYPE,
  cluster: null,
  targetQuery: null,
  notes: null,
  destinationUrl: null,
  engagementExcerpt: "А это точно не гадание?",
  engagementTargetLabel: "VK id7",
  engagementTargetUrl: "https://vk.com/wall-1_2?reply=3",
  engagementTargetId: "-1_2",
  engagementTone: null,
  scheduledFor: null,
  attemptCount: 0,
};

type AiCall = { feature: string; maxTokens: number; providerOrder: string[] };

const callsFor = (feature: string): AiCall[] => aiComplete.mock.calls
  .map((call) => call[0] as AiCall)
  .filter((call) => call.feature.includes(feature));

const statusUpdates = () => update.mock.calls
  .map((call) => (call[0] as { data: { status?: string } }).data.status)
  .filter((status): status is string => Boolean(status));

beforeEach(() => {
  aiComplete.mockReset();
  findUnique.mockReset().mockResolvedValue(DRAFT_ROW);
  update.mockReset().mockImplementation((args: { data: unknown }) =>
    Promise.resolve({ id: "pub-1", ...(args.data as object) }));
});

describe("обрыв по потолку не выключает остаток пула", () => {
  it("думающая модель упёрлась в потолок — материал пишет следующая", async () => {
    // Думающая модель стоит первой в заказанном порядке — ровно как на проде,
    // где `nemotron-3-super` открывал перебор редактора.
    let thinkingProvider: string | null = null;
    aiComplete.mockImplementation((input: AiCall) => {
      const provider = input.providerOrder[0];
      if (input.feature.includes("writer")) {
        thinkingProvider ??= provider;
        if (provider === thinkingProvider) {
          return Promise.resolve({
            text: TRUNCATED,
            provider,
            model: "nvidia/nemotron-3-super-120b-a12b:free",
            finishReason: "length",
          });
        }
        return Promise.resolve({
          text: WRITER_ANSWER,
          provider,
          model: "mistral-small-2603",
          finishReason: "STOP",
        });
      }
      return Promise.resolve({
        text: REVIEWER_ANSWER,
        provider: "GEMINI",
        model: "gemini-3.6-flash",
        finishReason: "STOP",
      });
    });

    const result = await processMarketingDraft("pub-1");

    const writer = callsFor("writer");
    // Перебор дошёл до второго маршрута, а не оборвался на первом.
    expect(new Set(writer.map((call) => call.providerOrder[0])).size).toBeGreaterThan(1);
    // Следующая модель начинает со своей ступени бюджета, а не с чужого потолка.
    const secondProviderFirstCall = writer.find(
      (call) => call.providerOrder[0] !== writer[0].providerOrder[0],
    );
    expect(secondProviderFirstCall?.maxTokens).toBe(MARKETING_WRITER_MAX_TOKENS);
    expect(result.status).not.toBe("failed");
    expect(statusUpdates()).not.toContain("FAILED");
  });

  it("обрыв на всех маршрутах оставляет материал черновиком", async () => {
    aiComplete.mockImplementation((input: AiCall) => Promise.resolve({
      text: TRUNCATED,
      provider: input.providerOrder[0],
      model: "nvidia/nemotron-3-super-120b-a12b:free",
      finishReason: "length",
    }));

    const result = await processMarketingDraft("pub-1");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("обрезан по лимиту вывода");
    // Ключевое: это НАШ потолок, а не брак текста. Строка ждёт следующего
    // прохода — `FAILED` увёл бы её в восстановление и сжёг слот (B643).
    expect(statusUpdates()).not.toContain("FAILED");
  });
});

describe("граница откладывания: вина материала, а не дороги", () => {
  it("обрыв по потолку откладывается", () => {
    const error = new MarketingTruncatedOutputError("обрезан по лимиту вывода 16000 токенов");
    expect(isDeferrableError(error)).toBe(true);
    // Но ёмкостью он не считается: ждать возврата квоты тут нечего.
    expect(isCapacityError(error)).toBe(false);
  });

  it("отказ дороги откладывается по каждому коду", () => {
    for (const code of ["TIMEOUT", "HTTP_503", "HTTP_502", "EMPTY_RESPONSE", "PROVIDER_ERROR"]) {
      expect(isDeferrableError(routingError([code]))).toBe(true);
    }
  });

  it("смесь ёмкости и дороги — тоже откладывается", () => {
    expect(isDeferrableError(routingError(["HTTP_429", "TIMEOUT", "PROVIDER_COOLDOWN"]))).toBe(true);
    // Ёмкостью такая смесь НЕ становится: цикл не должен вставать на паузу
    // по ёмкости там, где дело в одном отвалившемся маршруте.
    expect(isCapacityError(routingError(["HTTP_429", "TIMEOUT"]))).toBe(false);
  });

  it("конфигурация и ключ откладыванию не подлежат — это жалоба", () => {
    for (const code of ["MISSING_ADAPTER", "MISSING_CONFIG", "HTTP_400", "HTTP_401", "HTTP_403"]) {
      expect(isDeferrableError(routingError([code]))).toBe(false);
    }
    // Один код конфигурации портит всю смесь: ждать бесполезно, нужен человек.
    expect(isDeferrableError(routingError(["TIMEOUT", "HTTP_401"]))).toBe(false);
  });

  it("отказ дороги откладывает материал, но не останавливает проход", () => {
    const error = new MarketingInfrastructureError("маршруты отвечали отказом дороги");
    expect(isDeferrableError(error)).toBe(true);
    // Ёмкостью он не считается намеренно: на ёмкости цикл встаёт на паузу
    // целиком (`capacityStop`), а отвалившийся маршрут этого не заслуживает —
    // следующий материал может уйти другой дорогой.
    expect(isCapacityError(error)).toBe(false);
  });

  /**
   * B718 — СТУПЕНЕЙ БОЛЬШЕ НЕТ, ПОЭТОМУ НЕТ И «ВЫШЕ АВТОРСКОЙ».
   *
   * Наблюдение B695 верное и никуда не делось: обрывается роль РЕДАКТОРА, у
   * автора обрывов почти нет. Но вывод из него был половинчатым — редактору
   * подняли старт до 8000 и оставили лестницу до 16000. Замер 2026-08-23 за 48
   * часов: ~135 обрывов редактора на ступенях 8000 → 14000 → 16000, то есть
   * лестницу проходили НАСКВОЗЬ и платили за неё полным промтом дважды.
   *
   * Обе роли стартуют с потолка. Утверждение «редактору нужно больше» теперь
   * выражено иначе: больше уже некуда, и обрыв на потолке означает не нехватку
   * бюджета, а зациклившееся размышление — лечится другой моделью.
   */
  it("обе роли стартуют с потолка: ступеней между стартом и потолком нет", () => {
    expect(MARKETING_REVIEWER_MAX_TOKENS).toBe(MARKETING_WRITER_MAX_TOKENS);
    expect(MARKETING_REVIEWER_MAX_TOKENS).toBe(MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS);
  });

  it("брак материала остаётся браком", () => {
    expect(isDeferrableError(new Error("writer returned invalid structured output"))).toBe(false);
    expect(isDeferrableError(new Error("writer safety block: self-harm"))).toBe(false);
    expect(isDeferrableError(new Error("Independent reviewer did not approve"))).toBe(false);
  });
});
