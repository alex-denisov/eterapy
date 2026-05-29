import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { getOrCreateDailyCard, dailyCardBeats } from "@/lib/daily-card";
import { recordClarityCreditEntry } from "@/lib/clarity-credits";
import { notify } from "@/lib/notifications";
import { requestContextFromHeaders } from "@/lib/request-context";
import { mainUrl } from "@/lib/subdomain";

function serialize(card: Awaited<ReturnType<typeof getOrCreateDailyCard>>["card"]) {
  const beats = dailyCardBeats(card.metadata);
  return {
    id: card.id,
    title: card.title,
    body: card.body,
    prompt: card.prompt,
    perspective: beats.perspective,
    step: beats.step,
    cardDate: card.cardDate.toISOString(),
    sharedAt: card.sharedAt?.toISOString() ?? null,
    completedAt: card.completedAt?.toISOString() ?? null,
    reflectionText: card.reflectionText ?? null,
    createdAt: card.createdAt.toISOString(),
  };
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const { card, created } = await getOrCreateDailyCard(userId);
  return jsonWithRequestContext({ card: serialize(card), created }, { status: 200 }, context);
}

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const payload = await request.json().catch(() => ({}));
  const { card } = await getOrCreateDailyCard(userId);

  if (payload?.action === "notify") {
    await notify({
      userId,
      event: "DAILY_CARD",
      data: {
        title: card.title,
        body: card.body,
        prompt: card.prompt,
        shareUrl: mainUrl(`/share?from=daily-card&topic=${encodeURIComponent(card.title)}`),
      },
      requestId: context.requestId,
    });
    return jsonWithRequestContext({ card: serialize(card), notified: true }, { status: 200 }, context);
  }

  if (payload?.action === "share") {
    const updated = await db.dailyCard.update({ where: { id: card.id }, data: { sharedAt: new Date() } });
    return jsonWithRequestContext({ card: serialize(updated), shared: true }, { status: 200 }, context);
  }

  if (payload?.action === "complete") {
    const reflectionText = typeof payload.reflectionText === "string"
      ? payload.reflectionText.trim().slice(0, 1200)
      : null;

    const result = await db.$transaction(async (tx) => {
      const current = await tx.dailyCard.findUnique({ where: { id: card.id } });
      if (!current) return { card, rewardGranted: false };
      if (current.completedAt) return { card: current, rewardGranted: false };

      const updated = await tx.dailyCard.update({
        where: { id: card.id },
        data: {
          completedAt: new Date(),
          reflectionText,
        },
      });

      const existingReward = await tx.clarityCreditLedgerEntry.findFirst({
        where: {
          userId,
          source: "daily_practice",
          sourceEventId: card.id,
          status: { not: "revoked" },
        },
        select: { id: true },
      });

      if (!existingReward) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 90);
        await recordClarityCreditEntry(tx, {
          userId,
          amount: 1,
          type: "grant",
          source: "daily_practice",
          sourceEventId: card.id,
          status: "confirmed",
          expiresAt,
          metadata: {
            cardTitle: card.title,
            reward: "daily_practice_completion",
          },
        });
      }

      return { card: updated, rewardGranted: !existingReward };
    });

    return jsonWithRequestContext(
      { card: serialize(result.card), completed: true, rewardGranted: result.rewardGranted },
      { status: 200 },
      context
    );
  }

  return errorWithRequestContext("VALIDATION_ERROR", "Unsupported daily card action", 400, context);
}
