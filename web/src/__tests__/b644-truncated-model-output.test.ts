/**
 * B644 — обрезанный по лимиту вывода ответ это не брак провайдера.
 *
 * Реестр прода 2026-08-03 объявлял «ни один провайдер не вернул валидную
 * структуру» и перечислял шесть маршрутов, а лог того же прохода в каждой
 * попытке показывал `finishReason: MAX_TOKENS`. Ответ был оборван нашим же
 * бюджетом вывода: JSON физически не дописан, и разбор падал всегда.
 *
 * Границы, которые держат эти проверки:
 * — обрыв лечится большим бюджетом ТЕМ ЖЕ маршрутом, а не перебором чужих;
 * — исчерпав потолок, ошибка называет обрезку обрезкой, а не поломку провайдера.
 */

import { INBOUND_REPLY_CONTENT_TYPE } from "@/lib/marketing/perimeter";
import {
  MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS,
  MARKETING_REVIEWER_MAX_TOKENS,
  MARKETING_WRITER_MAX_TOKENS,
  isTruncatedCompletion,
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
}));

jest.mock("@/lib/marketing/moderation", () => ({
  __esModule: true,
  requestMarketingModeration: jest.fn().mockResolvedValue(undefined),
}));

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

beforeEach(() => {
  aiComplete.mockReset();
  findUnique.mockReset().mockResolvedValue(DRAFT_ROW);
  update.mockReset().mockImplementation((args: { data: unknown }) =>
    Promise.resolve({ id: "pub-1", ...(args.data as object) }));
});

describe("признак обрезки", () => {
  it("узнаётся во всех трёх словарях площадок", () => {
    expect(isTruncatedCompletion("MAX_TOKENS")).toBe(true);
    expect(isTruncatedCompletion("max_tokens")).toBe(true);
    expect(isTruncatedCompletion("length")).toBe(true);
  });

  it("нормальная остановка обрезкой не считается", () => {
    expect(isTruncatedCompletion("stop")).toBe(false);
    expect(isTruncatedCompletion("STOP")).toBe(false);
    expect(isTruncatedCompletion(null)).toBe(false);
    expect(isTruncatedCompletion(undefined)).toBe(false);
  });
});

describe("обрыв лечится бюджетом, а не перебором провайдеров", () => {
  it("повторяем ТОТ ЖЕ маршрут с большим лимитом", async () => {
    let writerCalls = 0;
    aiComplete.mockImplementation((input: AiCall) => {
      if (input.feature.includes("writer")) {
        writerCalls += 1;
        return Promise.resolve(writerCalls === 1
          ? { text: TRUNCATED, provider: "GEMINI", model: "gemini-3.6-flash", finishReason: "MAX_TOKENS" }
          : { text: WRITER_ANSWER, provider: "GEMINI", model: "gemini-3.6-flash", finishReason: "STOP" });
      }
      return Promise.resolve({
        text: REVIEWER_ANSWER,
        provider: "MISTRAL",
        model: "mistral-small-2603",
        finishReason: "STOP",
      });
    });

    await processMarketingDraft("pub-1");

    const writer = callsFor("writer");
    expect(writer).toHaveLength(2);
    // Тот же провайдер: перебор чужих маршрутов вернул бы тот же обрыв.
    expect(writer[1].providerOrder).toEqual(writer[0].providerOrder);
    expect(writer[1].maxTokens).toBeGreaterThan(writer[0].maxTokens);
    // И материал доходит до конца, а не гибнет с ложной причиной.
    const failed = update.mock.calls.find(
      (call) => (call[0] as { data: { status?: string } }).data.status === "FAILED",
    );
    expect(failed).toBeUndefined();
  });

  it("исчерпав потолок, ошибка называет обрезку обрезкой", async () => {
    aiComplete.mockImplementation((input: AiCall) => Promise.resolve({
      text: TRUNCATED,
      provider: input.feature.includes("writer") ? "GEMINI" : "MISTRAL",
      model: input.feature.includes("writer") ? "gemini-3.6-flash" : "mistral-small-2603",
      finishReason: "MAX_TOKENS",
    }));

    const result = await processMarketingDraft("pub-1");

    expect(result.status).toBe("failed");
    expect(result.error).toContain("обрезан по лимиту вывода");
    // Провайдер назван исправным: разбор не должен уходить к ключам и квотам.
    expect(result.error).not.toContain("No free provider returned valid structured output");

    const budgets = callsFor("writer").map((call) => call.maxTokens);
    expect(budgets[0]).toBe(MARKETING_WRITER_MAX_TOKENS);
    expect(budgets.at(-1)).toBe(MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS);
    /**
     * Здесь стояло «один и тот же обрыв не воспроизводится по всем шести
     * маршрутам»: перебор останавливался на первом же обрыве. B695 эту границу
     * подвинул — замер прода 2026-08-06 показал, что обрывается ДУМАЮЩАЯ модель,
     * а соседняя в той же очереди отвечает в свои 4000 без обрыва, и остановка
     * на первой стоила девяти слотов контент-плана.
     *
     * Что осталось от правила B644: лестница бюджета принадлежит МАРШРУТУ, а не
     * материалу. Каждый провайдер поднимается от своей ступени до потолка ровно
     * один раз, чужой потолок на следующего не переносится, а общий расход
     * держит рубеж попыток на материал (B680).
     */
    const ladders = new Map<string, number[]>();
    for (const call of callsFor("writer")) {
      const provider = call.providerOrder[0];
      ladders.set(provider, [...(ladders.get(provider) ?? []), call.maxTokens]);
    }
    for (const ladder of ladders.values()) {
      expect(ladder[0]).toBe(MARKETING_WRITER_MAX_TOKENS);
      expect(ladder).toEqual([...ladder].sort((left, right) => left - right));
      expect(new Set(ladder).size).toBe(ladder.length);
    }
  });
});

describe("бюджет ролей покрывает размышление", () => {
  it("стартовый лимит выше замеренного p90 видимого вывода с запасом", () => {
    // Замер прода 2026-08-03: p90 видимого вывода 1080 у автора и 1151 у
    // редактора при лимитах 2200 и 1600 — и `MAX_TOKENS` в каждой попытке.
    expect(MARKETING_WRITER_MAX_TOKENS).toBeGreaterThanOrEqual(4_000);
    expect(MARKETING_REVIEWER_MAX_TOKENS).toBeGreaterThanOrEqual(3_000);
    expect(MARKETING_MAX_STRUCTURED_OUTPUT_TOKENS).toBeGreaterThan(MARKETING_WRITER_MAX_TOKENS);
  });
});
