/**
 * Батч №18, комментарий владельца 1 — бухгалтерские уведомления уходят в
 * служебный канал, а не в личный Telegram суперадмина.
 *
 * Проверяем ровно то, что могло сломаться молча: выбор адреса и то, что при
 * настроенном канале база вообще не опрашивается (иначе «канал есть, а пишем
 * всё равно человеку» осталось бы незамеченным).
 */

import { configuredOpsChatId, resolveOpsChannel } from "@/lib/ops-notification-channel";

const findMany = jest.fn();

jest.mock("@/lib/db", () => ({
  __esModule: true,
  db: { user: { findMany: (...args: unknown[]) => findMany(...args) } },
  default: { user: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

describe("B591 · адрес служебных уведомлений", () => {
  beforeEach(() => {
    findMany.mockReset();
  });

  describe("configuredOpsChatId", () => {
    it("предпочитает явный OPS_NOTIFY_CHAT_ID", () => {
      expect(
        configuredOpsChatId({
          OPS_NOTIFY_CHAT_ID: "-100777",
          TELEGRAM_CHAT_ID: "-100111",
        }),
      ).toBe("-100777");
    });

    it("падает на деплой-канал TELEGRAM_CHAT_ID, когда отдельного нет", () => {
      expect(configuredOpsChatId({ TELEGRAM_CHAT_ID: "-100111" })).toBe(
        "-100111",
      );
    });

    it("не считает адресом пустую строку", () => {
      expect(
        configuredOpsChatId({ OPS_NOTIFY_CHAT_ID: "   ", TELEGRAM_CHAT_ID: "" }),
      ).toBeNull();
    });

    it("возвращает null, когда не задано ничего", () => {
      expect(configuredOpsChatId({})).toBeNull();
    });
  });

  describe("resolveOpsChannel", () => {
    it("при настроенном канале НЕ ходит в базу за суперадминами", async () => {
      const target = await resolveOpsChannel({ TELEGRAM_CHAT_ID: "-100111" });
      expect(target).toEqual({ chatIds: ["-100111"], source: "ops_channel" });
      expect(findMany).not.toHaveBeenCalled();
    });

    it("без канала откатывается на личный Telegram суперадминов", async () => {
      findMany.mockResolvedValue([{ telegramId: "49304596" }, { telegramId: null }]);
      const target = await resolveOpsChannel({});
      expect(target).toEqual({ chatIds: ["49304596"], source: "superadmin_fallback" });
    });

    it("честно сообщает «некуда», а не молчаливый успех", async () => {
      findMany.mockResolvedValue([]);
      const target = await resolveOpsChannel({});
      expect(target).toEqual({ chatIds: [], source: "none" });
    });
  });
});
