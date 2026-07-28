const rows: Array<Record<string, unknown>> = [];
const updateMany = jest.fn();
const update = jest.fn();

jest.mock("@/lib/db", () => {
  const db = {
    externalPublication: {
      findMany: async () => rows,
      updateMany,
      update,
    },
  };
  return { __esModule: true, db, default: db };
});

jest.mock("@/lib/telegram", () => ({ callTelegramApi: jest.fn() }));

import {
  marketingAutopublishEnabled,
  publishScheduledMarketing,
} from "@/lib/marketing/publish";

beforeEach(() => {
  rows.length = 0;
  updateMany.mockReset();
  update.mockReset();
});

describe("B589 · публикация", () => {
  it("по умолчанию закрыта и даже не читает очередь", async () => {
    expect(marketingAutopublishEnabled({})).toBe(false);
    await expect(publishScheduledMarketing({ enabled: false }))
      .resolves.toMatchObject({ enabled: false, due: 0 });
  });

  it("claim не даёт двум воркерам выпустить одну запись", async () => {
    rows.push({ id: "p1", title: "Пост", body: "Полезный текст", platform: "vk" });
    updateMany.mockResolvedValueOnce({ count: 0 });
    const adapter = jest.fn();

    const result = await publishScheduledMarketing({
      enabled: true,
      now: new Date("2026-07-28T12:00:00Z"),
      adapters: { vk: adapter },
    });

    expect(adapter).not.toHaveBeenCalled();
    expect(result.published).toBe(0);
  });

  it("сохраняет внешний id, URL и первый контроль D+7", async () => {
    rows.push({ id: "p1", title: "Пост", body: "Полезный текст", platform: "telegram" });
    updateMany.mockResolvedValueOnce({ count: 1 });
    update.mockResolvedValue({});
    const now = new Date("2026-07-28T12:00:00Z");

    const result = await publishScheduledMarketing({
      enabled: true,
      now,
      adapters: {
        telegram: async () => ({
          externalPostId: "42",
          publicUrl: "https://t.me/eterapy/42",
        }),
      },
    });

    expect(result).toMatchObject({ due: 1, published: 1, failed: 0 });
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "PUBLISHED",
        externalPostId: "42",
        publicUrl: "https://t.me/eterapy/42",
        nextReviewAt: new Date("2026-08-04T12:00:00Z"),
      }),
    }));
  });

  it("ошибка канала видна и не повторяется вслепую", async () => {
    rows.push({ id: "p2", title: "Пост", body: "Текст", platform: "vk" });
    updateMany.mockResolvedValueOnce({ count: 1 });
    update.mockResolvedValue({});

    const result = await publishScheduledMarketing({
      enabled: true,
      adapters: { vk: async () => { throw new Error("VK denied"); } },
    });

    expect(result).toMatchObject({ failed: 1 });
    expect(update).toHaveBeenLastCalledWith({
      where: { id: "p2" },
      data: { status: "FAILED", lastError: "VK denied" },
    });
  });
});
