import { approvedLibraryEntries } from "@/data/anonymous-library";
import db from "@/lib/db";
import { getSubscriptionPlanLabel, getSubscriptionStatusLabel } from "@/lib/billing-labels";
import { getClarityCreditBalance } from "@/lib/clarity-credits";
import { dialogueStatusLabelRu, dialogueTopicLabelRu } from "@/lib/dialogue-router";
import { listDiaryItems } from "@/lib/diary";
import { log, serializeError } from "@/lib/logger";
import { getPracticeStreakSnapshot } from "@/lib/streaks";
import { effectivePracticeStreak } from "@/lib/streak-display";
import { startOfPracticeWeek } from "@/lib/weekly-summary";
import { formatSessionFloor } from "@/lib/session-pricing";
import type { MiniAppInitialData } from "@/lib/miniapp/types";

type MiniAppViewer = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

function libraryItems(): MiniAppInitialData["libraryItems"] {
  return approvedLibraryEntries().slice(0, 3).map((entry) => ({
    slug: entry.slug,
    topic: entry.topic,
    question: entry.question,
    href: `/miniapp/library/${entry.slug}`,
  }));
}

function baseData(viewer?: MiniAppViewer | null): MiniAppInitialData {
  const authenticated = Boolean(viewer?.id);
  const client = authenticated && (viewer?.role ?? "CLIENT") === "CLIENT";
  return {
    viewer: { authenticated, client, firstName: viewer?.name?.trim().split(/\s+/)[0] || "Гость", points: 0, plan: "Базовый", planStatus: authenticated ? "Базовый доступ" : "Гостевой режим", email: viewer?.email ?? null },
    dialogues: [], diaryItems: [], libraryItems: libraryItems(), practitioner: null,
    upcomingBookingLabel: null, streak: 0, completedWeekdays: [], loadError: false,
  };
}

function relativeDate(date: Date): string {
  const delta = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (delta <= 0) return `Сегодня, ${date.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  if (delta === 1) return "Вчера";
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
}

export async function loadMiniAppInitialData(viewer?: MiniAppViewer | null): Promise<MiniAppInitialData> {
  const fallback = baseData(viewer);
  if (!viewer?.id || !fallback.viewer.client) return fallback;
  try {
    const [points, subscription, dialogues, diary] = await Promise.all([
      getClarityCreditBalance(viewer.id),
      db.userSubscription.findFirst({
        where: { userId: viewer.id, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
        orderBy: { createdAt: "desc" },
        select: { planKey: true, status: true, cancelAtPeriodEnd: true },
      }),
      db.dialogue.findMany({
        where: { userId: viewer.id, deletedAt: null, status: { in: ["OPEN", "AWAITING_USER", "PROCESSING", "ANSWERED"] } },
        orderBy: { updatedAt: "desc" }, take: 12,
        select: { id: true, title: true, topic: true, status: true, updatedAt: true, _count: { select: { messages: true } } },
      }),
      listDiaryItems(viewer.id),
    ]);

    const [practitioner, booking, streak, weekCards] = await Promise.all([
      db.practitioner.findFirst({
        where: { status: "ACTIVE", verified: true },
        orderBy: [{ founding: "desc" }, { reviewCount: "desc" }],
        select: {
          slug: true,
          title: true,
          pricePerSession: true,
          user: { select: { name: true, avatarUrl: true } },
        },
      }),
      db.booking.findFirst({
        where: { clientId: viewer.id, status: { in: ["PENDING", "CONFIRMED"] }, slot: { startAt: { gt: new Date() } } },
        orderBy: { slot: { startAt: "asc" } },
        select: { slot: { select: { startAt: true } } },
      }),
      getPracticeStreakSnapshot(viewer.id),
      db.dailyCard.findMany({
        where: { userId: viewer.id, completedAt: { not: null }, cardDate: { gte: startOfPracticeWeek() } },
        select: { cardDate: true },
      }),
    ]);

    return {
      ...fallback,
      viewer: {
        ...fallback.viewer,
        points,
        plan: subscription ? getSubscriptionPlanLabel(subscription.planKey) : "Базовый",
        planStatus: subscription
          ? subscription.cancelAtPeriodEnd ? "До конца периода" : getSubscriptionStatusLabel(subscription.status)
          : "Базовый доступ",
      },
      dialogues: dialogues.map((item) => ({
        id: item.id, title: item.title,
        topic: dialogueTopicLabelRu(item.topic), status: dialogueStatusLabelRu(item.status),
        updated: relativeDate(item.updatedAt), messageCount: item._count.messages,
        href: `/checkin?dialogueId=${encodeURIComponent(item.id)}`,
      })),
      diaryItems: diary.slice(0, 20).map((item) => ({
        id: `${item.kind}:${item.id}`, title: item.title, type: item.eyebrow,
        topic: item.topicLabel ?? item.topic ?? "Личное", date: relativeDate(item.updatedAt),
        insight: item.description, href: item.href,
      })),
      practitioner: practitioner ? {
        name: practitioner.user.name ?? "Специалист", title: practitioner.title,
        price: formatSessionFloor(practitioner.pricePerSession),
        href: `/practitioners/${practitioner.slug}`,
        avatar: practitioner.user.avatarUrl?.startsWith("/") ? practitioner.user.avatarUrl : null,
      } : null,
      upcomingBookingLabel: booking?.slot?.startAt.toLocaleDateString("ru-RU", {
        day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
      }) ?? null,
      streak: effectivePracticeStreak(streak.count, streak.lastDoneDate),
      completedWeekdays: weekCards.map((card) => card.cardDate.getDay()),
    };
  } catch (error) {
    log.warn("miniapp.initial_data_failed", { error: serializeError(error) });
    return { ...fallback, loadError: true };
  }
}
