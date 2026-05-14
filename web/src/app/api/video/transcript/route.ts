import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { logFraudEvent } from "@/lib/antifraud";
import { requestContextFromHeaders } from "@/lib/request-context";
import {
  buildSessionTranscript,
  generateSessionSummary,
  reviewSessionCompliance,
} from "@/lib/session-ai-pipeline";
import {
  detectPractitionerTextRisk,
  holdPractitionerPayoutsForBooking,
  PRACTITIONER_HIGH_RISK_SCORE,
} from "@/lib/practitioner-antifraud";

const segmentSchema = z.object({
  speakerRole: z.enum(["client", "practitioner", "unknown"]).optional(),
  speakerLabel: z.string().max(80).optional(),
  text: z.string().min(1).max(6000),
  startedAtMs: z.number().int().min(0).max(12 * 60 * 60 * 1000).optional(),
  endedAtMs: z.number().int().min(0).max(12 * 60 * 60 * 1000).optional(),
  isFinal: z.boolean().optional(),
});

const postSchema = z.object({
  videoSessionId: z.string().min(1),
  text: z.string().max(60_000).optional(),
  segments: z.array(segmentSchema).max(600).optional(),
  isFinal: z.boolean().optional(),
  sttProvider: z.string().max(80).optional(),
  sttSource: z.enum(["browser_speech_recognition", "uploaded_audio", "manual", "livekit", "unknown"]).optional(),
});

const putSchema = z.object({
  videoSessionId: z.string().min(1),
});

async function getScopedVideoSession(videoSessionId: string, userId: string) {
  return db.videoSession.findFirst({
    where: {
      id: videoSessionId,
      booking: {
        OR: [
          { clientId: userId },
          { practitioner: { userId } },
        ],
      },
    },
    include: {
      booking: {
        select: {
          id: true,
          clientId: true,
          practitionerId: true,
          practitioner: { select: { userId: true } },
        },
      },
    },
  });
}

function quickComplianceWarning(text: string) {
  const risk = detectPractitionerTextRisk(text);
  if (risk.riskFlags.includes("external_payment_signal")) {
    return "Похоже, в разговоре есть просьба об оплате или контакте вне платформы. Это нужно проверить.";
  }
  if (risk.riskScore >= PRACTITIONER_HIGH_RISK_SCORE) {
    return "Обнаружен потенциальный комплаенс-сигнал. Убедитесь, что консультация остается этичной и безопасной.";
  }
  return null;
}

