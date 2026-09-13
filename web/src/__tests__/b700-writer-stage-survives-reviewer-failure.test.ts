/**
 * B700 — автор и редактор это ДВЕ операции конвейера, а не одна.
 *
 * Что было. `processMarketingDraft` вызывал автора и редактора внутри одного
 * прохода и держал результат автора только в памяти (`lastWriter`,
 * `previousDraft`). Когда редактор падал на 429, исключение уносило с собой
 * готовый, уже оплаченный текст: в базу писался только `lastError`, `body`
 * оставался прежним. Через час ту же строку писали заново.
 *
 * Замер прода 2026-08-09 за сутки: 88 успешных генераций автора (557 058
 * токенов), 139 отказов редактора, НОЛЬ публикаций. Квоты не восстанавливались,
 * потому что их доедала попытка обойти их же нехватку.
 *
 * Требование владельца дословно: «Как только контент будет написан (даже если
 * 1 статья уже готова), к работе может приступать агент-ревьюер». Приступать
 * было не к чему — написанного в базе не было.
 *
 * Граница, которую держит этот тест: успешная работа автора переживает отказ
 * редактора и НЕ оплачивается второй раз.
 */

import { AIGatewayRoutingError } from "@/lib/ai-gateway/routing";
import { carriedWriterStage, processMarketingDraft } from "@/lib/marketing/agent";

const aiComplete = jest.fn();
const findUnique = jest.fn();
const update = jest.fn();

