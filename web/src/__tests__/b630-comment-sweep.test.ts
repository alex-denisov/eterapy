/**
 * B630 — обход комментариев и антиспам ответов.
 *
 * Владелец 2026-07-30: «нужен отдельный агент-SMM-щик, который раз в 15 минут
 * обходит на предмет комментариев и, только не спамить, при необходимости
 * отвечает — не позже часа с момента комментария».
 *
 * Здесь проверяются три обещания: обход не зависит от webhook, один комментарий
 * не превращается в два входящих, и пределы частоты откладывают ответ, а не
 * отменяют его.
 */

import {
  INBOUND_REPLIES_PER_DAY,
  INBOUND_REPLIES_PER_HOUR,
  INBOUND_SLA_MS,
  INBOUND_THREAD_COOLDOWN_MS,
  inboundReplyAllowed,
} from "@/lib/marketing/inbound";
import {
  SWEEP_LOOKBACK_MS,
  SWEEP_PLATFORMS,
  sweepOwnPublicationComments,
} from "@/lib/marketing/engagement-sweep";

const findMany = jest.fn();
const ingestInboundMessage = jest.fn();
const marketingPlatformEnabled = jest.fn();
const marketingPlatformValue = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => findMany(...args),
      count: jest.fn().mockResolvedValue(0),
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      update: jest.fn(),
    },
    marketingInboundMessage: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    platformSetting: { findUnique: jest.fn(), upsert: jest.fn() },
    marketingAutomationSignal: { upsert: jest.fn(), updateMany: jest.fn() },
  },
}));

jest.mock("@/lib/marketing/inbound", () => {
  const actual = jest.requireActual("@/lib/marketing/inbound");
  return {
    __esModule: true,
    ...actual,
    ingestInboundMessage: (...args: unknown[]) => ingestInboundMessage(...args),
  };
});

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformEnabled: (...args: unknown[]) => marketingPlatformEnabled(...args),
  marketingPlatformValue: (...args: unknown[]) => marketingPlatformValue(...args),
  requiredMarketingPlatformValue: jest.fn(),
}));

const VK_COMMENTS = {
  response: {
    items: [
      { id: 11, from_id: 700, text: "А это точно не гадание?", date: 1_785_000_000 },
      { id: 12, from_id: -321, text: "Наш собственный ответ", date: 1_785_000_100 },
    ],
  },
};

