import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";

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
    include: { participants: { where: { status: "SUBMITTED" }, select: { id: true, userId: true } } },
  });

  if (!circle || circle.status === "DELETED") return errorWithRequestContext("NOT_FOUND", "Circle not found", 404, context);
  if (circle.inviteExpiresAt <= new Date()) return errorWithRequestContext("GONE", "Invite expired", 410, context);
  if (circle.participants.length >= 5) return errorWithRequestContext("CONFLICT", "Circle is full", 409, context);
  if (userId && circle.participants.some((participant) => participant.userId === userId)) {
    return errorWithRequestContext("CONFLICT", "Already submitted", 409, context);
  }

  const answerText = parsed.data.answerText;
  const tooFast = circle.createdAt.getTime() > Date.now() - 10_000;
  const duplicate = circle.participants.some((participant) => participant.id && answerText.length < 20);
  const riskFlags = [
    ...(tooFast ? ["fast_answer"] : []),
    ...(duplicate ? ["short_duplicate_risk"] : []),
  ];

  const participant = await db.clarityCircleParticipant.create({
    data: {
      circleId: id,
      userId,
      displayName: parsed.data.displayName ?? session?.user?.name ?? "Участник",
      answerText,
      consent: parsed.data.consent,
      riskScore: riskFlags.length * 20,
      riskFlags,
      metadata: { source: "circle_invite", version: "v4.1" },
    },
  });

  const updated = await db.clarityCircle.findUnique({
    where: { id },
    include: { participants: { where: { status: "SUBMITTED" }, orderBy: { createdAt: "asc" } } },
  });

  return jsonWithRequestContext({ result: updated, participant }, { status: 200 }, context);
}
