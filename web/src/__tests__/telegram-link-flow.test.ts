import { readFileSync } from "fs";
import path from "path";
import { DELETE, GET, POST } from "@/app/api/notifications/telegram-link/route";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    telegramLinkToken: {
      create: jest.fn(),
      deleteMany: jest.fn(),
      findFirst: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;

describe("Telegram link flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_BOT_USERNAME = "eterapy_test_bot";
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  it("rejects unauthenticated link status requests", async () => {
    mockAuth.mockResolvedValueOnce(null);

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(db.user.findUnique).not.toHaveBeenCalled();
  });

  it("returns a pending link without leaking the raw token as a standalone field", async () => {
    const expiresAt = new Date(Date.now() + 10 * 60_000);
    (db.user.findUnique as jest.Mock).mockResolvedValueOnce({
      telegramId: null,
      telegramUsername: null,
    });
    (db.telegramLinkToken.findFirst as jest.Mock).mockResolvedValueOnce({
      token: "pending-token",
      expiresAt,
    });

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      linked: false,
      username: null,
      pending: true,
      url: "https://t.me/eterapy_test_bot?start=pending-token",
      expiresAt: expiresAt.toISOString(),
    });
    expect(body.token).toBeUndefined();
  });

  it("does not create a new pending token when Telegram is already linked", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValueOnce({
      telegramId: "tg-1",
      telegramUsername: "linked_user",
    });

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      linked: true,
      username: "linked_user",
      pending: false,
      url: null,
      expiresAt: null,
    });
    expect(db.telegramLinkToken.deleteMany).not.toHaveBeenCalled();
    expect(db.telegramLinkToken.create).not.toHaveBeenCalled();
  });

  it("rotates pending tokens and returns only the bot URL and expiry", async () => {
    (db.user.findUnique as jest.Mock).mockResolvedValueOnce({
      telegramId: null,
      telegramUsername: null,
    });
    (db.telegramLinkToken.create as jest.Mock).mockResolvedValueOnce({});

    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(expect.objectContaining({
      ok: true,
      linked: false,
      pending: true,
      expiresAt: expect.any(String),
    }));
    expect(body.url).toMatch(/^https:\/\/t\.me\/eterapy_test_bot\?start=[a-f0-9]{32}$/);
    expect(body.token).toBeUndefined();
    expect(db.telegramLinkToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(db.telegramLinkToken.create).toHaveBeenCalledWith({
      data: {
        token: expect.stringMatching(/^[a-f0-9]{32}$/),
        userId: "user-1",
        expiresAt: expect.any(Date),
      },
    });
  });

  it("unlinks Telegram and removes any pending link tokens", async () => {
    (db.telegramLinkToken.deleteMany as jest.Mock).mockResolvedValueOnce({});
    (db.user.update as jest.Mock).mockResolvedValueOnce({});

    const response = await DELETE();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      ok: true,
      linked: false,
      username: null,
      pending: false,
      url: null,
      expiresAt: null,
    });
    expect(db.telegramLinkToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { telegramId: null, telegramUsername: null },
    });
  });

  it("keeps explicit pending, manual check, linked, and error UI states in settings", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/notifications/notification-settings.tsx"),
      "utf8",
    );

    expect(source).toContain("data-testid=\"telegram-link-pending\"");
    expect(source).toContain("Ожидаем запуск бота...");
    expect(source).toContain("Telegram уже привязан");
    expect(source).toContain("Не удалось создать ссылку Telegram");
    expect(source).toContain("Ссылка истекла");
  });
});
