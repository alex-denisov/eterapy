import { JobStatus, Prisma, type Job } from "@prisma/client";
import db from "@/lib/db";
import { enqueueJob } from "@/lib/job-queue";
import { startRoomAudioEgress, deleteLocalRecording } from "@/lib/livekit-egress";
import { getPractitionerSessionRetentionDays, practitionerHasFeature } from "@/lib/practitioner-entitlements";
import { generateSessionSummary, reviewSessionCompliance } from "@/lib/session-ai-pipeline";
import { transcribeSessionAudio } from "@/lib/session-stt";
import {
  cleanupExpiredSessionAiData,
  handleServerSttJob,
  SERVER_STT_JOB_TYPE,
  startServerSttForBooking,
} from "@/lib/server-stt";

jest.mock("@/lib/db", () => ({
  __esModule: true,
  default: {
    booking: { findUnique: jest.fn() },
    videoSession: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  },
}));

jest.mock("@/lib/job-queue", () => ({
  enqueueJob: jest.fn(),
}));

jest.mock("@/lib/livekit-egress", () => ({
  startRoomAudioEgress: jest.fn(),
  deleteLocalRecording: jest.fn(),
}));

jest.mock("@/lib/practitioner-entitlements", () => ({
  getPractitionerSessionRetentionDays: jest.fn(),
  practitionerHasFeature: jest.fn(),
}));

// B434: метеринг разборов покрыт собственными тестами — здесь всегда allowed.
jest.mock("@/lib/practitioner-ai-metering", () => ({
  resolveAnalysisEligibility: jest.fn().mockResolvedValue({ allowed: true, source: "included" }),
  consumeAnalysis: jest.fn().mockResolvedValue(undefined),
  attemptAutoTopup: jest.fn().mockResolvedValue(false),
}));

jest.mock("@/lib/session-ai-pipeline", () => ({
  generateSessionSummary: jest.fn(),
  reviewSessionCompliance: jest.fn(),
}));

jest.mock("@/lib/session-stt", () => ({
  transcribeSessionAudio: jest.fn(),
}));

