import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { GET as listConversations } from "@/app/api/admin/support/conversations/route";
import { POST as replyToConversation } from "@/app/api/admin/support/conversations/[id]/route";

jest.mock("@/lib/auth", () => ({ __esModule: true, auth: jest.fn() }));
jest.mock("@/lib/audit", () => ({ __esModule: true, logAudit: jest.fn() }));
jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    moderatorPermission: { findMany: jest.fn() },
    supportConversation: { findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
    supportMessage: { create: jest.fn() },
    $transaction: jest.fn(),
  },
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db>;
const mockLogAudit = logAudit as jest.MockedFunction<typeof logAudit>;

function request(body: unknown) {
  return new Request("https://admin.eterapy.com/api/admin/support/conversations/conversation-1", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("B482 support API authorization and reply flow", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "moderator-1", role: "ADMIN" },
      expires: "2026-07-16T00:00:00.000Z",
    } as never);
    (mockDb.moderatorPermission.findMany as jest.Mock).mockResolvedValue([]);
  });

  it("denies an ADMIN moderator without support.manage", async () => {
    const response = await listConversations();

    expect(response.status).toBe(403);
    expect(mockDb.supportConversation.findMany).not.toHaveBeenCalled();
  });

  it("allows a moderator explicitly granted support.manage to read the queue", async () => {
    (mockDb.moderatorPermission.findMany as jest.Mock).mockResolvedValue([
      { permission: "support.manage" },
    ]);
    (mockDb.supportConversation.findMany as jest.Mock).mockResolvedValue([{
      id: "conversation-1",
      status: "OPEN",
      subject: null,
      createdAt: new Date("2026-07-15T10:00:00.000Z"),
      closedAt: null,
      user: { id: "client-1", name: "Клиент", email: "client@example.com", role: "CLIENT" },
      _count: { messages: 1 },
      messages: [{ role: "USER", content: "Нужна помощь", createdAt: new Date("2026-07-15T10:05:00.000Z") }],
    }]);

    const response = await listConversations();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.conversations[0]).toEqual(expect.objectContaining({
      id: "conversation-1",
      preview: "Нужна помощь",
      lastMessageRole: "USER",
    }));
  });

  it("persists and audits a moderator reply without Telegram routing metadata", async () => {
    (mockDb.moderatorPermission.findMany as jest.Mock).mockResolvedValue([
      { permission: "support.manage" },
    ]);
    (mockDb.supportConversation.findUnique as jest.Mock).mockResolvedValue({
      id: "conversation-1",
      userId: "client-1",
      status: "OPEN",
    });
    const createdAt = new Date("2026-07-15T10:06:00.000Z");
    const create = jest.fn().mockResolvedValue({
      id: "message-2",
      role: "STAFF",
      content: "Мы уже проверяем",
      createdAt,
    });
    const update = jest.fn().mockResolvedValue({});
    (mockDb.$transaction as jest.Mock).mockImplementation(async (callback) => callback({
      supportMessage: { create },
      supportConversation: { update },
    }));

    const response = await replyToConversation(
      request({ content: "Мы уже проверяем" }),
      { params: Promise.resolve({ id: "conversation-1" }) },
    );

    expect(response.status).toBe(200);
    expect(create).toHaveBeenCalledWith({
      data: { conversationId: "conversation-1", role: "STAFF", content: "Мы уже проверяем" },
      select: { id: true, role: true, content: true, createdAt: true },
    });
    expect(create.mock.calls[0][0].data).not.toHaveProperty("telegramMessageId");
    expect(mockLogAudit).toHaveBeenCalledWith(
      "moderator-1",
      "SUPPORT_REPLY",
      "client-1",
      expect.stringContaining('"conversationId":"conversation-1"'),
    );
  });
});
