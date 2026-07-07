import { Prisma, type Job } from "@prisma/client";
import db from "@/lib/db";
import { logFraudEvent } from "@/lib/antifraud";
import { enqueueJob, type JobResult } from "@/lib/job-queue";
import {
  getPractitionerSessionRetentionDays,
  practitionerHasFeature,
} from "@/lib/practitioner-entitlements";
import {
  generateSessionSummary,
  reviewSessionCompliance,
} from "@/lib/session-ai-pipeline";
import {
  holdPractitionerPayoutsForBooking,
  PRACTITIONER_HIGH_RISK_SCORE,
} from "@/lib/practitioner-antifraud";
import { transcribeSessionAudio } from "@/lib/session-stt";

export const SERVER_STT_JOB_TYPE = "stt.transcribe";

const COMPLIANCE_RETENTION_DAYS = 365;
const SERVER_STT_JOB_BUFFER_MS = 2 * 60 * 1000;

type ActorRole = "CLIENT" | "PRACTITIONER" | "ADMIN" | "SUPERADMIN" | string | undefined;

export class ServerSttError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "ServerSttError";
  }
}

function addDays(now: Date, days: number) {
  return new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
}

function isAdminRole(role: ActorRole) {
  return role === "ADMIN" || role === "SUPERADMIN";
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringPayload(payload: Record<string, unknown>, key: string) {
  const value = payload[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function allowedServerSttAudioUrl(audioUrl: string) {
  if (audioUrl.startsWith("/uploads/recordings/")) return true;
  const publicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!publicAppUrl) return false;
  try {
    const audio = new URL(audioUrl);
    const app = new URL(publicAppUrl);
    return audio.origin === app.origin && audio.pathname.startsWith("/uploads/recordings/");
  } catch {
    return false;
  }
}

function scheduledRunAfter(slotEndAt?: Date | null, now = new Date()) {
  if (!slotEndAt || slotEndAt <= now) return undefined;
  return new Date(slotEndAt.getTime() + SERVER_STT_JOB_BUFFER_MS);
}

function audioExpiresAt(recordingExpiresAt: Date, slotEndAt?: Date | null) {
  if (!slotEndAt) return recordingExpiresAt;
  const afterSession = new Date(slotEndAt.getTime() + 60 * 60 * 1000);
  return afterSession > recordingExpiresAt ? afterSession : recordingExpiresAt;
}

export async function resolveSessionAiRetentionDates(input: {
  practitionerUserId: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const retentionDays = await getPractitionerSessionRetentionDays(input.practitionerUserId, db, now);
  return {
    transcriptExpiresAt: retentionDays ? addDays(now, retentionDays) : null,
    summaryExpiresAt: retentionDays ? addDays(now, retentionDays) : null,
    complianceEvidenceExpiresAt: addDays(now, COMPLIANCE_RETENTION_DAYS),
  };
}

export async function recordServerSttConsent(input: {
  bookingId: string;
  actorUserId: string;
  actorRole?: ActorRole;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    include: {
      practitioner: { select: { userId: true } },
      videoSession: true,
    },
  });
  if (!booking?.videoSession) throw new ServerSttError("Сессия не найдена", 404);

  const isClient = booking.clientId === input.actorUserId;
  const isPractitioner = booking.practitioner.userId === input.actorUserId;
  if (!isClient && !isPractitioner && !isAdminRole(input.actorRole)) {
    throw new ServerSttError("Нет доступа к этой сессии", 403);
  }

  const data = isClient
    ? { recordingConsentClientAt: booking.videoSession.recordingConsentClientAt ?? now }
    : { recordingConsentPractitionerAt: booking.videoSession.recordingConsentPractitionerAt ?? now };

  const updated = await db.videoSession.update({
    where: { id: booking.videoSession.id },
    data,
  });
  return {
    ok: true,
    videoSessionId: updated.id,
    recordingConsentClientAt: updated.recordingConsentClientAt,
    recordingConsentPractitionerAt: updated.recordingConsentPractitionerAt,
  };
}

export async function startServerSttForBooking(input: {
  bookingId: string;
  actorUserId: string;
  actorRole?: ActorRole;
  requestId?: string;
}) {
  const booking = await db.booking.findUnique({
    where: { id: input.bookingId },
    include: {
      practitioner: { select: { userId: true } },
      slot: { select: { endAt: true } },
      videoSession: true,
    },
  });
  if (!booking) throw new ServerSttError("Бронирование не найдено", 404);
  if (!booking.videoSession) throw new ServerSttError("Нет активной видеосессии", 404);

  const isPractitioner = booking.practitioner.userId === input.actorUserId;
  if (!isPractitioner && !isAdminRole(input.actorRole)) {
    throw new ServerSttError("Только практик может запустить серверную расшифровку", 403);
  }

  const allowed = await practitionerHasFeature(booking.practitioner.userId, "server_stt");
  if (!allowed) throw new ServerSttError("Серверная расшифровка доступна в Practitioner Pro+", 403);

  if (!booking.videoSession.recordingConsentClientAt || !booking.videoSession.recordingConsentPractitionerAt) {
    throw new ServerSttError("Для серверной расшифровки нужно согласие клиента и практика на запись", 409);
  }

  if (
    ["queued", "processing"].includes(booking.videoSession.serverSttStatus)
    && booking.videoSession.serverSttJobId
  ) {
    return {
      ok: true,
      status: booking.videoSession.serverSttStatus,
      jobId: booking.videoSession.serverSttJobId,
      videoSessionId: booking.videoSession.id,
    };
  }
  if (booking.videoSession.serverSttStatus === "completed") {
    return {
      ok: true,
      status: "completed",
      jobId: booking.videoSession.serverSttJobId,
      videoSessionId: booking.videoSession.id,
    };
  }

  const { startRoomAudioEgress } = await import("@/lib/livekit-egress");
  const recording = await startRoomAudioEgress(booking.videoSession.roomName, booking.id);
  if (!recording) throw new ServerSttError("Не удалось запустить аудио-запись. Egress сервер недоступен.", 503);
  const now = new Date();
  const runAfter = scheduledRunAfter(booking.slot?.endAt, now);
  const expiresAt = audioExpiresAt(recording.expiresAt, booking.slot?.endAt);

  const job = await enqueueJob({
    type: SERVER_STT_JOB_TYPE,
    maxAttempts: 3,
    idempotencyKey: `stt:${booking.videoSession.id}`,
    requestId: input.requestId,
    runAfter,
    payload: {
      videoSessionId: booking.videoSession.id,
      bookingId: booking.id,
      audioUrl: recording.url,
      egressId: recording.egressId,
      requestedByUserId: input.actorUserId,
    },
  });

  await db.videoSession.update({
    where: { id: booking.videoSession.id },
    data: {
      serverSttStatus: "queued",
      serverSttJobId: job.id,
      serverSttEgressId: recording.egressId,
      serverSttAudioUrl: recording.url,
      serverSttAudioExpiresAt: expiresAt,
    },
  });

  return {
    ok: true,
    status: "queued",
    jobId: job.id,
    videoSessionId: booking.videoSession.id,
    egressId: recording.egressId,
    audioExpiresAt: expiresAt,
  };
}

async function applyComplianceRisk(input: {
  videoSessionId: string;
  bookingId: string;
  practitionerId: string;
  actorUserId: string;
  compliance: Awaited<ReturnType<typeof reviewSessionCompliance>>;
}) {
  if (input.compliance.status === "clear") return;

  await db.$transaction(async (tx) => {
    await tx.booking.update({
      where: { id: input.bookingId },
      data: {
        riskScore: { increment: Math.max(60, input.compliance.riskScore) },
        riskFlags: {
          push: input.compliance.riskFlags.length > 0
            ? input.compliance.riskFlags
            : ["session_compliance_signal"],
        },
      },
    });
    await tx.practitioner.update({
      where: { id: input.practitionerId },
      data: {
        riskScore: { increment: input.compliance.riskFlags.includes("external_payment_signal") ? 30 : 15 },
        riskFlags: {
          push: input.compliance.riskFlags.length > 0
            ? input.compliance.riskFlags
            : ["session_compliance_signal"],
        },
      },
    });
    await logFraudEvent(tx, {
      subjectType: "booking",
      subjectId: input.bookingId,
      actorUserId: input.actorUserId,
      action: input.compliance.riskFlags.includes("external_payment_signal")
        ? "practitioner_external_payment_detected"
        : "practitioner_compliance_signal",
      status: "review",
      riskScore: Math.max(60, input.compliance.riskScore),
      riskFlags: input.compliance.riskFlags.length > 0 ? input.compliance.riskFlags : ["session_compliance_signal"],
      metadata: {
        practitionerId: input.practitionerId,
        videoSessionId: input.videoSessionId,
        severity: input.compliance.severity,
        summary: input.compliance.summary,
        evidenceQuotes: input.compliance.evidenceQuotes,
        moderatorRecommendation: input.compliance.moderatorRecommendation,
        source: "server_stt",
      },
    });
  });
  await holdPractitionerPayoutsForBooking({
    bookingId: input.bookingId,
    actorUserId: input.actorUserId,
    reason: input.compliance.riskFlags.includes("external_payment_signal") ? "external_payment_signal" : "session_compliance_signal",
    riskScore: Math.max(PRACTITIONER_HIGH_RISK_SCORE, input.compliance.riskScore),
    riskFlags: input.compliance.riskFlags.length > 0 ? input.compliance.riskFlags : ["session_compliance_signal"],
  });
}

export async function handleServerSttJob(job: Job, options: { now?: Date } = {}): Promise<JobResult> {
  const payload = isObject(job.payload) ? job.payload : {};
  const videoSessionId = stringPayload(payload, "videoSessionId");
  const audioUrl = stringPayload(payload, "audioUrl");
  const requestedByUserId = stringPayload(payload, "requestedByUserId");
  const egressId = stringPayload(payload, "egressId");
  if (!videoSessionId || !audioUrl || !requestedByUserId) throw new Error("Invalid server STT job payload");
  if (!allowedServerSttAudioUrl(audioUrl)) throw new Error("Server STT audio URL is outside the recording storage");

  const now = options.now ?? new Date();
  const videoSession = await db.videoSession.findUnique({
    where: { id: videoSessionId },
    include: {
      booking: {
        select: {
          id: true,
          practitionerId: true,
          practitioner: { select: { userId: true } },
        },
      },
    },
  });
  if (!videoSession) throw new Error("Video session not found for server STT job");
  if (!videoSession.recordingConsentClientAt || !videoSession.recordingConsentPractitionerAt) {
    throw new Error("Server STT job cannot run without recording consent");
  }

  const practitionerUserId = videoSession.booking.practitioner.userId;
  const allowed = await practitionerHasFeature(practitionerUserId, "server_stt", db, now);
  if (!allowed) throw new Error("Practitioner no longer has server STT entitlement");

  if (videoSession.transcriptText && videoSession.serverSttStatus === "completed") {
    const { deleteLocalRecording } = await import("@/lib/livekit-egress");
    const audioDeleted = await deleteLocalRecording(audioUrl);
    return { ok: true, videoSessionId, transcriptStored: true, audioDeleted, idempotent: true };
  }

  await db.videoSession.update({
    where: { id: videoSession.id },
    data: { serverSttStatus: "processing" },
  });

  const stt = await transcribeSessionAudio({
    audioUrl,
    feature: "session-stt",
    requestId: job.id,
    userId: practitionerUserId,
  });
  const compliance = await reviewSessionCompliance({
    transcriptText: stt.transcriptText,
    userId: requestedByUserId,
    requestId: job.id,
  });
  // B434: AI-разбор метерится (Pro 20 / Pro+ 50 в месяц + докупка) и может
  // быть выключен глобально или на конкретной сессии. Транскрипт и комплаенс
  // выше — платформенные и создаются всегда.
  const { resolveAnalysisEligibility, consumeAnalysis, attemptAutoTopup } = await import("@/lib/practitioner-ai-metering");
  let eligibility = await resolveAnalysisEligibility({
    practitionerId: videoSession.booking.practitionerId,
    practitionerUserId,
    bookingId: videoSession.booking.id,
    videoSessionId: videoSession.id,
    now,
  });
  // B434: авто-докупка минимального пакета при исчерпанной квоте (opt-in).
  if (!eligibility.allowed && eligibility.reason === "quota") {
    const topupOk = await attemptAutoTopup(videoSession.booking.practitionerId).catch(() => false);
    if (topupOk) {
      eligibility = await resolveAnalysisEligibility({
        practitionerId: videoSession.booking.practitionerId,
        practitionerUserId,
        bookingId: videoSession.booking.id,
        videoSessionId: videoSession.id,
        now,
      });
    }
  }
  const summary = eligibility.allowed
    ? await generateSessionSummary({
        transcriptText: stt.transcriptText,
        userId: practitionerUserId,
        requestId: job.id,
      })
    : null;
  if (eligibility.allowed && eligibility.source) {
    await consumeAnalysis({
      practitionerId: videoSession.booking.practitionerId,
      videoSessionId: videoSession.id,
      source: eligibility.source,
      now,
    });
  }
  const retention = await resolveSessionAiRetentionDates({ practitionerUserId, now });
  const { deleteLocalRecording } = await import("@/lib/livekit-egress");
  const audioDeleted = await deleteLocalRecording(audioUrl);

  const transcriptMetadata: Prisma.InputJsonObject = {
    stt: {
      source: "livekit_server_stt",
      provider: String(stt.metadata.provider ?? "unknown"),
      model: typeof stt.metadata.model === "string" ? stt.metadata.model : null,
      egressId,
      audioDeletedAt: now.toISOString(),
      finalizedAt: now.toISOString(),
    },
    requestId: job.id,
    capturedByUserId: requestedByUserId,
    ai: stt.metadata,
  };

  await db.videoSession.update({
    where: { id: videoSession.id },
    data: {
      serverSttStatus: "completed",
      serverSttAudioUrl: null,
      serverSttAudioExpiresAt: null,
      transcriptText: stt.transcriptText,
      transcriptMetadata,
      transcriptExpiresAt: retention.transcriptExpiresAt,
      // B434: без права на разбор поля разбора остаются пустыми (транскрипт
      // и комплаенс сохраняются всегда).
      summaryText: summary?.summaryText ?? null,
      practitionerNotesText: summary?.practitionerNotesText ?? null,
      clientFollowupDraft: summary?.clientFollowupDraft ?? null,
      summaryMetadata: summary?.metadata ?? undefined,
      summaryExpiresAt: summary ? retention.summaryExpiresAt : null,
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
      complianceEvidenceExpiresAt: retention.complianceEvidenceExpiresAt,
      complianceReviewedAt: now,
    },
  });

  await applyComplianceRisk({
    videoSessionId: videoSession.id,
    bookingId: videoSession.booking.id,
    practitionerId: videoSession.booking.practitionerId,
    actorUserId: requestedByUserId,
    compliance,
  });

  return {
    ok: true,
    videoSessionId,
    transcriptStored: true,
    audioDeleted,
    transcriptExpiresAt: retention.transcriptExpiresAt?.toISOString() ?? null,
    summaryExpiresAt: retention.summaryExpiresAt?.toISOString() ?? null,
  };
}

export async function cleanupExpiredSessionAiData(input: { now?: Date } = {}) {
  const now = input.now ?? new Date();
  const transcripts = await db.videoSession.updateMany({
    where: { transcriptExpiresAt: { lte: now } },
    data: {
      transcriptText: null,
      transcriptMetadata: Prisma.DbNull,
      transcriptExpiresAt: null,
    },
  });
  const summaries = await db.videoSession.updateMany({
    where: { summaryExpiresAt: { lte: now } },
    data: {
      summaryText: null,
      practitionerNotesText: null,
      clientFollowupDraft: null,
      summaryMetadata: Prisma.DbNull,
      summaryExpiresAt: null,
    },
  });
  const compliance = await db.videoSession.updateMany({
    where: { complianceEvidenceExpiresAt: { lte: now } },
    data: {
      complianceEvidence: Prisma.DbNull,
      complianceEvidenceExpiresAt: null,
    },
  });
  const expiredAudio = await db.videoSession.findMany({
    where: {
      serverSttAudioExpiresAt: { lte: now },
      serverSttAudioUrl: { not: null },
    },
    select: { serverSttAudioUrl: true },
  });
  if (expiredAudio.length > 0) {
    const { deleteLocalRecording } = await import("@/lib/livekit-egress");
    await Promise.all(expiredAudio.flatMap((session) => (
      session.serverSttAudioUrl ? [deleteLocalRecording(session.serverSttAudioUrl)] : []
    )));
  }
  const audio = await db.videoSession.updateMany({
    where: { serverSttAudioExpiresAt: { lte: now } },
    data: {
      serverSttAudioUrl: null,
      serverSttAudioExpiresAt: null,
      serverSttStatus: "audio_expired",
    },
  });

  return {
    transcriptsPurged: transcripts.count,
    summariesPurged: summaries.count,
    complianceEvidencePurged: compliance.count,
    serverSttAudioPurged: audio.count,
  };
}