const mockDb = db as unknown as {
  booking: { findUnique: jest.Mock };
  videoSession: {
    findMany: jest.Mock;
    findUnique: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
};
const mockEnqueueJob = enqueueJob as jest.MockedFunction<typeof enqueueJob>;
const mockStartAudioEgress = startRoomAudioEgress as jest.MockedFunction<typeof startRoomAudioEgress>;
const mockDeleteLocalRecording = deleteLocalRecording as jest.MockedFunction<typeof deleteLocalRecording>;
const mockHasFeature = practitionerHasFeature as jest.MockedFunction<typeof practitionerHasFeature>;
const mockRetentionDays = getPractitionerSessionRetentionDays as jest.MockedFunction<typeof getPractitionerSessionRetentionDays>;
const mockTranscribe = transcribeSessionAudio as jest.MockedFunction<typeof transcribeSessionAudio>;
const mockReviewCompliance = reviewSessionCompliance as jest.MockedFunction<typeof reviewSessionCompliance>;
const mockGenerateSummary = generateSessionSummary as jest.MockedFunction<typeof generateSessionSummary>;

const now = new Date("2026-06-06T12:00:00.000Z");

function job(overrides: Partial<Job> = {}): Job {
  return {
    id: "job-stt-1",
    queue: "default",
    type: SERVER_STT_JOB_TYPE,
    status: JobStatus.RUNNING,
    priority: 0,
    payload: {
      videoSessionId: "vs-1",
      bookingId: "booking-1",
      audioUrl: "/uploads/recordings/stt_booking-1.ogg",
      egressId: "egress-1",
      requestedByUserId: "practitioner-user",
    },
    result: null,
    error: null,
    attempts: 1,
    maxAttempts: 3,
    runAfter: now,
    lockedAt: now,
    lockedBy: "worker-1",
    startedAt: now,
    finishedAt: null,
    idempotencyKey: "stt:vs-1",
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function booking(overrides: Record<string, unknown> = {}) {
  return {
    id: "booking-1",
    clientId: "client-user",
    practitionerId: "pr-1",
    practitioner: { userId: "practitioner-user" },
    videoSession: {
      id: "vs-1",
      bookingId: "booking-1",
      roomName: "room-booking-1",
      status: "ACTIVE",
      transcriptText: null,
      summaryText: null,
      serverSttStatus: "not_requested",
      serverSttJobId: null,
      serverSttAudioUrl: null,
      serverSttAudioExpiresAt: null,
    },
    ...overrides,
  };
}

describe("Z19 server STT orchestration", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers().setSystemTime(now);
    mockDb.videoSession.update.mockResolvedValue({});
    mockDb.videoSession.updateMany.mockResolvedValue({ count: 0 });
    mockDb.videoSession.findMany.mockResolvedValue([]);
    mockEnqueueJob.mockResolvedValue(job({ id: "job-stt-1" }));
    mockStartAudioEgress.mockResolvedValue({
      egressId: "egress-1",
      filename: "stt_booking-1.ogg",
      url: "/uploads/recordings/stt_booking-1.ogg",
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
    });
    mockDeleteLocalRecording.mockResolvedValue(true);
    mockHasFeature.mockResolvedValue(true);
    mockRetentionDays.mockResolvedValue(90);
    mockTranscribe.mockResolvedValue({
      transcriptText: "Практик: подробная серверная расшифровка сессии.\nКлиент: спасибо, это помогло.",
      metadata: {
        provider: "openai",
        model: "gpt-4.1-mini",
        tokensIn: 100,
        tokensOut: 200,
        latencyMs: 1234,
      },
    });
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
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("lets only the practitioner enable the AI notes stream", async () => {
    mockDb.booking.findUnique.mockResolvedValue(booking());

    await expect(startServerSttForBooking({
      bookingId: "booking-1",
      actorUserId: "client-user",
      requestId: "z19-request",
    })).rejects.toMatchObject({ statusCode: 403 });

    expect(mockStartAudioEgress).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("gates server STT to Practitioner Pro+ before starting LiveKit egress", async () => {
    mockDb.booking.findUnique.mockResolvedValue(booking());
    mockHasFeature.mockResolvedValue(false);

    await expect(startServerSttForBooking({
      bookingId: "booking-1",
      actorUserId: "practitioner-user",
      requestId: "z19-request",
    })).rejects.toMatchObject({ statusCode: 403 });

    expect(mockHasFeature).toHaveBeenCalledWith("practitioner-user", "server_stt");
    expect(mockStartAudioEgress).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("starts audio-only egress and enqueues one idempotent transcribe job per video session", async () => {
    mockDb.booking.findUnique.mockResolvedValue(booking());

    const result = await startServerSttForBooking({
      bookingId: "booking-1",
      actorUserId: "practitioner-user",
      requestId: "z19-request",
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      jobId: "job-stt-1",
      status: "queued",
    }));
    expect(mockStartAudioEgress).toHaveBeenCalledWith("room-booking-1", "booking-1");
    expect(mockEnqueueJob).toHaveBeenCalledWith(expect.objectContaining({
      type: SERVER_STT_JOB_TYPE,
      maxAttempts: 3,
      idempotencyKey: "stt:vs-1",
      payload: expect.objectContaining({
        videoSessionId: "vs-1",
        bookingId: "booking-1",
        audioUrl: "/uploads/recordings/stt_booking-1.ogg",
        egressId: "egress-1",
        requestedByUserId: "practitioner-user",
      }),
    }));
    expect(mockDb.videoSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "vs-1" },
      data: expect.objectContaining({
        serverSttStatus: "queued",
        serverSttJobId: "job-stt-1",
        serverSttAudioUrl: "/uploads/recordings/stt_booking-1.ogg",
        serverSttAudioExpiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      }),
    }));
  });

  it("does not start a second egress while the server STT job is already processing", async () => {
    mockDb.booking.findUnique.mockResolvedValue(booking({
      videoSession: {
        ...booking().videoSession,
        serverSttStatus: "processing",
        serverSttJobId: "job-existing",
      },
    }));

    const result = await startServerSttForBooking({
      bookingId: "booking-1",
      actorUserId: "practitioner-user",
      requestId: "z19-request",
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      status: "processing",
      jobId: "job-existing",
    }));
    expect(mockStartAudioEgress).not.toHaveBeenCalled();
    expect(mockEnqueueJob).not.toHaveBeenCalled();
  });

  it("transcribes through the worker, stores 90-day Pro+ retention, and deletes audio", async () => {
    mockDb.videoSession.findUnique.mockResolvedValue({
      ...booking().videoSession,
      booking: {
        id: "booking-1",
        clientId: "client-user",
        practitionerId: "pr-1",
        practitioner: { userId: "practitioner-user" },
      },
    });

    await expect(handleServerSttJob(job(), { now })).resolves.toEqual(expect.objectContaining({
      ok: true,
      videoSessionId: "vs-1",
      transcriptStored: true,
      audioDeleted: true,
    }));

    expect(mockTranscribe).toHaveBeenCalledWith(expect.objectContaining({
      audioUrl: "/uploads/recordings/stt_booking-1.ogg",
      feature: "session-stt",
      requestId: "job-stt-1",
      userId: "practitioner-user",
    }));
    expect(mockDb.videoSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "vs-1" },
      data: expect.objectContaining({
        serverSttStatus: "completed",
        serverSttAudioUrl: null,
        serverSttAudioExpiresAt: null,
        transcriptText: expect.stringContaining("серверная расшифровка"),
        transcriptExpiresAt: new Date("2026-09-04T12:00:00.000Z"),
        summaryText: "Итог сессии",
        summaryExpiresAt: new Date("2026-09-04T12:00:00.000Z"),
        complianceEvidenceExpiresAt: new Date("2027-06-06T12:00:00.000Z"),
        transcriptMetadata: expect.objectContaining({
          stt: expect.objectContaining({
            source: "livekit_server_stt",
            provider: "openai",
            audioDeletedAt: now.toISOString(),
          }),
        }),
      }),
    }));
    expect(mockDeleteLocalRecording).toHaveBeenCalledWith("/uploads/recordings/stt_booking-1.ogg");
  });

  it("cleans expired transcript, summary, compliance evidence, and temporary STT audio independently", async () => {
    mockDb.videoSession.updateMany
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 3 })
      .mockResolvedValueOnce({ count: 4 });
    mockDb.videoSession.findMany.mockResolvedValueOnce([
      { serverSttAudioUrl: "/uploads/recordings/stt_booking-1.ogg" },
      { serverSttAudioUrl: null },
    ]);

    await expect(cleanupExpiredSessionAiData({ now })).resolves.toEqual({
      transcriptsPurged: 2,
      summariesPurged: 1,
      complianceEvidencePurged: 3,
      serverSttAudioPurged: 4,
    });

    expect(mockDb.videoSession.updateMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { transcriptExpiresAt: { lte: now } },
      data: expect.objectContaining({ transcriptText: null, transcriptExpiresAt: null }),
    }));
    expect(mockDb.videoSession.updateMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { summaryExpiresAt: { lte: now } },
      data: expect.objectContaining({ summaryText: null, summaryExpiresAt: null }),
    }));
    expect(mockDb.videoSession.updateMany).toHaveBeenNthCalledWith(3, expect.objectContaining({
      where: { complianceEvidenceExpiresAt: { lte: now } },
      data: expect.objectContaining({ complianceEvidence: Prisma.DbNull, complianceEvidenceExpiresAt: null }),
    }));
    expect(mockDb.videoSession.updateMany).toHaveBeenNthCalledWith(4, expect.objectContaining({
      where: { serverSttAudioExpiresAt: { lte: now } },
      data: expect.objectContaining({ serverSttAudioUrl: null, serverSttAudioExpiresAt: null }),
    }));
    expect(mockDeleteLocalRecording).toHaveBeenCalledWith("/uploads/recordings/stt_booking-1.ogg");
  });
});