/** POST /api/video/transcript — STT transcript ingest + compliance evidence chain. */
export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Не авторизован", requestId: context.requestId }, { status: 401 });

  const parsed = postSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Данные неполны", requestId: context.requestId }, { status: 400 });

  const videoSession = await getScopedVideoSession(parsed.data.videoSessionId, userId);
  if (!videoSession) return NextResponse.json({ error: "Сессия не найдена", requestId: context.requestId }, { status: 404 });

  const transcriptText = buildSessionTranscript({
    text: parsed.data.text,
    segments: parsed.data.segments,
  });
  if (transcriptText.length < 10) {
    return NextResponse.json({ error: "Транскрипт слишком короткий", requestId: context.requestId }, { status: 400 });
  }

  const quickWarning = quickComplianceWarning(transcriptText);
  if (!parsed.data.isFinal) {
    return NextResponse.json({ ok: true, violation: quickWarning, requestId: context.requestId });
  }

  const compliance = await reviewSessionCompliance({
    transcriptText,
    userId,
    requestId: context.requestId,
  });

  const transcriptMetadata: Prisma.InputJsonObject = {
    stt: {
      provider: parsed.data.sttProvider ?? "browser",
      source: parsed.data.sttSource ?? "unknown",
      diarization: parsed.data.segments?.some((segment) => segment.speakerRole || segment.speakerLabel) ? "speaker_labels" : "none",
      segmentCount: parsed.data.segments?.length ?? 0,
      finalizedAt: new Date().toISOString(),
    },
    capturedByUserId: userId,
    requestId: context.requestId,
  };

  await db.videoSession.update({
    where: { id: videoSession.id },
    data: {
      transcriptText,
      transcriptMetadata,
      complianceStatus: compliance.status,
      complianceRiskScore: compliance.riskScore,
      complianceEvidence: {
        status: compliance.status,
        riskScore: compliance.riskScore,
        riskFlags: compliance.riskFlags,
        severity: compliance.severity,
        summary: compliance.summary,
        evidenceQuotes: compliance.evidenceQuotes,
        moderatorRecommendation: compliance.moderatorRecommendation,
        metadata: compliance.metadata,
      },
      complianceReviewedAt: new Date(),
    },
  });

  if (compliance.status !== "clear") {
    await db.$transaction(async (tx) => {
      await tx.booking.update({
        where: { id: videoSession.bookingId },
        data: {
          riskScore: { increment: Math.max(60, compliance.riskScore) },
          riskFlags: { push: compliance.riskFlags.length > 0 ? compliance.riskFlags : ["session_compliance_signal"] },
        },
      });
      await tx.practitioner.update({
        where: { id: videoSession.booking.practitionerId },
        data: {
          riskScore: { increment: compliance.riskFlags.includes("external_payment_signal") ? 30 : 15 },
          riskFlags: { push: compliance.riskFlags.length > 0 ? compliance.riskFlags : ["session_compliance_signal"] },
        },
      });
      await logFraudEvent(tx, {
        subjectType: "booking",
        subjectId: videoSession.bookingId,
        actorUserId: userId,
        action: compliance.riskFlags.includes("external_payment_signal")
          ? "practitioner_external_payment_detected"
          : "practitioner_compliance_signal",
        status: "review",
        riskScore: Math.max(60, compliance.riskScore),
        riskFlags: compliance.riskFlags.length > 0 ? compliance.riskFlags : ["session_compliance_signal"],
        metadata: {
          practitionerId: videoSession.booking.practitionerId,
          videoSessionId: videoSession.id,
          severity: compliance.severity,
          summary: compliance.summary,
          evidenceQuotes: compliance.evidenceQuotes,
          moderatorRecommendation: compliance.moderatorRecommendation,
        },
      });
    });
    await holdPractitionerPayoutsForBooking({
      bookingId: videoSession.bookingId,
      actorUserId: userId,
      reason: compliance.riskFlags.includes("external_payment_signal") ? "external_payment_signal" : "session_compliance_signal",
      riskScore: Math.max(80, compliance.riskScore),
      riskFlags: compliance.riskFlags.length > 0 ? compliance.riskFlags : ["session_compliance_signal"],
    });
  }

  return NextResponse.json({
    ok: true,
    violation: quickWarning,
    compliance: {
      status: compliance.status,
      riskScore: compliance.riskScore,
      severity: compliance.severity,
      riskFlags: compliance.riskFlags,
      evidenceQuotes: compliance.evidenceQuotes,
    },
    requestId: context.requestId,
  });
}

/** PUT /api/video/transcript — Practitioner Pro summary package. */
export async function PUT(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Не авторизован", requestId: context.requestId }, { status: 401 });
  if (session.user?.role !== "PRACTITIONER") {
    return NextResponse.json({ error: "Только для практиков", requestId: context.requestId }, { status: 403 });
  }

  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Данные неполны", requestId: context.requestId }, { status: 400 });

  const videoSession = await db.videoSession.findFirst({
    where: {
      id: parsed.data.videoSessionId,
      booking: { practitioner: { userId } },
    },
  });
  if (!videoSession?.transcriptText) {
    return NextResponse.json({ error: "Транскрипт недоступен", requestId: context.requestId }, { status: 404 });
  }

  const result = await generateSessionSummary({
    transcriptText: videoSession.transcriptText,
    userId,
    requestId: context.requestId,
  });

  await db.videoSession.update({
    where: { id: videoSession.id },
    data: {
      summaryText: result.summaryText,
      practitionerNotesText: result.practitionerNotesText,
      clientFollowupDraft: result.clientFollowupDraft,
      summaryMetadata: result.metadata,
    },
  });

  return NextResponse.json({
    ok: true,
    summary: result.summaryText,
    practitionerNotes: result.practitionerNotesText,
    clientFollowupDraft: result.clientFollowupDraft,
    requestId: context.requestId,
  });
}
