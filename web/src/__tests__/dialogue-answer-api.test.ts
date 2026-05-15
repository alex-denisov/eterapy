import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { resetAuthRateLimitForTests } from "@/lib/auth-rate-limit";
import { generateDialoguePrimaryAnswer } from "@/lib/dialogue-primary-answer";
import db from "@/lib/db";
import { createGuestSessionCookieValue, GUEST_SESSION_COOKIE } from "@/lib/guest-session";
import { POST as generateAnswer } from "@/app/api/dialogues/[id]/answer/route";

jest.mock("@/lib/auth", () => ({
  __esModule: true,
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    dialogue: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    analyticsEvent: {
      create: jest.fn().mockResolvedValue({}),
    },
  },
}));

jest.mock("@/lib/dialogue-primary-answer", () => ({
  __esModule: true,
  generateDialoguePrimaryAnswer: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockDb = db as jest.Mocked<typeof db>;
const mockGenerateDialoguePrimaryAnswer = generateDialoguePrimaryAnswer as jest.MockedFunction<typeof generateDialoguePrimaryAnswer>;
const now = new Date("2026-04-29T12:00:00.000Z");

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

describe("dialogue primary answer API", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuthRateLimitForTests();
    mockAuth.mockResolvedValue(null as never);
    mockGenerateDialoguePrimaryAnswer.mockResolvedValue({
      text: "Короткий ответ\nВыберите более устойчивый вариант.",
      source: "ai",
      provider: "openrouter",
      model: "openrouter/free",
      tokensIn: 10,
      tokensOut: 20,
      latencyMs: 300,
    });
  });

  it("generates an owner-scoped primary answer for a processing guest dialogue", async () => {
    const cookieValue = createGuestSessionCookieValue("gst_11111111-1111-4111-8111-111111111111");
    (mockDb.dialogue.findFirst as jest.Mock).mockResolvedValue({
      id: "dlg-1",
      title: "Question",
      status: "PROCESSING",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: "msg-1", role: "USER", content: "Как выбрать работу?", metadata: null, createdAt: now },
        { id: "msg-2", role: "USER", content: "Хочу устойчивости", metadata: { kind: "clarification_answer" }, createdAt: now },
      ],
    });
    (mockDb.dialogue.update as jest.Mock).mockResolvedValue({
      id: "dlg-1",
      title: "Question",
      status: "ANSWERED",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: "msg-1", role: "USER", content: "Как выбрать работу?", metadata: null, createdAt: now },
        { id: "msg-3", role: "ASSISTANT", content: "Короткий ответ\nВыберите более устойчивый вариант.", metadata: { kind: "primary_answer", source: "ai" }, createdAt: now },
      ],
    });

    const response = await generateAnswer(
      request("https://app.eterapy.com/api/dialogues/dlg-1/answer", {
        method: "POST",
        headers: { cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(cookieValue)}` },
      }),
      { params: Promise.resolve({ id: "dlg-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.generated).toBe(true);
    expect(body.dialogue.status).toBe("ANSWERED");
    expect(body.dialogue.primaryAnswer.content).toContain("Короткий ответ");
    expect(mockDb.dialogue.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: "dlg-1",
        guestSessionId: "gst_11111111-1111-4111-8111-111111111111",
        deletedAt: null,
      },
    }));
    expect(mockGenerateDialoguePrimaryAnswer).toHaveBeenCalledWith(expect.objectContaining({
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      userId: null,
    }));
    expect(mockDb.dialogue.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "dlg-1" },
      data: expect.objectContaining({
        status: "ANSWERED",
        messages: {
          create: expect.objectContaining({
            role: "ASSISTANT",
            content: expect.stringContaining("Короткий ответ"),
            metadata: expect.objectContaining({
              kind: "primary_answer",
              source: "ai",
              provider: "openrouter",
            }),
          }),
        },
      }),
    }));
  });

  it("returns an existing answer idempotently", async () => {
    const cookieValue = createGuestSessionCookieValue("gst_11111111-1111-4111-8111-111111111111");
    (mockDb.dialogue.findFirst as jest.Mock).mockResolvedValue({
      id: "dlg-1",
      title: "Question",
      status: "ANSWERED",
      topic: "career",
      difficulty: "medium",
      safetyLevel: "normal",
      createdAt: now,
      updatedAt: now,
      messages: [
        { id: "msg-1", role: "USER", content: "Как выбрать работу?", metadata: null, createdAt: now },
        { id: "msg-3", role: "ASSISTANT", content: "Короткий ответ", metadata: { kind: "primary_answer", source: "ai" }, createdAt: now },
      ],
    });

    const response = await generateAnswer(
      request("https://app.eterapy.com/api/dialogues/dlg-1/answer", {
        method: "POST",
        headers: { cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(cookieValue)}` },
      }),
      { params: Promise.resolve({ id: "dlg-1" }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.generated).toBe(false);
    expect(mockGenerateDialoguePrimaryAnswer).not.toHaveBeenCalled();
    expect(mockDb.dialogue.update).not.toHaveBeenCalled();
  });

  it("blocks safety-interrupted dialogues", async () => {
    const cookieValue = createGuestSessionCookieValue("gst_11111111-1111-4111-8111-111111111111");
    (mockDb.dialogue.findFirst as jest.Mock).mockResolvedValue({
      id: "dlg-1",
      title: "Question",
      status: "SAFETY_INTERRUPTED",
      topic: "anxiety",
      difficulty: "high",
      safetyLevel: "crisis",
      createdAt: now,
      updatedAt: now,
      messages: [],
    });

    const response = await generateAnswer(
      request("https://app.eterapy.com/api/dialogues/dlg-1/answer", {
        method: "POST",
        headers: { cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(cookieValue)}` },
      }),
      { params: Promise.resolve({ id: "dlg-1" }) },
    );

    expect(response.status).toBe(409);
    expect(mockDb.dialogue.update).not.toHaveBeenCalled();
  });
});
