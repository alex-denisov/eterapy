import { readFileSync } from "fs";
import path from "path";
import { POST } from "@/app/api/notifications/telegram-verify/route";
import { DELETE } from "@/app/api/notifications/telegram-link/route";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { createHash, createHmac } from "crypto";
import type { NextRequest } from "next/server";

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
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;

function generateValidHash(authData: Record<string, string>, token: string) {
  const dataCheckString = Object.keys(authData)
    .sort()
    .map((key) => `${key}=${authData[key]}`)
    .join("\n");
  const secretKey = createHash("sha256").update(token).digest();
  return createHmac("sha256", secretKey).update(dataCheckString).digest("hex");
}

describe("Telegram link flow via Widget", () => {
  const TEST_BOT_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.TELEGRAM_BOT_USERNAME = "eterapy_test_bot";
    process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;
    mockAuth.mockResolvedValue({
      user: { id: "user-1", email: "user@example.com" },
      expires: new Date(Date.now() + 60_000).toISOString(),
    });
  });

  it("verifies a valid telegram login payload and links account", async () => {
    const authData = {
      id: "987654321",
      first_name: "Test",
      username: "test_user",
      auth_date: Math.floor(Date.now() / 1000).toString(),
    };
    const hash = generateValidHash(authData, TEST_BOT_TOKEN);

    (db.user.findFirst as jest.Mock).mockResolvedValueOnce(null); // Not linked to anyone else
    (db.telegramLinkToken.deleteMany as jest.Mock).mockResolvedValueOnce({});
    (db.user.update as jest.Mock).mockResolvedValueOnce({});

    const req = { json: async () => ({ ...authData, hash }) } as unknown as NextRequest;
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.linked).toBe(true);
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { telegramId: "987654321", telegramUsername: "test_user" },
    });
  });

  it("rejects an invalid telegram login payload", async () => {
    const authData = {
      id: "987654321",
      first_name: "Test",
      username: "test_user",
      auth_date: Math.floor(Date.now() / 1000).toString(),
    };
    
    // Generate with WRONG token
    const hash = generateValidHash(authData, "wrong-token");

    const req = { json: async () => ({ ...authData, hash }) } as unknown as NextRequest;
    const response = await POST(req);
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toBe("Invalid Telegram signature");
    expect(db.user.update).not.toHaveBeenCalled();
  });

  it("unlinks Telegram", async () => {
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
    expect(db.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: { telegramId: null, telegramUsername: null },
    });
  });

  it("includes the widget script in the component", () => {
    const source = readFileSync(
      path.join(process.cwd(), "src/components/notifications/notification-settings.tsx"),
      "utf8",
    );

    expect(source).toContain("https://telegram.org/js/telegram-widget.js");
    expect(source).toContain("data-telegram-login");
    expect(source).toContain("data-onauth");
  });
});
