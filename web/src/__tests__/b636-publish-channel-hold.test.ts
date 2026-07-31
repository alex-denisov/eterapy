/**
 * B636 — пауза канала вместо отмены публикации.
 *
 * Владелец 2026-07-31: «если возникла ошибка серверного характера при
 * публикации, вся очередь публикации должна быть приостановлена до тех пор,
 * пока ошибка не будет решена, а не отменять публикацию и не переносить её в
 * архив. При восстановлении доступа к каналу все публикации из отложенного
 * переходят в обычный режим».
 *
 * Прогоны держат четыре обещания: отказ канала отличается от дефекта
 * материала; строка не меняет статус; очередь канала стоит целиком; успешная
 * публикация снимает паузу.
 */

import {
  HOLD_PROBE_BACKOFF_MS,
  holdDecision,
  isChannelLevelPublicationError,
} from "@/lib/marketing/publish-hold";
import { publishScheduledMarketing } from "@/lib/marketing/publish";

const publicationFindMany = jest.fn();
const publicationUpdate = jest.fn();
const publicationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
const settingFindMany = jest.fn().mockResolvedValue([]);
const settingUpsert = jest.fn();
const settingDeleteMany = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => publicationFindMany(...args),
      update: (...args: unknown[]) => publicationUpdate(...args),
      updateMany: (...args: unknown[]) => publicationUpdateMany(...args),
      count: jest.fn().mockResolvedValue(3),
    },
    platformSetting: {
      findMany: (...args: unknown[]) => settingFindMany(...args),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: (...args: unknown[]) => settingUpsert(...args),
      deleteMany: (...args: unknown[]) => settingDeleteMany(...args),
    },
    marketingAutomationSignal: {
      upsert: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      findFirst: jest.fn().mockResolvedValue(null),
    },
  },
}));

jest.mock("@/lib/marketing/platform-settings", () => ({
  __esModule: true,
  marketingPlatformEnabled: jest.fn().mockResolvedValue(true),
  marketingPlatformValue: jest.fn().mockResolvedValue("value"),
  requiredMarketingPlatformValue: jest.fn().mockResolvedValue("value"),
}));

function row(id: string, platform: string) {
  return {
    id,
    key: `key-${id}`,
    title: "Заголовок",
    body: "Текст материала достаточной длины.",
    platform,
    contentType: "POST",
    mediaUrl: null,
    engagementTargetId: null,
    engagementTargetUrl: null,
    inboundReplyToId: null,
    inboundReplyTo: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  publicationUpdateMany.mockResolvedValue({ count: 1 });
  settingFindMany.mockResolvedValue([]);
});

describe("B636 · граница «отказ канала» и «дефект материала»", () => {
  it("серверные и сетевые отказы, лимиты и потерянный доступ — это канал", () => {
    for (const message of [
      "VK wall.post failed: HTTP 502",
      "Telegram sendMessage failed: Internal Server Error",
      "fetch failed",
      "The operation timed out",
      "Instagram media publish failed: rate limit reached",
      "Threads reply publish failed: The access token is invalid",
      "THREADS_ACCESS_TOKEN is not configured",
      "VK wall.post failed (27): Group authorization failed",
    ]) {
      expect(isChannelLevelPublicationError(message)).toBe(true);
    }
  });

  it("дефект самого материала каналом не считается — иначе одна кривая строка стопорит всё", () => {
    for (const message of [
      "Publication body is empty",
      "Telegram media caption exceeds 1024 characters",
      "Reddit target id is missing or invalid",
      "Unsupported publication platform: livejournal",
      "VK media exceeds the 15 MB upload limit",
    ]) {
      expect(isChannelLevelPublicationError(message)).toBe(false);
    }
  });
});

describe("B636 · решение по паузе", () => {
  const now = new Date("2026-07-31T12:00:00.000Z");

  it("без паузы очередь идёт как обычно", () => {
    expect(holdDecision({ hold: null, now, probeSpent: false })).toBe("publish");
  });

  it("пауза пропускает ровно одного разведчика за проход", () => {
    const hold = {
      platform: "vk",
      reason: "HTTP 502",
      heldSince: "2026-07-31T11:00:00.000Z",
      probeCount: 0,
      nextProbeAt: "2026-07-31T11:30:00.000Z",
    };
    expect(holdDecision({ hold, now, probeSpent: false })).toBe("probe");
    expect(holdDecision({ hold, now, probeSpent: true })).toBe("hold");
  });

  it("до срока следующей проверки не уходит и разведчик", () => {
    expect(holdDecision({
      hold: {
        platform: "vk",
        reason: "HTTP 502",
        heldSince: "2026-07-31T11:00:00.000Z",
        probeCount: 1,
        nextProbeAt: "2026-07-31T12:30:00.000Z",
      },
      now,
      probeSpent: false,
    })).toBe("hold");
  });

  it("отступ растёт, но не дальше часа — вернувшийся канал оживает в пределах часа", () => {
    expect(HOLD_PROBE_BACKOFF_MS[0]).toBe(10 * 60_000);
    expect(HOLD_PROBE_BACKOFF_MS[HOLD_PROBE_BACKOFF_MS.length - 1]).toBe(60 * 60_000);
  });
});

