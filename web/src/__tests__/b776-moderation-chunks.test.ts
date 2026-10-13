process.env.MARKETING_MODERATION_SECRET = "test-secret";

const row: Record<string, unknown> = {};
const store = new Map<string, string>();
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: { findUnique: jest.fn(async () => row), update: jest.fn(async () => ({})) },
    platformSetting: {
      findUnique: jest.fn(async ({ where }: { where: { key: string } }) => (store.has(where.key) ? { value: store.get(where.key) } : null)),
      upsert: jest.fn(async ({ where, create }: { where: { key: string }; create: { value: string } }) => { store.set(where.key, create.value); }),
    },
  },
}));
const sent: Array<{ chat: string; text: string }> = [];
let failOn: { chat: string; times: number; afterSent: number } | null = null;
jest.mock("@/lib/telegram", () => ({
  sendTelegram: jest.fn(async (chat: string, text: string) => {
    if (failOn && failOn.chat === chat && sent.filter((item) => item.chat === chat).length >= failOn.afterSent && failOn.times > 0) {
      failOn.times -= 1;
      throw new Error("telegram down");
    }
    sent.push({ chat, text });
    return 500 + sent.length;
  }),
  callTelegramApi: jest.fn(async () => ({})),
}));
jest.mock("@/lib/ops-notification-channel", () => ({
  marketingDeliveryTargets: jest.fn(async () => ["-1", "-2", "-1"]),
  moderationChatIds: jest.fn(async () => ["-1"]),
  resolveMarketingChannel: jest.fn(async () => ({ chatIds: ["-1"], source: "test" })),
}));

import { requestMarketingModeration } from "@/lib/marketing/moderation";
import { chunkCardMessage } from "@/lib/marketing/moderation-card";
import { pickPending, readCardChunks, type PendingReason } from "@/lib/marketing/threads-verdicts";

const longPart = (word: string) => Array.from({ length: 60 }, (_, i) => `Часть ${i} ${`${word} `.repeat(60)}.`).join(" ");

describe("B776 MEDIUM-2: части карточки", () => {
  beforeEach(() => {
    sent.length = 0; store.clear(); failOn = null;
    Object.assign(row, {
      id: "p1", platform: "THREADS", contentType: "POST", status: "REVIEW", source: "AGENT",
      body: longPart("а"), cluster: "K1", scheduledFor: new Date("2026-10-14T10:00:00Z"),
      agentWriterProvider: "a", agentWriterModel: "b", agentReviewerProvider: "c", agentReviewerModel: "d",
      notes: JSON.stringify({ replyText: `${longPart("б")}\n\n${longPart("в")}` }),
      engagementTargetUrl: null, engagementExcerpt: null, moderationDecisionAt: null,
    });
  });

  it("сбой последней части: повтор в том же чате продолжает с места сбоя, дублей нет", async () => {
    await requestMarketingModeration("p1");
    const total = sent.length;
    expect(total).toBeGreaterThan(1);
    sent.length = 0;
    failOn = { chat: "-1", times: 1, afterSent: total - 1 };
    await requestMarketingModeration("p1");
    expect(sent.every((item) => item.chat === "-1")).toBe(true);
    expect(sent).toHaveLength(total);
    expect(new Set(sent.map((item) => item.text)).size).toBe(total);
  });

  it("id всех частей сохраняются; reply на первую часть привязывается к карточке", async () => {
    await requestMarketingModeration("p1");
    const ids = await readCardChunks("p1");
    expect(ids.length).toBe(sent.length);
    const entry: PendingReason = {
      publicationId: "p1", action: "revise", chatId: "-1", cardMessageId: ids[ids.length - 1], promptMessageId: 999,
      chunkMessageIds: ids, tags: [], at: new Date().toISOString(),
    };
    const lookup = pickPending([entry], "-1", ids[0], new Date());
    expect(lookup.kind).toBe("found");
    expect(pickPending([entry], "-1", 123456, new Date()).kind).toBe("none");
  });

  it("строка длиннее предела режется по знакам, ни одна часть не превышает предел", () => {
    const monster = "я".repeat(9000);
    const chunks = chunkCardMessage(`<b>Заголовок</b>\n\n${monster}`);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((chunk) => chunk.length <= 3800)).toBe(true);
    expect(chunks.join("").replace(/[^я]/g, "")).toHaveLength(9000);
  });

  it("сущность &amp; на границе не рвётся", () => {
    const text = `${"x".repeat(3797)}&amp;&amp;yy`;
    const chunks = chunkCardMessage(text);
    expect(chunks.every((chunk) => !/&[a-z]*$/.test(chunk) || chunk.endsWith(";"))).toBe(true);
  });
});
