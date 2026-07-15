import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import { storeFile } from "@/lib/file-storage";
import { GET, POST } from "@/app/api/video/chat/route";

jest.mock("@/lib/auth", () => ({ auth: jest.fn() }));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    videoSession: { findFirst: jest.fn() },
    chatMessage: { findMany: jest.fn(), create: jest.fn() },
  },
}));

jest.mock("@/lib/file-storage", () => ({ storeFile: jest.fn() }));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockStoreFile = storeFile as jest.MockedFunction<typeof storeFile>;
const mockDb = db as unknown as {
  videoSession: { findFirst: jest.Mock };
  chatMessage: { findMany: jest.Mock; create: jest.Mock };
};

function getRequest() {
  const url = "https://app.eterapy.com/api/video/chat?videoSessionId=vs-private";
  const request = new Request(url) as NextRequest;
  Object.defineProperty(request, "nextUrl", { value: new URL(url) });
  return request;
}

function postRequest() {
  return new Request("https://app.eterapy.com/api/video/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ videoSessionId: "vs-private", text: "Сообщение" }),
  }) as NextRequest;
}

describe("B521 video chat participant RBAC", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "unrelated-user", role: "CLIENT" },
      expires: "2026-07-16T00:00:00.000Z",
    });
  });

  it("denies an unrelated authenticated user before reading messages", async () => {
    mockDb.videoSession.findFirst.mockResolvedValueOnce(null);

    const response = await GET(getRequest());

    expect(response.status).toBe(404);
    expect(mockDb.chatMessage.findMany).not.toHaveBeenCalled();
    expect(mockDb.videoSession.findFirst).toHaveBeenCalledWith({
      where: {
        id: "vs-private",
        booking: {
          OR: [
            { clientId: "unrelated-user" },
            { practitioner: { userId: "unrelated-user" } },
          ],
        },
      },
      select: { id: true },
    });
  });

  it("denies an unrelated authenticated user before writing a message", async () => {
    mockDb.videoSession.findFirst.mockResolvedValueOnce(null);

    const response = await POST(postRequest());

    expect(response.status).toBe(404);
    expect(mockDb.chatMessage.create).not.toHaveBeenCalled();
    expect(mockStoreFile).not.toHaveBeenCalled();
  });

  it("preserves participant reads", async () => {
    mockDb.videoSession.findFirst.mockResolvedValueOnce({ id: "vs-private" });
    mockDb.chatMessage.findMany.mockResolvedValueOnce([]);

    const response = await GET(getRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ messages: [] });
  });

  it("preserves participant writes", async () => {
    mockDb.videoSession.findFirst.mockResolvedValueOnce({ id: "vs-private" });
    mockDb.chatMessage.create.mockResolvedValueOnce({ id: "message-1" });

    const response = await POST(postRequest());

    expect(response.status).toBe(200);
    expect(mockDb.chatMessage.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        videoSessionId: "vs-private",
        senderId: "unrelated-user",
        text: "Сообщение",
      }),
    }));
  });
});
