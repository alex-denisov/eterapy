/**
 * B653 × B636 — уведомление о выпуске не имеет права портить сам выпуск.
 *
 * ⚠ ПОЧЕМУ ЭТОТ ПРОГОН СУЩЕСТВУЕТ. Первая версия B653 читала поля карточки из
 * значения, которое вернул `update`. На проде это работало бы, но любой сбой
 * или неожиданный ответ слоя данных бросал исключение ВНУТРИ общего `try`
 * выпуска — и внешний `catch` записывал строку `FAILED`. То есть материал,
 * который УЖЕ вышел на площадку, числился бы несостоявшимся, а очередь
 * попыталась бы выпустить его повторно.
 *
 * Это ровно тот класс ошибки, который закрывал B636: отказ соседней механики
 * не должен выглядеть как отказ публикации. Прогон держит границу.
 */

import { publishScheduledMarketing } from "@/lib/marketing/publish";

const publicationFindMany = jest.fn();
const publicationUpdate = jest.fn();
const publicationUpdateMany = jest.fn().mockResolvedValue({ count: 1 });

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    externalPublication: {
      findMany: (...args: unknown[]) => publicationFindMany(...args),
      update: (...args: unknown[]) => publicationUpdate(...args),
      updateMany: (...args: unknown[]) => publicationUpdateMany(...args),
      count: jest.fn().mockResolvedValue(1),
    },
    platformSetting: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
      upsert: jest.fn(),
      deleteMany: jest.fn(),
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

// Канал уведомлений полностью сломан: адрес не отдаётся вовсе.
jest.mock("@/lib/ops-notification-channel", () => ({
  __esModule: true,
  marketingDeliveryTargets: jest.fn().mockRejectedValue(new Error("Telegram недоступен")),
}));

function row() {
  return {
    id: "pub-1",
    key: "key-1",
    title: "Заголовок",
    body: "Текст материала достаточной длины.",
    platform: "telegram",
    channelName: "ETerapy",
    contentType: "POST",
    mediaUrl: null,
    destinationUrl: null,
    cluster: null,
    targetQuery: null,
    engagementTargetId: null,
    engagementTargetUrl: null,
    engagementTargetLabel: null,
    engagementExcerpt: null,
    engagementTone: null,
    inboundReplyToId: null,
    inboundReplyTo: null,
    planSlot: null,
    scheduledFor: null,
    notes: null,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  publicationUpdateMany.mockResolvedValue({ count: 1 });
});

describe("B653 · граница «уведомление» и «публикация»", () => {
  it("полностью недоступный канал уведомлений оставляет материал ОПУБЛИКОВАННЫМ", async () => {
    publicationFindMany.mockResolvedValue([row()]);
    // `update` намеренно не возвращает запись: код не должен от неё зависеть.
    publicationUpdate.mockResolvedValue(undefined);

    const result = await publishScheduledMarketing({
      enabled: true,
      adapters: {
        telegram: async () => ({ externalPostId: "42", publicUrl: "https://t.me/eterapy/42" }),
      },
    });

    expect(result.published).toBe(1);
    expect(result.failed).toBe(0);

    // И статус в базе именно PUBLISHED, а не FAILED.
    const statuses = publicationUpdate.mock.calls.map(
      ([args]) => (args as { data?: { status?: string } })?.data?.status,
    );
    expect(statuses).toContain("PUBLISHED");
    expect(statuses).not.toContain("FAILED");
  });
});
