/** B773 — карточка утверждения Threads уходит со ВСЕМИ частями поста, кнопки под последним сообщением. */
process.env.MARKETING_MODERATION_SECRET = "test-secret";

const row: Record<string, unknown> = {};
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findUnique: jest.fn(async () => row),
      update: jest.fn(async () => ({})),
    },
  },
}));
const sent: Array<{ text: string; markup: unknown }> = [];
jest.mock("@/lib/telegram", () => ({
  sendTelegram: jest.fn(async (_chat: string, text: string, opts?: { replyMarkup?: unknown }) => {
    sent.push({ text, markup: opts?.replyMarkup });
    return 900 + sent.length;
  }),
  callTelegramApi: jest.fn(async () => ({})),
}));
jest.mock("@/lib/ops-notification-channel", () => ({
  marketingDeliveryTargets: jest.fn(async () => ["-100"]),
  moderationChatIds: jest.fn(async () => ["-100"]),
  resolveMarketingChannel: jest.fn(async () => ({ chatIds: ["-100"], source: "test" })),
}));

import { requestMarketingModeration } from "@/lib/marketing/moderation";

describe("B773 карточка утверждения", () => {
  beforeEach(() => {
    sent.length = 0;
    Object.assign(row, {
      id: "p1", platform: "THREADS", contentType: "POST", status: "REVIEW", source: "AGENT",
      body: "Первый кусок поста.", cluster: "K1", scheduledFor: new Date("2026-10-14T10:00:00Z"),
      agentWriterProvider: "a", agentWriterModel: "b", agentReviewerProvider: "c", agentReviewerModel: "d",
      notes: JSON.stringify({ replyText: "Вторая часть про границы. Третья часть про тревогу.", technique: "P5" }),
      engagementTargetUrl: null, engagementExcerpt: null, moderationDecisionAt: null,
    });
  });

  it("части поста видны владельцу", async () => {
    const result = await requestMarketingModeration("p1");
    expect(result.sent).toBe(true);
    const all = sent.map((message) => message.text).join("\n");
    expect(all).toContain("Первый кусок поста.");
    expect(all).toContain("Продолжение 1 из");
    expect(all).toContain("Вторая часть про границы.");
  });

  it("длинный пост уходит несколькими сообщениями, кнопки только под последним", async () => {
    row.notes = JSON.stringify({ replyText: Array.from({ length: 60 }, (_, i) => `Часть ${i} ${"слово ".repeat(60)}.`).join(" ") });
    await requestMarketingModeration("p1");
    expect(sent.length).toBeGreaterThan(1);
    expect(sent.slice(0, -1).every((message) => message.markup === undefined)).toBe(true);
    expect(sent[sent.length - 1].markup).toBeDefined();
    expect(sent.every((message) => message.text.length <= 4096)).toBe(true);
  });
});