jest.mock("@/lib/marketing/pool-capacity", () => ({
  __esModule: true,
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

const WRITER_TEXT = "Расставание редко заканчивается в тот день, когда закончились отношения. "
  + "Проверьте одно: о ком вы скучаете — о человеке или о том, каким были рядом с ним. "
  + "Ответ на этот вопрос обычно и есть следующий шаг.";

const WRITER_ANSWER = JSON.stringify({
  title: "Почему расставание длится дольше отношений",
  text: WRITER_TEXT,
  audienceNeed: "понять своё состояние",
  goal: "дать один наблюдаемый шаг",
  disclosure: "",
  cta: "Разобрать спокойно: https://eterapy.com/library/kak-perezhit-rasstavanie-s-lyubimym",
  mediaBrief: "спокойная абстрактная обложка в тёплых тонах",
  researchUsed: [],
  safetyFlags: [],
});

const REVIEWER_ANSWER = JSON.stringify({
  decision: "APPROVE",
  scores: {
    relevance: 5, value: 5, authenticity: 5, safety: 5, platformFit: 5,
    completeness: 5, language: 5, cta: 5, visual: 5, antiSlop: 5,
  },
  issues: [],
  revisionBrief: [],
  revisedText: "",
  summary: "Готово",
});

/** Ровно то, чем отвечал Groq 09.08: суточный лимит токенов исчерпан. */
function quotaExhausted() {
  return new AIGatewayRoutingError(
    "All AI providers failed for marketing-agent-reviewer",
    "ALL_PROVIDERS_FAILED",
    [{
      provider: "GROQ" as never,
      status: "failed" as const,
      code: "RATE_LIMITED",
      retryable: true,
    }],
  );
}

const PLANNED_ROW = {
  id: "pub-1",
  key: "b610-2w-telegram-20260810-01",
  planSlot: "b610-2w-telegram-20260810-01",
  status: "DRAFT",
  platform: "telegram",
  title: "Почему расставание длится дольше отношений",
  contentType: "POST",
  cluster: "расставание и возврат",
  targetQuery: "как пережить расставание",
  notes: JSON.stringify({ format: "утренняя символическая карточка" }),
  destinationUrl: "https://eterapy.com/library/kak-perezhit-rasstavanie-s-lyubimym",
  engagementExcerpt: null,
  engagementTargetLabel: null,
  engagementTargetUrl: null,
  engagementTargetId: null,
  engagementTone: null,
  scheduledFor: new Date("2026-08-10T05:30:00.000Z"),
  attemptCount: 0,
  agentWriterDraft: null,
  agentWrittenAt: null,
  agentReviewedAt: null,
};

type AiCall = { feature: string; providerOrder: string[] };

const callsFor = (feature: string) => aiComplete.mock.calls
  .map((call) => call[0] as AiCall)
  .filter((call) => call.feature.includes(feature));

/** Все данные, записанные в строку за проход. */
const writes = () => update.mock.calls.map((call) => (call[0] as {
  data: Record<string, unknown>;
}).data);

beforeEach(() => {
  aiComplete.mockReset();
  findUnique.mockReset().mockResolvedValue(PLANNED_ROW);
  update.mockReset().mockImplementation((args: { data: unknown }) =>
    Promise.resolve({ id: "pub-1", ...(args.data as object) }));
});

describe("B700 · труд автора переживает отказ редактора", () => {
  it("редактор упал на 429 — текст автора уже в базе", async () => {
    aiComplete.mockImplementation((input: AiCall) => {
      if (input.feature.includes("writer")) {
        return Promise.resolve({
          text: WRITER_ANSWER,
          provider: "GROQ",
          model: "qwen/qwen3.6-27b",
          finishReason: "STOP",
        });
      }
      return Promise.reject(quotaExhausted());
    });

    const result = await processMarketingDraft("pub-1");

    // Строка осталась исполняемой: ёмкость вернётся сама.
    expect(result.status).toBe("failed");
    expect(writes().some((data) => data.status === "FAILED")).toBe(false);

    // Главное: написанное сохранено ДО вызова редактора.
    const carried = writes().find((data) => data.agentWriterDraft);
    expect(carried).toBeDefined();
    expect(JSON.stringify(carried!.agentWriterDraft)).toContain("о ком вы скучаете");
    expect(carried!.agentWrittenAt).toBeInstanceOf(Date);
  });

  it("следующий проход зовёт ТОЛЬКО редактора — автора второй раз не оплачиваем", async () => {
    // Первый проход: автор отработал, редактор упал.
    aiComplete.mockImplementation((input: AiCall) =>
      input.feature.includes("writer")
        ? Promise.resolve({
          text: WRITER_ANSWER,
          provider: "GROQ",
          model: "qwen/qwen3.6-27b",
          finishReason: "STOP",
        })
        : Promise.reject(quotaExhausted()));
    await processMarketingDraft("pub-1");

    const carried = writes().find((data) => data.agentWriterDraft)!;

    // Второй проход видит строку такой, какой её оставил первый.
    aiComplete.mockReset();
    update.mockReset().mockImplementation((args: { data: unknown }) =>
      Promise.resolve({ id: "pub-1", ...(args.data as object) }));
    findUnique.mockResolvedValue({
      ...PLANNED_ROW,
      agentWriterDraft: JSON.parse(JSON.stringify(carried.agentWriterDraft)),
      agentWrittenAt: new Date("2026-08-09T12:00:00.000Z"),
    });
    aiComplete.mockImplementation((input: AiCall) =>
      input.feature.includes("writer")
        ? Promise.reject(new Error("автора звать не должны — материал уже написан"))
        : Promise.resolve({
          text: REVIEWER_ANSWER,
          provider: "GEMINI",
          model: "gemini-3.6-flash",
          finishReason: "STOP",
        }));

    const result = await processMarketingDraft("pub-1");

    expect(callsFor("writer")).toHaveLength(0);
    expect(callsFor("reviewer")).toHaveLength(1);
    expect(result.status).toBe("scheduled");

    const approved = writes().find((data) => data.status === "SCHEDULED")!;
    expect(approved.body).toContain("о ком вы скучаете");
    // Стадия закрыта: незавершённого производства на строке не остаётся.
    expect(carriedWriterStage(approved.agentWriterDraft)).toBeNull();
  });

  it("утверждённый с первого раза материал не оставляет незавершённой стадии", async () => {
    aiComplete.mockImplementation((input: AiCall) =>
      Promise.resolve(input.feature.includes("writer")
        ? { text: WRITER_ANSWER, provider: "GROQ", model: "qwen/qwen3.6-27b", finishReason: "STOP" }
        : { text: REVIEWER_ANSWER, provider: "GEMINI", model: "gemini-3.6-flash", finishReason: "STOP" }));

    const result = await processMarketingDraft("pub-1");

    expect(result.status).toBe("scheduled");
    const approved = writes().find((data) => data.status === "SCHEDULED")!;
    expect(carriedWriterStage(approved.agentWriterDraft)).toBeNull();
  });
});

/**
 * Правило конвейера: незавершённое производство доделывается первым.
 *
 * Написанный материал стоит один вызов редактора и сразу превращается в
 * готовое; свежий черновик стоит два и увеличивает склад. Пока очередь
 * сортировалась плановой датой, дешёвая операция стояла за дорогой — и в
 * дефиците ёмкости очередь редактора не разбиралась никогда.
 */
describe("B700 · написанное разбирается раньше ненаписанного", () => {
  /**
   * Фаза 2 усилила это правило: вместо одной очереди с сортировкой
   * «написанное вперёд» линия разбирает ДВЕ разные очереди с разными бюджетами.
   *
   * Сортировка внутри общего бюджета помогала только при бюджете больше нуля.
   * А такт даёт ноль ровно тогда, когда буфер полон, квоты выжжены или склад
   * переполнен, — и в этот момент обнулялась и очередь редактора, то есть линия
   * переставала ДОДЕЛЫВАТЬ уже оплаченное. Разделение делает границу
   * структурной: барабан ограничен только паузой линии, автор — тактом.
   */
  it("очередь редактора и очередь автора — две разные выборки", async () => {
    const db = (await import("@/lib/db")).default as unknown as {
      externalPublication: { findMany: jest.Mock; count: jest.Mock };
      platformSetting: { findUnique: jest.Mock };
    };
    db.platformSetting.findUnique.mockResolvedValue({ value: "true" });
    db.externalPublication.findMany.mockResolvedValue([]);
    // Порядок счётчиков прохода: написано-за-час, отложено, ждёт-редактора,
    // СПРОС, готово-впереди. Без спроса автору нечего писать, и второй выборки
    // не было бы вовсе.
    db.externalPublication.count
      .mockResolvedValueOnce(0).mockResolvedValueOnce(0).mockResolvedValueOnce(0)
      .mockResolvedValueOnce(4).mockResolvedValue(0);

    const { runMarketingAgentCycle } = await import("@/lib/marketing/agent");
    await runMarketingAgentCycle({ now: new Date("2026-08-09T12:00:00.000Z") });

    const wheres = db.externalPublication.findMany.mock.calls
      .map((call) => JSON.stringify((call[0] as { where?: unknown }).where ?? {}));

    // Барабан: склад ОТКРЫТ, редактор ещё не отработал.
    expect(wheres.some((where) =>
      where.includes("\"agentWriterDraft\":{\"not\"")
      && where.includes("\"agentReviewedAt\":null"))).toBe(true);

    // Автор: склад ПУСТ — переписывать написанное он не должен.
    expect(wheres.some((where) =>
      where.includes("\"agentWriterDraft\":{\"equals\""))).toBe(true);
  });

  it("барабан разбирается, даже когда автору такт не дал ничего", async () => {
    const db = (await import("@/lib/db")).default as unknown as {
      externalPublication: { findMany: jest.Mock; count: jest.Mock };
      platformSetting: { findUnique: jest.Mock };
    };
    db.platformSetting.findUnique.mockResolvedValue({ value: "true" });
    db.externalPublication.count.mockResolvedValue(0);
    // Склад полон: очередь редактора отдаёт материал, автору места нет.
    db.externalPublication.findMany.mockImplementation(async (args: {
      where?: unknown;
    }) => (JSON.stringify(args.where ?? {}).includes("\"agentWriterDraft\":{\"not\"")
      ? [{ id: "carried" }]
      : []));

    const { runMarketingAgentCycle } = await import("@/lib/marketing/agent");
    const result = await runMarketingAgentCycle({ now: new Date("2026-08-09T12:00:00.000Z") });

    expect(result.reviewQueue).toBe(1);
    expect(result.processed).toBe(1);
  });
});