describe("B630 · обход комментариев под своими публикациями", () => {
  beforeEach(() => {
    findMany.mockReset().mockResolvedValue([
      { id: "pub-1", externalPostId: "42", publicUrl: "https://vk.com/wall-321_42" },
    ]);
    ingestInboundMessage.mockReset().mockResolvedValue({ id: "in-1", created: true, status: "RECEIVED" });
    marketingPlatformEnabled.mockReset().mockImplementation((platform: string) =>
      Promise.resolve(platform === "VK"));
    marketingPlatformValue.mockReset().mockImplementation((key: string) => Promise.resolve(
      key === "VK_COMMUNITY_TOKEN" ? "vk-token" : key === "VK_COMMUNITY_ID" ? "321" : null,
    ));
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => VK_COMMENTS,
    }) as unknown as typeof fetch;
  });

  it("обход берёт комментарии по токену сообщества, без Callback API", async () => {
    const outcomes = await sweepOwnPublicationComments({
      now: new Date("2026-07-30T12:00:00.000Z"),
      platforms: ["vk"],
    });
    const vk = outcomes.find((outcome) => outcome.platform === "vk");
    expect(vk).toMatchObject({ publications: 1, found: 2, ingested: 1, skippedOwn: 1 });
  });

  it("идентификатор комментария совпадает с тем, что присылает Callback API", async () => {
    await sweepOwnPublicationComments({
      now: new Date("2026-07-30T12:00:00.000Z"),
      platforms: ["vk"],
    });
    // Callback API кладёт `String(object.id)`. Другой формат означал бы два
    // входящих на один комментарий — webhook'ом и обходом.
    expect(ingestInboundMessage).toHaveBeenCalledWith(expect.objectContaining({
      platform: "vk",
      kind: "COMMENT",
      externalId: "11",
      threadId: "-321_42",
    }));
  });

  it("свой же комментарий в очередь не попадает", async () => {
    await sweepOwnPublicationComments({
      now: new Date("2026-07-30T12:00:00.000Z"),
      platforms: ["vk"],
    });
    const ids = ingestInboundMessage.mock.calls.map((call) => (call[0] as { externalId: string }).externalId);
    expect(ids).not.toContain("12");
  });

  it("выключенный коннектор возвращает строку, а не молчание", async () => {
    marketingPlatformEnabled.mockResolvedValue(false);
    const outcomes = await sweepOwnPublicationComments({
      now: new Date("2026-07-30T12:00:00.000Z"),
      platforms: ["vk", "threads"],
    });
    expect(outcomes).toHaveLength(2);
    expect(outcomes.every((outcome) => outcome.found === 0)).toBe(true);
  });

  it("отказ площадки отличим от отсутствия комментариев", async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ error: { error_msg: "Access denied" } }),
    }) as unknown as typeof fetch;
    const [vk] = await sweepOwnPublicationComments({
      now: new Date("2026-07-30T12:00:00.000Z"),
      platforms: ["vk"],
    });
    expect(vk.error).toContain("Access denied");
  });

  it("опрашиваются только публикации за последние две недели", async () => {
    const now = new Date("2026-07-30T12:00:00.000Z");
    await sweepOwnPublicationComments({ now, platforms: ["vk"] });
    expect(findMany.mock.calls[0][0].where.publishedAt.gte)
      .toEqual(new Date(now.getTime() - SWEEP_LOOKBACK_MS));
  });

  it("обход покрывает площадки, у которых webhook не работает", () => {
    expect(SWEEP_PLATFORMS).toEqual(expect.arrayContaining(["vk", "threads", "instagram"]));
  });
});

describe("B630 · антиспам ответов", () => {
  const now = new Date("2026-07-30T12:00:00.000Z");

  it("до потолка часа ответ разрешён", () => {
    expect(inboundReplyAllowed({
      perHour: INBOUND_REPLIES_PER_HOUR - 1,
      perDay: 0,
      lastReplyInThreadAt: null,
      now,
    })).toEqual({ allowed: true });
  });

  it("потолок часа откладывает ответ", () => {
    expect(inboundReplyAllowed({
      perHour: INBOUND_REPLIES_PER_HOUR,
      perDay: 0,
      lastReplyInThreadAt: null,
      now,
    })).toMatchObject({ allowed: false, reason: "hour_cap" });
  });

  it("потолок суток откладывает ответ", () => {
    expect(inboundReplyAllowed({
      perHour: 0,
      perDay: INBOUND_REPLIES_PER_DAY,
      lastReplyInThreadAt: null,
      now,
    })).toMatchObject({ allowed: false, reason: "day_cap" });
  });

  it("два ответа подряд в одной ветке разводятся во времени", () => {
    expect(inboundReplyAllowed({
      perHour: 0,
      perDay: 0,
      lastReplyInThreadAt: new Date(now.getTime() - INBOUND_THREAD_COOLDOWN_MS + 60_000),
      now,
    })).toMatchObject({ allowed: false, reason: "thread_cooldown" });
  });

  it("после паузы в ветке ответ снова разрешён", () => {
    expect(inboundReplyAllowed({
      perHour: 0,
      perDay: 0,
      lastReplyInThreadAt: new Date(now.getTime() - INBOUND_THREAD_COOLDOWN_MS - 1),
      now,
    })).toEqual({ allowed: true });
  });

  it("обещанный срок ответа — час", () => {
    expect(INBOUND_SLA_MS).toBe(60 * 60_000);
  });
});
