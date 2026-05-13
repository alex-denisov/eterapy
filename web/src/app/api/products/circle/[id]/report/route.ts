import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { logFraudEvent, requestFingerprint } from "@/lib/antifraud";
import { requestContextFromHeaders } from "@/lib/request-context";

const postSchema = z.object({
  participantId: z.string(),
  reason: z.string().trim().min(3).max(400),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const { id } = await params;
  const circle = await db.clarityCircle.findUnique({ where: { id }, select: { creatorId: true } });
  if (!circle) return errorWithRequestContext("NOT_FOUND", "Circle not found", 404, context);
  if (circle.creatorId !== userId) return errorWithRequestContext("FORBIDDEN", "Only creator can report", 403, context);

  const fingerprint = requestFingerprint(request);
  const participant = await db.$transaction(async (tx) => {
    const updated = await tx.clarityCircleParticipant.update({
      where: { id: parsed.data.participantId },
      data: {
        status: "HIDDEN",
        reportedAt: new Date(),
        reportedReason: parsed.data.reason,
        riskFlags: { push: "creator_reported" },
        riskScore: { increment: 80 },
      },
    });

    await logFraudEvent(tx, {
      subjectType: "circle_participant",
      subjectId: updated.id,
      actorUserId: userId,
      riskScore: Math.max(updated.riskScore, 80),
      riskFlags: Array.from(new Set([...updated.riskFlags, "creator_reported"])),
      action: "circle_participant_reported",
      status: "review",
      ipHash: fingerprint.ipHash,
      userAgentHash: fingerprint.userAgentHash,
      deviceHash: fingerprint.deviceHash,
      metadata: { circleId: id, reason: parsed.data.reason },
    });

    return updated;
  });

  return jsonWithRequestContext({ ok: true, participant }, { status: 200 }, context);
}
