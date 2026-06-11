import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { getOrCreateDailyCard, dailyCardBeats, generatePracticeResponseForQuestion } from "@/lib/daily-card";
import { completeMission } from "@/lib/missions";
import { bumpPracticeStreak } from "@/lib/streaks";
import { generateWeeklySummary } from "@/lib/weekly-summary";
import { log, serializeError } from "@/lib/logger";
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

  if (payload?.action === "reflect") {
    // G14: the user writes their own вопрос дня; we generate взгляд + шаг from
    // it, store them, mark the day done and grant the +1 балл reward once.
    const question = typeof payload.question === "string" ? payload.question.trim().slice(0, 600) : "";
    if (question.length < 3) {
      return errorWithRequestContext("VALIDATION_ERROR", "Запишите вопрос дня (хотя бы несколько слов)", 400, context);
    }

    const { perspective, step, source } = await generatePracticeResponseForQuestion(userId, question);

    const result = await db.$transaction(async (tx) => {
      const current = await tx.dailyCard.findUnique({ where: { id: card.id } });
      if (!current) return { card, rewardGranted: false };

      const existingMeta = current.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? (current.metadata as Record<string, unknown>)
        : {};
      const mergedMeta: Record<string, unknown> = {
        ...existingMeta,
        userQuestion: question,
        perspective,
        step,
        source,
        reflectedAt: new Date().toISOString(),
      };

      const updated = await tx.dailyCard.update({
        where: { id: card.id },
        data: {
          completedAt: current.completedAt ?? new Date(),
          reflectionText: question,
          metadata: mergedMeta as Prisma.InputJsonObject,
        },
      });

      // B375 (M26): начисление по вехам (3/7/14/30 дней) вместо +1 за каждый
      // день — правило живёт в bumpPracticeStreak/STREAK_REWARDS.
      const streak = await bumpPracticeStreak({ userId, completedAt: updated.completedAt ?? new Date(), tx });
      await completeMission({ userId, missionKey: "first_practice", tx });

      return { card: updated, rewardGranted: streak.rewardsGranted.length > 0, milestones: streak.rewardsGranted, streakCount: streak.count };
    });

    if (result.milestones?.includes(7)) {
      await generateWeeklySummary({ userId, requestId: context.requestId }).catch((summaryErr) => {
        log.error("daily_card.weekly_summary_failed", { err: serializeError(summaryErr) });
      });
    }

    return jsonWithRequestContext(
      { card: serialize(result.card), reflected: true, rewardGranted: result.rewardGranted, milestones: result.milestones ?? [], streakCount: result.streakCount ?? null },
      { status: 200 },
      context
    );
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

      // B375 (M26): начисление по вехам — см. STREAK_REWARDS.
      const streak = await bumpPracticeStreak({ userId, completedAt: updated.completedAt ?? new Date(), tx });
      await completeMission({ userId, missionKey: "first_practice", tx });

      return { card: updated, rewardGranted: streak.rewardsGranted.length > 0, milestones: streak.rewardsGranted, streakCount: streak.count };
    });

    if (result.milestones?.includes(7)) {
      await generateWeeklySummary({ userId, requestId: context.requestId }).catch((summaryErr) => {
        log.error("daily_card.weekly_summary_failed", { err: serializeError(summaryErr) });
      });
    }

    return jsonWithRequestContext(
      { card: serialize(result.card), completed: true, rewardGranted: result.rewardGranted, milestones: result.milestones ?? [], streakCount: result.streakCount ?? null },
      { status: 200 },
      context
    );
  }

  return errorWithRequestContext("VALIDATION_ERROR", "Unsupported daily card action", 400, context);
}
