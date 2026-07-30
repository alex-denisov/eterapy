/**
 * B618 — выпуск ответа на входящее проходит через ту же дверь, что публикации.
 *
 * Здесь проверяется маршрутизация и закрытие входящего: пока ответ не ушёл,
 * человек ждёт, и сторож должен это видеть. Отдельно — что периметр B617 не
 * путает ответ на своё с комментарием под чужим постом.
 */

const rows: Array<Record<string, unknown>> = [];
const updateMany = jest.fn();
const update = jest.fn();
const inboundUpdateMany = jest.fn();

jest.mock("@/lib/db", () => {
  const db = {
    externalPublication: {
      findMany: async () => rows,
      updateMany,
      update,
    },
    marketingInboundMessage: {
      updateMany: inboundUpdateMany,
    },
  };
  return { __esModule: true, db, default: db };
});

jest.mock("@/lib/telegram", () => ({ callTelegramApi: jest.fn() }));
jest.mock("@/lib/marketing/platform-settings", () => ({
  marketingPlatformEnabled: async () => true,
  marketingPlatformValue: async () => null,
  requiredMarketingPlatformValue: async () => "value",
}));
jest.mock("@/lib/marketing/dzen-feed", () => ({
  dzenFeedConfirmed: async () => false,
  dzenFeedGuid: (key: string) => `dzen-feed:${key}`,
}));

import { publishScheduledMarketing } from "@/lib/marketing/publish";
import { INBOUND_REPLY_CONTENT_TYPE } from "@/lib/marketing/perimeter";

const inboundRow = {
  id: "p-inbound",
  key: "smm-inbound-abc",
  title: "Ответ на входящее: @reader",
  body: "Работает и без даты рождения — достаточно описать ситуацию.",
  platform: "threads",
  contentType: INBOUND_REPLY_CONTENT_TYPE,
  mediaUrl: null,
  engagementTargetId: null,
  engagementTargetUrl: "https://www.threads.net/post/1",
  inboundReplyToId: "in-1",
  inboundReplyTo: {
    platform: "threads",
    kind: "COMMENT",
    externalId: "c-1",
    threadId: "media-1",
    permalink: "https://www.threads.net/post/1",
  },
};

beforeEach(() => {
  rows.length = 0;
  updateMany.mockReset();
  update.mockReset();
  inboundUpdateMany.mockReset();
});

describe("B618 · выпуск ответа на входящее", () => {
  it("ответ уходит адресату входящего и закрывает его", async () => {
    rows.push({ ...inboundRow });
    updateMany.mockResolvedValueOnce({ count: 1 });
    update.mockResolvedValue({});
    const adapter = jest.fn(async () => ({ externalPostId: "r-1", publicUrl: "https://www.threads.net/post/2" }));

    const result = await publishScheduledMarketing({
      enabled: true,
      now: new Date("2026-07-30T12:00:00Z"),
      adapters: { threads: adapter },
    });

    expect(result).toMatchObject({ published: 1, failed: 0 });
    expect(adapter).toHaveBeenCalledWith(expect.objectContaining({
      inbound: expect.objectContaining({ externalId: "c-1", threadId: "media-1" }),
    }));
    expect(inboundUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: "ANSWERED" }),
    }));
  });

  it("неудача выпуска не закрывает входящее: человек всё ещё ждёт", async () => {
    rows.push({ ...inboundRow });
    updateMany.mockResolvedValueOnce({ count: 1 });
    update.mockResolvedValue({});

    const result = await publishScheduledMarketing({
      enabled: true,
      now: new Date("2026-07-30T12:00:00Z"),
      adapters: {
        threads: async () => {
          throw new Error("Threads reply publish failed: HTTP 400");
        },
      },
    });

    expect(result).toMatchObject({ published: 0, failed: 1 });
    expect(inboundUpdateMany).not.toHaveBeenCalled();
  });

  it("ответ на входящее выпускается и при выключенной автопубликации постов", async () => {
    rows.push({ ...inboundRow });
    updateMany.mockResolvedValueOnce({ count: 1 });
    update.mockResolvedValue({});

    const result = await publishScheduledMarketing({
      enabled: false,
      now: new Date("2026-07-30T12:00:00Z"),
      adapters: { threads: async () => ({ externalPostId: "r-2", publicUrl: null }) },
    });

    expect(result).toMatchObject({ enabled: false, published: 1 });
  });

  it("периметр B617 не архивирует ответ на своё входящее", async () => {
    // У строки есть адрес чужого поста в engagementTargetId — раньше этого было
    // достаточно, чтобы уехать в архив. Ссылка на входящее делает её ответом в
    // своём пространстве.
    rows.push({ ...inboundRow, engagementTargetId: "c-1" });
    updateMany.mockResolvedValueOnce({ count: 1 });
    update.mockResolvedValue({});

    const result = await publishScheduledMarketing({
      enabled: true,
      now: new Date("2026-07-30T12:00:00Z"),
      adapters: { threads: async () => ({ externalPostId: "r-3", publicUrl: null }) },
    });

    expect(result.outcomes).toEqual([{ id: "p-inbound", status: "published" }]);
  });
});
