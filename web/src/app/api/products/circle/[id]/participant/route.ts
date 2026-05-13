import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { logFraudEvent, requestFingerprint } from "@/lib/antifraud";
import { assessCircleParticipantRisk, socialRiskMetadata } from "@/lib/social-antiabuse";

const postSchema = z.object({
  answerText: z.string().trim().min(10).max(4000),
  displayName: z.string().trim().min(1).max(80).optional(),
  consent: z.literal(true),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id ?? null;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const { id } = await params;
  const circle = await db.clarityCircle.findUnique({
    where: { id },
    include: {
      participants: {
        where: { status: "SUBMITTED" },
        select: { id: true, userId: true, answerText: true, deviceHash: true },
      },
    },
  });

  if (!circle || circle.status === "DELETED") return errorWithRequestContext("NOT_FOUND", "Circle not found", 404, context);
  if (circle.inviteExpiresAt <= new Date()) return errorWithRequestContext("GONE", "Invite expired", 410, context);
  if (circle.participants.length >= 5) return errorWithRequestContext("CONFLICT", "Circle is full", 409, context);
  if (userId && circle.participants.some((participant) => participant.userId === userId)) {
    return errorWithRequestContext("CONFLICT", "Already submitted", 409, context);
  }

  const answerText = parsed.data.answerText;
  const fingerprint = requestFingerprint(request);
  const risk = assessCircleParticipantRisk({
    circleCreatedAt: circle.createdAt,
    creatorIpHash: circle.creatorIpHash,
    creatorDeviceHash: circle.creatorDeviceHash,
    existingAnswers: circle.participants.map((participant) => participant.answerText),
    existingDeviceHashes: circle.participants.map((participant) => participant.deviceHash),
    answerText,
    fingerprint,
  });

  const participant = await db.$transaction(async (tx) => {
    const created = await tx.clarityCircleParticipant.create({
      data: {
        circleId: id,
        userId,
        displayName: parsed.data.displayName ?? session?.user?.name ?? "Участник",
        answerText,
        consent: parsed.data.consent,
        status: risk.shouldHide ? "HIDDEN" : "SUBMITTED",
        riskScore: risk.riskScore,
        riskFlags: risk.riskFlags,
        ipHash: fingerprint.ipHash,
        userAgentHash: fingerprint.userAgentHash,
        deviceHash: fingerprint.deviceHash,
        answerHash: risk.answerHash,
        submittedAfterMs: risk.submittedAfterMs,
        metadata: {
          source: "circle_invite",
          version: "v4.1",
          ...socialRiskMetadata({
            rewardEligible: risk.rewardEligible,
            submittedAfterMs: risk.submittedAfterMs,
            moderation: risk.shouldHide ? "hidden" : risk.shouldReview ? "review" : "accepted",
          }),
        },
      },
    });

    if (risk.shouldReview) {
      await logFraudEvent(tx, {
        subjectType: "circle_participant",
        subjectId: created.id,
        actorUserId: userId,
        riskScore: risk.riskScore,
        riskFlags: risk.riskFlags,
        action: risk.shouldHide ? "circle_answer_hidden" : "circle_answer_review",
        status: "review",
        ipHash: fingerprint.ipHash,
        userAgentHash: fingerprint.userAgentHash,
        deviceHash: fingerprint.deviceHash,
        metadata: { circleId: id, rewardEligible: risk.rewardEligible },
      });
    }

    return created;
  });

  const updated = await db.clarityCircle.findUnique({
    where: { id },
    include: { participants: { where: { status: "SUBMITTED" }, orderBy: { createdAt: "asc" } } },
  });

  return jsonWithRequestContext({ result: updated, participant }, { status: 200 }, context);
}
