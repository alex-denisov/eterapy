/**
 * B628 — у разговора отдельный суточный кошелёк.
 *
 * Замер прода 2026-07-30: `marketing-agent-writer` израсходовал 603 001 токен
 * за 2,5 часа на плановые публикации, и весь остаток суток любая генерация,
 * включая ответ живому человеку, падала с «budget exceeded». Пост можно выпустить
 * завтра, ответ — нельзя: человек ждёт сейчас. Поэтому ключ возможности, по
 * которому считается потолок, у ответа свой.
 */

import { INBOUND_REPLY_CONTENT_TYPE } from "@/lib/marketing/perimeter";
import {
  MARKETING_REPLY_REVIEWER_FEATURE,
  MARKETING_REPLY_WRITER_FEATURE,
  PUBLIC_MARKETING_AI_FEATURES,
} from "@/lib/marketing/model-pool";
import { getDefaultAIRoutingPolicy } from "@/lib/ai-gateway/task-policy";
import { processMarketingDraft } from "@/lib/marketing/agent";

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

const WRITER_ANSWER = JSON.stringify({
  title: "Ответ",
  text: "Спасибо, что написали. Коротко по сути: разбор помогает отделить факты от догадок — и вы сами увидите следующий шаг.",
  audienceNeed: "поддержка",
  goal: "ответить человеку",
  disclosure: "",
  cta: "",
  mediaBrief: "",
  researchUsed: [],
  safetyFlags: [],
});

const REVIEW_SCORES = {
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
};

const REVIEWER_ANSWER = JSON.stringify({
  decision: "APPROVE",
  scores: REVIEW_SCORES,
  issues: [],
  revisionBrief: [],
  revisedText: "",
  summary: "Готово",
});

function completionFor(feature: string) {
  const isWriter = String(feature).includes("writer");
  return {
    text: isWriter ? WRITER_ANSWER : REVIEWER_ANSWER,
    provider: isWriter ? "GEMINI" : "MISTRAL",
    model: isWriter ? "gemini-3.6-flash" : "mistral-small-2603",
  };
}

describe("B628 · раздельные потолки токенов", () => {
  beforeEach(() => {
    aiComplete.mockReset().mockImplementation((input: { feature: string }) =>
      Promise.resolve(completionFor(input.feature)));
    update.mockReset().mockImplementation((args: { data: unknown }) =>
      Promise.resolve({ id: "pub-1", ...(args.data as object) }));
    findUnique.mockReset();
  });

  it("ответ человеку списывается с ключа ответов, а не с ключа плана", async () => {
    findUnique.mockResolvedValue({
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
    });

    await processMarketingDraft("pub-1");

    const features = aiComplete.mock.calls.map((call) => (call[0] as { feature: string }).feature);
    expect(features).toContain(MARKETING_REPLY_WRITER_FEATURE);
    expect(features).toContain(MARKETING_REPLY_REVIEWER_FEATURE);
    expect(features).not.toContain("marketing-agent-writer");
    expect(features).not.toContain("marketing-agent-reviewer");
  });

  it("плановая публикация по-прежнему списывается с ключа плана", async () => {
    findUnique.mockResolvedValue({
      id: "pub-2",
      key: "smm-plan-2",
      status: "DRAFT",
      platform: "vk",
      title: "Пост по плану",
      contentType: "POST",
      cluster: "саморефлексия",
      targetQuery: null,
      notes: null,
      destinationUrl: "https://eterapy.com/products/chat",
      engagementExcerpt: null,
      engagementTargetLabel: null,
      engagementTargetUrl: null,
      engagementTargetId: null,
      engagementTone: null,
      scheduledFor: new Date("2026-07-31T09:00:00.000Z"),
      attemptCount: 0,
    });

    await processMarketingDraft("pub-2");

    const features = aiComplete.mock.calls.map((call) => (call[0] as { feature: string }).feature);
    expect(features).toContain("marketing-agent-writer");
    expect(features).not.toContain(MARKETING_REPLY_WRITER_FEATURE);
  });

  it("у ключей ответов есть собственный суточный потолок", () => {
    const replyWriter = getDefaultAIRoutingPolicy(MARKETING_REPLY_WRITER_FEATURE);
    const replyReviewer = getDefaultAIRoutingPolicy(MARKETING_REPLY_REVIEWER_FEATURE);
    const planWriter = getDefaultAIRoutingPolicy("marketing-agent-writer");

    expect(replyWriter?.dailyTokenBudget).toBeGreaterThan(0);
    expect(replyReviewer?.dailyTokenBudget).toBeGreaterThan(0);
    // Потолки именно РАЗНЫЕ ключи, а не один на двоих: иначе разделение
    // существовало бы только на бумаге.
    expect(replyWriter?.feature).not.toBe(planWriter?.feature);
  });

  it("новые ключи входят в публичный маркетинговый периметр", () => {
    expect(PUBLIC_MARKETING_AI_FEATURES).toContain(MARKETING_REPLY_WRITER_FEATURE);
    expect(PUBLIC_MARKETING_AI_FEATURES).toContain(MARKETING_REPLY_REVIEWER_FEATURE);
  });
});
