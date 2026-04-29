import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { resetAuthRateLimitForTests } from "@/lib/auth-rate-limit";
import { classifyDialogueQuestion } from "@/lib/dialogue-router";
import db from "@/lib/db";
import { createGuestSessionCookieValue, GUEST_SESSION_COOKIE } from "@/lib/guest-session";
import { GET as listDialogues, POST as createDialogue } from "@/app/api/dialogues/route";
import { GET as getDialogue } from "@/app/api/dialogues/[id]/route";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    dialogue: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  },
}));

jest.mock("@/lib/dialogue-router", () => ({
  __esModule: true,
  DIALOGUE_TOPICS: ["relationships", "career", "money", "family", "self", "anxiety", "other"],
  classifyDialogueQuestion: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db>;
const mockClassifyDialogueQuestion = classifyDialogueQuestion as jest.MockedFunction<typeof classifyDialogueQuestion>;

function request(url: string, init: RequestInit = {}) {
  const parsedUrl = new URL(url);
  return {
    url,
    method: init.method ?? "GET",
    nextUrl: parsedUrl,
    headers: new Headers(init.headers),
    cookies: {
      get(name: string) {
        const cookieHeader = new Headers(init.headers).get("cookie");
        if (!cookieHeader) return undefined;
        const value = cookieHeader
          .split(";")
          .map((part) => part.trim())
          .find((part) => part.startsWith(`${name}=`))
          ?.slice(name.length + 1);
        return value ? { name, value: decodeURIComponent(value) } : undefined;
      },
    },
    json: async () => init.body ? JSON.parse(String(init.body)) : {},
  } as unknown as NextRequest;
}

const now = new Date("2026-04-29T12:00:00.000Z");

describe("v5 dialogue API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuthRateLimitForTests();
    mockAuth.mockResolvedValue(null);
    mockClassifyDialogueQuestion.mockResolvedValue({
      topic: "career",
      difficulty: "medium",
      confidence: 0.82,
      source: "ai",
      provider: "openrouter",
      model: "openrouter/free",
    });
  });

  it("creates a guest-owned dialogue and first user message", async () => {
    mockDb.dialogue.create.mockResolvedValue({
      id: "dlg_1",
      title: "Как выбрать направление?",
      status: "OPEN",
      topic: "career",
      createdAt: now,
      updatedAt: now,
      messages: [{
        id: "msg_1",
        role: "USER",
        content: "Как выбрать направление?",
        createdAt: now,
      }],
    });

    const response = await createDialogue(request("https://app.eterapy.com/api/dialogues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "Как выбрать направление?", topic: "career" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(response.headers.get("set-cookie")).toContain(GUEST_SESSION_COOKIE);
    expect(response.headers.get("X-Guest-Session")).toBe("created");
    expect(body.dialogue.id).toBe("dlg_1");
    expect(mockDb.dialogue.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: null,
        guestSessionId: expect.stringMatching(/^gst_/),
        title: "Как выбрать направление?",
        topic: "career",
        difficulty: "medium",
        messages: { create: { role: "USER", content: "Как выбрать направление?" } },
        metadata: expect.objectContaining({
          routing: expect.objectContaining({
            topic: "career",
            difficulty: "medium",
            source: "ai",
          }),
        }),
      }),
    }));
    expect(mockClassifyDialogueQuestion).toHaveBeenCalledWith({
      question: "Как выбрать направление?",
      userId: null,
      requestId: expect.any(String),
    });
  });

  it("lists only current user's dialogues for registered users", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "CLIENT" },
      expires: "2026-04-29T12:00:00.000Z",
    });
    mockDb.dialogue.findMany.mockResolvedValue([{
      id: "dlg_1",
      title: "Question",
      status: "OPEN",
      topic: null,
      difficulty: null,
      safetyLevel: null,
      createdAt: now,
      updatedAt: now,
      _count: { messages: 1 },
    }]);

    const response = await listDialogues(request("https://app.eterapy.com/api/dialogues?limit=200"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dialogues).toHaveLength(1);
    expect(mockDb.dialogue.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: "user-1", deletedAt: null },
      take: 51,
    }));
  });

  it("scopes guest dialogue reads by signed guest cookie", async () => {
    const cookieValue = createGuestSessionCookieValue("gst_11111111-1111-4111-8111-111111111111");
    mockDb.dialogue.findFirst.mockResolvedValue(null);

    const response = await getDialogue(
      request("https://app.eterapy.com/api/dialogues/dlg-victim", {
        headers: { cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(cookieValue)}` },
      }),
      { params: Promise.resolve({ id: "dlg-victim" }) },
    );

    expect(response.status).toBe(404);
    expect(mockDb.dialogue.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "dlg-victim",
        guestSessionId: "gst_11111111-1111-4111-8111-111111111111",
        deletedAt: null,
      },
    }));
  });

  it("rejects anonymous reads without a valid guest cookie", async () => {
    const response = await getDialogue(
      request("https://app.eterapy.com/api/dialogues/dlg-1"),
      { params: Promise.resolve({ id: "dlg-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.code).toBe("UNAUTHORIZED");
    expect(mockDb.dialogue.findFirst).not.toHaveBeenCalled();
  });
});