describe("B636 · выпуск при отказе канала", () => {
  it("строка возвращается в SCHEDULED, а не в FAILED и не в архив", async () => {
    publicationFindMany.mockResolvedValue([row("a", "vk")]);
    const result = await publishScheduledMarketing({
      enabled: true,
      adapters: { vk: async () => { throw new Error("VK wall.post failed: HTTP 502"); } },
    });

    const statuses = publicationUpdateMany.mock.calls.map((call) => call[0]?.data?.status);
    expect(statuses).toContain("SCHEDULED");
    expect(statuses).not.toContain("ARCHIVED");
    expect(publicationUpdate).not.toHaveBeenCalled();
    expect(result.held).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.heldPlatforms).toContain("vk");
  });

  it("остальная очередь того же канала не трогается вовсе", async () => {
    publicationFindMany.mockResolvedValue([row("a", "vk"), row("b", "vk"), row("c", "vk")]);
    const adapter = jest.fn(async () => { throw new Error("fetch failed"); });
    const result = await publishScheduledMarketing({ enabled: true, adapters: { vk: adapter } });

    // Наружу ушёл ровно один запрос: остальные строки даже не пробовали.
    expect(adapter).toHaveBeenCalledTimes(1);
    expect(result.held).toBe(3);
  });

  it("соседний канал продолжает работать — стоит направление, а не весь агент", async () => {
    publicationFindMany.mockResolvedValue([row("a", "vk"), row("b", "telegram")]);
    const telegram = jest.fn(async () => ({ externalPostId: "1", publicUrl: "https://t.me/x/1" }));
    const result = await publishScheduledMarketing({
      enabled: true,
      adapters: {
        vk: async () => { throw new Error("HTTP 503"); },
        telegram,
      },
    });

    expect(telegram).toHaveBeenCalledTimes(1);
    expect(result.published).toBe(1);
    expect(result.held).toBe(1);
  });

  it("дефект материала по-прежнему уводит в FAILED и очередь не останавливает", async () => {
    publicationFindMany.mockResolvedValue([row("a", "telegram"), row("b", "telegram")]);
    const adapter = jest.fn(async () => {
      throw new Error("Telegram media caption exceeds 1024 characters");
    });
    const result = await publishScheduledMarketing({ enabled: true, adapters: { telegram: adapter } });

    expect(adapter).toHaveBeenCalledTimes(2);
    expect(result.failed).toBe(2);
    expect(result.held).toBe(0);
    expect(publicationUpdate.mock.calls.map((call) => call[0]?.data?.status)).toEqual(["FAILED", "FAILED"]);
  });

  it("прошедшая публикация снимает паузу — очередь идёт дальше сама", async () => {
    settingFindMany.mockResolvedValue([{
      key: "marketing.publish.hold.vk",
      value: JSON.stringify({
        platform: "vk",
        reason: "HTTP 502",
        heldSince: "2026-07-31T11:00:00.000Z",
        probeCount: 0,
        nextProbeAt: "2000-01-01T00:00:00.000Z",
      }),
    }]);
    publicationFindMany.mockResolvedValue([row("a", "vk"), row("b", "vk")]);
    const adapter = jest.fn(async () => ({ externalPostId: "5", publicUrl: "https://vk.com/wall-1_5" }));
    const result = await publishScheduledMarketing({ enabled: true, adapters: { vk: adapter } });

    expect(settingDeleteMany).toHaveBeenCalledWith({
      where: { key: "marketing.publish.hold.vk" },
    });
    // Разведчик прошёл, пауза снята — и вторая строка того же прохода вышла.
    expect(adapter).toHaveBeenCalledTimes(2);
    expect(result.published).toBe(2);
    expect(result.heldPlatforms).toEqual([]);
  });

  it("пока пауза действует и срок разведчика не наступил, наружу не идёт ничего", async () => {
    settingFindMany.mockResolvedValue([{
      key: "marketing.publish.hold.vk",
      value: JSON.stringify({
        platform: "vk",
        reason: "HTTP 502",
        heldSince: "2026-07-31T11:00:00.000Z",
        probeCount: 2,
        nextProbeAt: "2099-01-01T00:00:00.000Z",
      }),
    }]);
    publicationFindMany.mockResolvedValue([row("a", "vk")]);
    const adapter = jest.fn();
    const result = await publishScheduledMarketing({ enabled: true, adapters: { vk: adapter } });

    expect(adapter).not.toHaveBeenCalled();
    expect(publicationUpdate).not.toHaveBeenCalled();
    expect(result.held).toBe(1);
  });
});
