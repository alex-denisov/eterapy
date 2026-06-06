import type { NextRequest } from "next/server";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import { practitionerHasFeature } from "@/lib/practitioner-entitlements";
import {
  buildSessionTranscript,
  generateSessionSummary,
  reviewSessionCompliance,
} from "@/lib/session-ai-pipeline";
import { POST, PUT } from "@/app/api/video/transcript/route";

jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    videoSession: {
      findFirst: jest.fn(),
      update: jest.fn(),
    },
    booking: {
      update: jest.fn(),
    },
    practitioner: {
      update: jest.fn(),
    },
    $transaction: jest.fn(),
  },
}));

jest.mock("@/lib/practitioner-entitlements", () => ({
  practitionerHasFeature: jest.fn(),
}));

jest.mock("@/lib/session-ai-pipeline", () => ({
  buildSessionTranscript: jest.fn(),
  generateSessionSummary: jest.fn(),
  reviewSessionCompliance: jest.fn(),
}));

jest.mock("@/lib/practitioner-antifraud", () => ({
  detectPractitionerTextRisk: jest.fn(() => ({ riskScore: 0, riskFlags: [] })),
  holdPractitionerPayoutsForBooking: jest.fn(),
  PRACTITIONER_HIGH_RISK_SCORE: 80,
}));

jest.mock("@/lib/antifraud", () => ({
  logFraudEvent: jest.fn(),
}));

const mockAuth = auth as jest.MockedFunction<typeof auth>;
const mockHasFeature = practitionerHasFeature as jest.MockedFunction<typeof practitionerHasFeature>;
const mockBuildTranscript = buildSessionTranscript as jest.MockedFunction<typeof buildSessionTranscript>;
const mockReviewCompliance = reviewSessionCompliance as jest.MockedFunction<typeof reviewSessionCompliance>;
const mockGenerateSummary = generateSessionSummary as jest.MockedFunction<typeof generateSessionSummary>;
const mockDb = db as unknown as {
  videoSession: {
    findFirst: jest.Mock;
    update: jest.Mock;
  };
  $transaction: jest.Mock;
};

function request(method: "POST" | "PUT", body: Record<string, unknown>) {
  return new Request("https://app.eterapy.com/api/video/transcript", {
    method,
    headers: { "Content-Type": "application/json", "x-request-id": "z13-request" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

function videoSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "vs-1",
    bookingId: "booking-1",
    transcriptText: null,
    summaryText: null,
    booking: {
      id: "booking-1",
      clientId: "client-user",
      practitionerId: "pr-1",
      practitioner: { userId: "practitioner-user" },
    },
    ...overrides,
  };
}

describe("Z13 video transcript route gates", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAuth.mockResolvedValue({
      user: { id: "practitioner-user", role: "PRACTITIONER" },
      expires: "2026-07-06T00:00:00.000Z",
    });
    mockBuildTranscript.mockReturnValue("Практик: подробный финальный транскрипт сессии");
    mockReviewCompliance.mockResolvedValue({
      status: "clear",
      riskScore: 0,
      riskFlags: [],
      severity: "low",
      summary: "Без сигналов",
      evidenceQuotes: [],
      moderatorRecommendation: "Ручное действие не требуется.",
      metadata: { source: "test" },
    });
    mockGenerateSummary.mockResolvedValue({
      summaryText: "Итог сессии",
      practitionerNotesText: "Заметки практика",
      clientFollowupDraft: "Черновик клиенту",
      metadata: { source: "test" },
    });
    mockDb.videoSession.findFirst.mockResolvedValue(videoSession());
    mockDb.videoSession.update.mockResolvedValue({});
    mockDb.$transaction.mockImplementation(async (cb: (tx: unknown) => unknown) => cb(mockDb));
  });

  it("keeps compliance evidence but refuses final transcript storage for Free practitioners", async () => {
    mockHasFeature.mockResolvedValue(false);

    const response = await POST(request("POST", {
      videoSessionId: "vs-1",
      text: "final transcript",
      isFinal: true,
      sttSource: "browser_speech_recognition",
    }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("Practitioner Pro");
    expect(mockReviewCompliance).toHaveBeenCalled();
    expect(mockGenerateSummary).not.toHaveBeenCalled();
    expect(mockDb.videoSession.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        complianceStatus: "clear",
        complianceRiskScore: 0,
      }),
    }));
    expect(mockDb.videoSession.update.mock.calls[0][0].data).not.toHaveProperty("transcriptText");
    expect(mockDb.videoSession.update.mock.calls[0][0].data).not.toHaveProperty("transcriptMetadata");
  });

  it("stores final transcript and auto-generates summary for active Practitioner Pro", async () => {
    mockHasFeature.mockResolvedValue(true);

    const response = await POST(request("POST", {
      videoSessionId: "vs-1",
      text: "final transcript",
      isFinal: true,
      sttSource: "browser_speech_recognition",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.summary).toBe("Итог сессии");
    expect(mockHasFeature).toHaveBeenCalledWith("practitioner-user", "browser_stt");
    expect(mockHasFeature).toHaveBeenCalledWith("practitioner-user", "session_summary");
    expect(mockDb.videoSession.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        transcriptText: "Практик: подробный финальный транскрипт сессии",
        summaryText: "Итог сессии",
        practitionerNotesText: "Заметки практика",
        clientFollowupDraft: "Черновик клиенту",
      }),
    }));
  });

  it("gates manual summary before loading transcript content", async () => {
    mockHasFeature.mockResolvedValue(false);

    const response = await PUT(request("PUT", { videoSessionId: "vs-1" }));
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.error).toContain("Practitioner Pro");
    expect(mockDb.videoSession.findFirst).not.toHaveBeenCalled();
    expect(mockGenerateSummary).not.toHaveBeenCalled();
  });
});
