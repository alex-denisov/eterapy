import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { consumeProductEntitlementForUse, userHasActiveEntitlement } from "@/lib/entitlements";
import { buildCircleReport, buildCircleTeaser } from "@/lib/social-clarity";

const PRODUCT_KEY = "circle";

const postSchema = z.object({
  creatorConsent: z.literal(true),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const { id } = await params;
  const circle = await db.clarityCircle.findUnique({
    where: { id },
    include: { participants: { where: { status: "SUBMITTED" }, orderBy: { createdAt: "asc" } } },
  });

  if (!circle || circle.status === "DELETED") return errorWithRequestContext("NOT_FOUND", "Circle not found", 404, context);
  if (circle.creatorId !== userId) return errorWithRequestContext("FORBIDDEN", "Only creator can generate", 403, context);
  const eligibleParticipants = circle.participants.filter((participant) => !participant.riskFlags.includes("same_device_as_creator"));
  // Outside-view (B385) needs a single invited answer; legacy circle needs two.
  const isOutside = (circle.metadata as { mode?: string } | null)?.mode === "outside";
  const minParticipants = isOutside ? 1 : 2;
  if (eligibleParticipants.length < minParticipants) {
    return errorWithRequestContext(
      "CONFLICT",
      isOutside ? "Нужен хотя бы один ответ приглашённого" : "Нужно минимум два ответа участников",
      409,
      context,
    );
  }

  const teaserText = buildCircleTeaser({
    question: circle.question,
    participantCount: eligibleParticipants.length,
    answers: eligibleParticipants.map((participant) => participant.answerText),
  });

  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  if (!hasEntitlement) {
    const updated = await db.clarityCircle.update({
      where: { id },
      data: { teaserText },
      include: { participants: { where: { status: "SUBMITTED" }, orderBy: { createdAt: "asc" } } },
    });
    return jsonWithRequestContext(
      { result: updated, teaserText, generated: false, paywalled: true },
      { status: 200 },
      context
    );
  }

  const reportText = buildCircleReport({
    question: circle.question,
    answers: eligibleParticipants.map((participant, index) => ({
      name: participant.displayName ?? `Участник ${index + 1}`,
      text: participant.answerText,
    })),
  });

  // INC-025/B408: списываем баллы за КАЖДЫЙ разбор круга — сохранение результата,
  // переход круга в READY и гашение entitlement идут одной транзакцией (атомарно).
  // Подписка — не ProductEntitlement, поэтому для подписчиков consume — no-op.
  const updated = await db.$transaction(async (tx) => {
    const productResult = await tx.productResult.create({
      data: {
        userId,
        productKey: PRODUCT_KEY,
        title: "Круг",
        status: "READY",
        previewText: teaserText,
        resultText: reportText,
        metadata: {
          circleId: circle.id,
          participantCount: eligibleParticipants.length,
          riskFlags: circle.participants.flatMap((participant) => participant.riskFlags),
          blockedParticipantCount: circle.participants.length - eligibleParticipants.length,
        },
      },
    });
    const updatedCircle = await tx.clarityCircle.update({
      where: { id },
      data: {
        status: "READY",
        teaserText,
        reportId: productResult.id,
      },
      include: { participants: { where: { status: "SUBMITTED" }, orderBy: { createdAt: "asc" } } },
    });
    await consumeProductEntitlementForUse(tx, userId, PRODUCT_KEY);
    return updatedCircle;
  });

  // Reflect the post-consume state so the client paywalls the NEXT разбор.
  const entitledAfter = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  return jsonWithRequestContext({ hasEntitlement: entitledAfter, result: updated, generated: true }, { status: 200 }, context);
}
