import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { resetAuthRateLimitForTests } from "@/lib/auth-rate-limit";
import { classifyDialogueQuestion } from "@/lib/dialogue-router";
import { classifyDialogueSafety } from "@/lib/dialogue-safety";
import { generateDialogueClarifyingQuestions } from "@/lib/dialogue-clarifier";
import db from "@/lib/db";
import { createGuestSessionCookieValue, GUEST_SESSION_COOKIE } from "@/lib/guest-session";
import { GET as listDialogues, POST as createDialogue } from "@/app/api/dialogues/route";
import { DELETE as deleteDialogue, GET as getDialogue, POST as respondDialogue } from "@/app/api/dialogues/[id]/route";

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
      update: jest.fn(),
    },
  },
}));

jest.mock("@/lib/dialogue-router", () => ({
  __esModule: true,
  DIALOGUE_TOPICS: ["relationships", "career", "money", "family", "self", "anxiety", "other"],
  classifyDialogueQuestion: jest.fn(),
}));

jest.mock("@/lib/dialogue-safety", () => ({
  __esModule: true,
  classifyDialogueSafety: jest.fn(),
  shouldInterruptDialogue: (level: string) => level === "crisis" || level === "blocked",
}));

jest.mock("@/lib/dialogue-clarifier", () => ({
  __esModule: true,
  generateDialogueClarifyingQuestions: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db>;
const mockClassifyDialogueQuestion = classifyDialogueQuestion as jest.MockedFunction<typeof classifyDialogueQuestion>;
const mockClassifyDialogueSafety = classifyDialogueSafety as jest.MockedFunction<typeof classifyDialogueSafety>;
const mockGenerateDialogueClarifyingQuestions = generateDialogueClarifyingQuestions as jest.MockedFunction<typeof generateDialogueClarifyingQuestions>;

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
    mockClassifyDialogueSafety.mockResolvedValue({
      level: "normal",
      reason: "no_marker",
      confidence: 0.7,
      source: "ai",
      provider: "openrouter",
      model: "openrouter/free",
    });
    mockGenerateDialogueClarifyingQuestions.mockResolvedValue({
      questions: [
        "Что для вас сейчас самое важное прояснить?",
        "Какой исход будет для вас самым спокойным?",
        "Что вы уже пробовали в этой ситуации?",
      ],
      source: "ai",
      provider: "openrouter",
      model: "openrouter/free",
    });
  });

  it("creates a guest-owned dialogue and first clarification message", async () => {
    mockDb.dialogue.create.mockResolvedValue({
      id: "dlg_1",
      title: "Как выбрать направление?",
      status: "AWAITING_USER",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      createdAt: now,
      updatedAt: now,
      messages: [
        {
          id: "msg_1",
          role: "USER",
          content: "Как выбрать направление?",
          createdAt: now,
        },
        {
          id: "msg_2",
          role: "ASSISTANT",
          content: "1. Что для вас сейчас самое важное прояснить?",
          createdAt: now,
        },
      ],
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
    expect(body.dialogue.status).toBe("AWAITING_USER");
    expect(body.dialogue.difficulty).toBe("medium");
    expect(body.dialogue.clarifyingQuestions).toHaveLength(3);
    expect(mockDb.dialogue.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: null,
        guestSessionId: expect.stringMatching(/^gst_/),
        title: "Как выбрать направление?",
        status: "AWAITING_USER",
        topic: "career",
        difficulty: "medium",
        safetyLevel: "normal",
        messages: {
          create: [
            { role: "USER", content: "Как выбрать направление?" },
            expect.objectContaining({
              role: "ASSISTANT",
              metadata: expect.objectContaining({
                kind: "clarifying_questions",
                questions: expect.arrayContaining(["Что для вас сейчас самое важное прояснить?"]),
              }),
            }),
          ],
        },
        metadata: expect.objectContaining({
          routing: expect.objectContaining({
            topic: "career",
            difficulty: "medium",
            source: "ai",
          }),
          safety: expect.objectContaining({
            level: "normal",
            source: "ai",
          }),
          clarifyingQuestions: expect.objectContaining({
            questions: expect.arrayContaining(["Что для вас сейчас самое важное прояснить?"]),
            source: "ai",
          }),
        }),
      }),
    }));
    expect(body.dialogue.safety).toEqual({
      level: "normal",
      reason: "no_marker",
      interrupt: false,
    });
    expect(mockClassifyDialogueQuestion).toHaveBeenCalledWith({
      question: "Как выбрать направление?",
      userId: null,
      requestId: expect.any(String),
    });
    expect(mockClassifyDialogueSafety).toHaveBeenCalledWith({
      question: "Как выбрать направление?",
      userId: null,
      requestId: expect.any(String),
    });
    expect(mockGenerateDialogueClarifyingQuestions).toHaveBeenCalledWith({
      question: "Как выбрать направление?",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      userId: null,
      requestId: expect.any(String),
    });
  });

  it("marks crisis dialogues as safety interrupted at creation", async () => {
    mockClassifyDialogueSafety.mockResolvedValueOnce({
      level: "crisis",
      reason: "self_harm_or_suicide_marker",
      confidence: 0.9,
      source: "heuristic",
    });
    mockDb.dialogue.create.mockResolvedValue({
      id: "dlg_crisis",
      title: "Мне страшно",
      status: "SAFETY_INTERRUPTED",
      topic: "anxiety",
      difficulty: "high",
      safetyLevel: "crisis",
      createdAt: now,
      updatedAt: now,
      messages: [{
        id: "msg_crisis",
        role: "USER",
        content: "Мне страшно",
        createdAt: now,
      }],
    });

    const response = await createDialogue(request("https://app.eterapy.com/api/dialogues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question: "Мне страшно" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.dialogue.status).toBe("SAFETY_INTERRUPTED");
    expect(body.dialogue.safety.interrupt).toBe(true);
    expect(body.dialogue.clarifyingQuestions).toEqual([]);
    expect(mockGenerateDialogueClarifyingQuestions).not.toHaveBeenCalled();
    expect(mockDb.dialogue.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "SAFETY_INTERRUPTED",
        safetyLevel: "crisis",
      }),
    }));
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

  it("soft-deletes only the registered owner's dialogue", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "CLIENT" },
      expires: "2026-04-29T12:00:00.000Z",
    });
    mockDb.dialogue.findFirst.mockResolvedValue({ id: "dlg-owned" });
    mockDb.dialogue.update.mockResolvedValue({ id: "dlg-owned" });

    const response = await deleteDialogue(
      request("https://app.eterapy.com/api/dialogues/dlg-owned", { method: "DELETE" }),
      { params: Promise.resolve({ id: "dlg-owned" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(mockDb.dialogue.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "dlg-owned",
        userId: "user-1",
        deletedAt: null,
      },
      select: { id: true },
    }));
    expect(mockDb.dialogue.update).toHaveBeenCalledWith({
      where: { id: "dlg-owned" },
      data: {
        status: "DELETED",
        deletedAt: expect.any(Date),
      },
    });
  });

  it("does not delete another user's dialogue", async () => {
    mockAuth.mockResolvedValue({
      user: { id: "user-1", role: "CLIENT" },
      expires: "2026-04-29T12:00:00.000Z",
    });
    mockDb.dialogue.findFirst.mockResolvedValue(null);

    const response = await deleteDialogue(
      request("https://app.eterapy.com/api/dialogues/dlg-victim", { method: "DELETE" }),
      { params: Promise.resolve({ id: "dlg-victim" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.code).toBe("NOT_FOUND");
    expect(mockDb.dialogue.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "dlg-victim",
        userId: "user-1",
        deletedAt: null,
      },
      select: { id: true },
    }));
    expect(mockDb.dialogue.update).not.toHaveBeenCalled();
  });

  it("lets the owner answer clarifying questions and moves dialogue to processing", async () => {
    const cookieValue = createGuestSessionCookieValue("gst_11111111-1111-4111-8111-111111111111");
    mockDb.dialogue.findFirst.mockResolvedValue({ id: "dlg-1", status: "AWAITING_USER" });
    mockDb.dialogue.update.mockResolvedValue({
      id: "dlg-1",
      title: "Question",
      status: "PROCESSING",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: "msg-1", role: "USER", content: "Question", createdAt: now },
        { id: "msg-2", role: "ASSISTANT", content: "1. Что важно?", createdAt: now },
        { id: "msg-3", role: "USER", content: "Мне важно выбрать спокойный вариант", createdAt: now },
      ],
    });

    const response = await respondDialogue(
      request("https://app.eterapy.com/api/dialogues/dlg-1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(cookieValue)}`,
        },
        body: JSON.stringify({ message: "Мне важно выбрать спокойный вариант" }),
      }),
      { params: Promise.resolve({ id: "dlg-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.dialogue.status).toBe("PROCESSING");
    expect(body.clarifications.skipped).toBe(false);
    expect(mockDb.dialogue.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "dlg-1",
        guestSessionId: "gst_11111111-1111-4111-8111-111111111111",
        deletedAt: null,
      },
    }));
    expect(mockDb.dialogue.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "dlg-1" },
      data: expect.objectContaining({
        status: "PROCESSING",
        messages: {
          create: expect.objectContaining({
            role: "USER",
            content: "Мне важно выбрать спокойный вариант",
            metadata: expect.objectContaining({
              kind: "clarification_answer",
              skipped: false,
            }),
          }),
        },
      }),
    }));
  });

  it("lets the owner skip clarifying questions", async () => {
    const cookieValue = createGuestSessionCookieValue("gst_11111111-1111-4111-8111-111111111111");
    mockDb.dialogue.findFirst.mockResolvedValue({ id: "dlg-1", status: "AWAITING_USER" });
    mockDb.dialogue.update.mockResolvedValue({
      id: "dlg-1",
      title: "Question",
      status: "PROCESSING",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: "msg-1", role: "USER", content: "Question", createdAt: now },
        { id: "msg-2", role: "ASSISTANT", content: "1. Что важно?", createdAt: now },
        { id: "msg-3", role: "USER", content: "Пропустить уточнения", createdAt: now },
      ],
    });

    const response = await respondDialogue(
      request("https://app.eterapy.com/api/dialogues/dlg-1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(cookieValue)}`,
        },
        body: JSON.stringify({ action: "skip_clarifications" }),
      }),
      { params: Promise.resolve({ id: "dlg-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.clarifications.skipped).toBe(true);
    expect(mockDb.dialogue.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        messages: {
          create: expect.objectContaining({
            content: "Пропустить уточнения",
            metadata: expect.objectContaining({
              kind: "clarification_skip",
              skipped: true,
            }),
          }),
        },
      }),
    }));
  });

  it("rejects clarification responses when dialogue is not awaiting the user", async () => {
    const cookieValue = createGuestSessionCookieValue("gst_11111111-1111-4111-8111-111111111111");
    mockDb.dialogue.findFirst.mockResolvedValue({ id: "dlg-1", status: "PROCESSING" });

    const response = await respondDialogue(
      request("https://app.eterapy.com/api/dialogues/dlg-1", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(cookieValue)}`,
        },
        body: JSON.stringify({ action: "skip_clarifications" }),
      }),
      { params: Promise.resolve({ id: "dlg-1" }) },
    );

    expect(response.status).toBe(409);
    expect(mockDb.dialogue.update).not.toHaveBeenCalled();
  });
});
