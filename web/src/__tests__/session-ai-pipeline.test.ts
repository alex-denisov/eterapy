import fs from "node:fs";
import path from "node:path";
import {
  buildSessionTranscript,
  reviewSessionCompliance,
} from "@/lib/session-ai-pipeline";

jest.mock("@/lib/ai", () => ({
  aiComplete: jest.fn(),
}));

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B212 session STT, summary, and compliance pipeline", () => {
  it("builds diarized transcripts from browser STT segments", () => {
    const transcript = buildSessionTranscript({
      segments: [
        { speakerRole: "client", text: "Мне тревожно перед решением", startedAtMs: 1200 },
        { speakerRole: "practitioner", text: "Давайте аккуратно разберем варианты", startedAtMs: 5200 },
      ],
    });

    expect(transcript).toContain("[1s] Клиент: Мне тревожно перед решением");
    expect(transcript).toContain("[5s] Практик: Давайте аккуратно разберем варианты");
  });

  it("creates bounded moderator review evidence without automatic sanctions", async () => {
    const review = await reviewSessionCompliance({
      transcriptText: "Практик: Гарантирую 100% результат, переведите деньги вне платформы.",
      userId: "user-1",
      requestId: "req-1",
    });

    expect(review.status).toBe("high_risk");
    expect(review.riskScore).toBeLessThanOrEqual(100);
    expect(review.riskFlags).toEqual(expect.arrayContaining(["guaranteed_result", "external_payment_signal"]));
    expect(review.evidenceQuotes.length).toBeGreaterThan(0);
    expect(review.moderatorRecommendation).toContain("не применять санкции автоматически");
  });

  it("hardens transcript and video-session routes by booking participant scope", () => {
    const transcriptRoute = source("src/app/api/video/transcript/route.ts");
    const sessionRoute = source("src/app/api/video/session/route.ts");

    expect(transcriptRoute).toContain("getScopedVideoSession");
    expect(transcriptRoute).toContain("{ clientId: userId }");
    expect(transcriptRoute).toContain("{ practitioner: { userId } }");
    expect(sessionRoute).toContain("scopedBookingWhere");
    expect(sessionRoute).toContain("findFirst");
    expect(sessionRoute).toContain("Сессия не найдена");
  });

  it("persists STT metadata, compliance evidence, payout holds, and summary package fields", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260514014000_add_session_ai_pipeline_fields/migration.sql");
    const transcriptRoute = source("src/app/api/video/transcript/route.ts");
    const controls = source("src/components/video/video-controls.tsx");
    const aiPanel = source("src/components/video/session-ai-panel.tsx");
    const room = source("src/components/video/video-room.tsx");
    const complaintsPage = source("src/app/admin/product/quality/page.tsx");
    const complaintsManager = source("src/app/admin/complaints/complaints-manager.tsx");

    expect(schema).toContain("transcriptMetadata");
    expect(schema).toContain("summaryMetadata");
    expect(schema).toContain("complianceEvidence");
    expect(schema).toContain("clientFollowupDraft");
    expect(migration).toContain("client_followup_draft");
    expect(migration).toContain("compliance_evidence");
    expect(transcriptRoute).toContain("holdPractitionerPayoutsForBooking");
    expect(transcriptRoute).toContain("practitioner_external_payment_detected");
    expect(transcriptRoute).toContain("clientFollowupDraft: result.clientFollowupDraft");
    expect(controls).toContain("AI-конспект");
    expect(aiPanel).toContain("Включить для этой сессии");
    expect(aiPanel).not.toContain("Согласен на аудиозапись");
    expect(aiPanel).not.toContain("Расшифровываем");
    expect(aiPanel).not.toContain("toast.");
    expect(room).toContain("webkitSpeechRecognition");
    expect(room).toContain('sttSource: "browser_speech_recognition"');
    expect(room).toContain("await flushTranscript(true)");
    expect(complaintsPage).toContain("complianceEvidence");
    expect(complaintsManager).toContain("STT-транскрипт");
    expect(complaintsManager).toContain("Рекомендация:");
  });
});
