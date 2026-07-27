/**
 * INC-088 — одна привязка Telegram вместо двух несвязанных.
 *
 * Регрессия, ради которой тест написан: identity входа из Mini App и
 * `users.telegramId` (адрес доставки) писались порознь. Человек связывал
 * аккаунт из Mini App, а в разделе «Уведомления» оставался «не привязан» и не
 * получал ничего — включая напоминания о сроках ИП (B591 фаза 4).
 */
import { bindTelegramToUser, findUserByTelegramSubject, unbindTelegramFromUser } from "@/lib/telegram-binding";
import db from "@/lib/db";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    user: { findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    platformIdentity: { findUnique: jest.fn(), upsert: jest.fn(), delete: jest.fn() },
    telegramLinkToken: { deleteMany: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockDb = db as unknown as {
  user: { findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock };
  platformIdentity: { findUnique: jest.Mock; upsert: jest.Mock; delete: jest.Mock };
  telegramLinkToken: { deleteMany: jest.Mock };
  $transaction: jest.Mock;
};

beforeEach(() => {
  jest.clearAllMocks();
  mockDb.$transaction.mockImplementation((fn: (tx: unknown) => unknown) => fn(mockDb));
});

describe("bindTelegramToUser", () => {
  it("пишет обе записи разом: identity входа и адрес доставки", async () => {
    mockDb.platformIdentity.findUnique.mockResolvedValue(null);
    mockDb.user.findFirst.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue({ id: "u1", telegramId: null });

    const result = await bindTelegramToUser({ userId: "u1", subjectId: "49304596", username: "alexey_denisov" });

    expect(result).toEqual({ ok: true, subjectId: "49304596" });
    expect(mockDb.platformIdentity.upsert).toHaveBeenCalledTimes(1);
    expect(mockDb.user.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { telegramId: "49304596", telegramUsername: "alexey_denisov" },
    });
  });

  it("отказывает, когда этот Telegram уже держит другой аккаунт по адресу доставки", async () => {
    mockDb.platformIdentity.findUnique.mockResolvedValue(null);
    mockDb.user.findFirst.mockResolvedValue({ id: "u2" });
    mockDb.user.findUnique.mockResolvedValue({ id: "u1", telegramId: null });

    const result = await bindTelegramToUser({ userId: "u1", subjectId: "49304596" });

    expect(result).toEqual({ ok: false, code: "IDENTITY_IN_USE" });
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("отказывает, когда этот Telegram уже держит другой аккаунт по identity входа", async () => {
    mockDb.platformIdentity.findUnique.mockImplementation(({ where }: { where: Record<string, unknown> }) =>
      "provider_subjectId" in where ? Promise.resolve({ id: "i1", userId: "u2", subjectId: "49304596" }) : Promise.resolve(null));
    mockDb.user.findFirst.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue({ id: "u1", telegramId: null });

    const result = await bindTelegramToUser({ userId: "u1", subjectId: "49304596" });

    expect(result).toEqual({ ok: false, code: "IDENTITY_IN_USE" });
  });

  it("отказывает, когда у аккаунта уже привязан ДРУГОЙ Telegram", async () => {
    mockDb.platformIdentity.findUnique.mockResolvedValue(null);
    mockDb.user.findFirst.mockResolvedValue(null);
    mockDb.user.findUnique.mockResolvedValue({ id: "u1", telegramId: "111" });

    const result = await bindTelegramToUser({ userId: "u1", subjectId: "49304596" });

    expect(result).toEqual({ ok: false, code: "USER_HAS_IDENTITY" });
  });

  it("повторная привязка того же Telegram к тому же аккаунту проходит", async () => {
    mockDb.platformIdentity.findUnique.mockResolvedValue({ id: "i1", userId: "u1", subjectId: "49304596" });
    mockDb.user.findFirst.mockResolvedValue({ id: "u1" });
    mockDb.user.findUnique.mockResolvedValue({ id: "u1", telegramId: "49304596" });

    const result = await bindTelegramToUser({ userId: "u1", subjectId: "49304596" });

    expect(result).toEqual({ ok: true, subjectId: "49304596" });
  });
});

describe("unbindTelegramFromUser", () => {
  it("снимает обе записи и гасит висящие токены привязки", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "u1", telegramId: "49304596" });
    mockDb.platformIdentity.findUnique.mockResolvedValue({ id: "i1", subjectId: "49304596" });

    const result = await unbindTelegramFromUser("u1");

    expect(result).toEqual({ unlinked: true, userId: "u1", subjectId: "49304596" });
    expect(mockDb.platformIdentity.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
    expect(mockDb.user.update).toHaveBeenCalledWith({ where: { id: "u1" }, data: { telegramId: null, telegramUsername: null } });
    expect(mockDb.telegramLinkToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "u1" } });
  });

  it("снимает identity, даже если адрес доставки был пуст — это и есть расхождение", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "u1", telegramId: null });
    mockDb.platformIdentity.findUnique.mockResolvedValue({ id: "i1", subjectId: "49304596" });

    const result = await unbindTelegramFromUser("u1");

    expect(result.unlinked).toBe(true);
    expect(mockDb.platformIdentity.delete).toHaveBeenCalledWith({ where: { id: "i1" } });
    expect(mockDb.user.update).not.toHaveBeenCalled();
  });

  it("сообщает, что снимать нечего", async () => {
    mockDb.user.findUnique.mockResolvedValue({ id: "u1", telegramId: null });
    mockDb.platformIdentity.findUnique.mockResolvedValue(null);

    const result = await unbindTelegramFromUser("u1");

    expect(result.unlinked).toBe(false);
    expect(mockDb.platformIdentity.delete).not.toHaveBeenCalled();
  });
});

describe("findUserByTelegramSubject", () => {
  it("находит аккаунт по identity входа, когда адрес доставки ещё не проставлен", async () => {
    mockDb.user.findFirst.mockResolvedValue(null);
    mockDb.platformIdentity.findUnique.mockResolvedValue({ user: { id: "u1", name: "Алексей" } });

    await expect(findUserByTelegramSubject("49304596")).resolves.toEqual({ id: "u1", name: "Алексей" });
  });

  it("возвращает null, когда Telegram не знает ни одна запись", async () => {
    mockDb.user.findFirst.mockResolvedValue(null);
    mockDb.platformIdentity.findUnique.mockResolvedValue(null);

    await expect(findUserByTelegramSubject("42")).resolves.toBeNull();
  });
});
