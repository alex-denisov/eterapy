import { approvedLibraryEntries } from "@/data/anonymous-library";
import db from "@/lib/db";
import { getSubscriptionPlanLabel, getSubscriptionStatusLabel } from "@/lib/billing-labels";
import { getClarityCreditBalance } from "@/lib/clarity-credits";
import { dialogueStatusLabelRu, dialogueTopicLabelRu } from "@/lib/dialogue-router";
import { listDiaryItems } from "@/lib/diary";
import { listJournalEntries } from "@/lib/journal-entries";
import { log, serializeError } from "@/lib/logger";
import { getPracticeStreakSnapshot } from "@/lib/streaks";
import { effectivePracticeStreak } from "@/lib/streak-display";
import { tarotCardArtworkPath, tarotDayPick } from "@/lib/tarot-day";
import { hasCompletedEsotericService } from "@/lib/tarot-day-audience";
import { getTarotDayInterpretation } from "@/lib/tarot-day-content";
import { startOfPracticeWeek } from "@/lib/weekly-summary";
import { formatSessionFloor } from "@/lib/session-pricing";
import { canJoinBooking } from "@/lib/booking-actions";
import { getBookingStatus } from "@/lib/booking-status";
import type { MiniAppInitialData } from "@/lib/miniapp/types";
import { toMiniAppPath } from "@/lib/miniapp/navigation";
import { cardPaymentAvailable } from "@/lib/payments/config";
import { telegramMiniAppSsoEnabled } from "@/lib/miniapp/telegram/auth";

type MiniAppViewer = {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
};

const SHORT_MONTHS_RU = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

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
    viewer: {
      authenticated,
      client,
      firstName: viewer?.name?.trim().split(/\s+/)[0] || "Гость",
      points: 0,
      plan: authenticated ? "Базовый" : "Без тарифа",
      planStatus: authenticated ? "Базовый доступ" : "Гостевой режим",
      email: viewer?.email ?? null,
      hasPassword: false,
      telegramLinked: false,
      telegramLinkAvailable: telegramMiniAppSsoEnabled(),
    },
    dialogues: [], dialogueNextCursor: null, diaryItems: [], journalEntries: [], libraryItems: libraryItems(), practitioner: null,
    bookings: [], materials: [], profileNotice: false,
    upcomingBookingLabel: null, streak: 0, completedWeekdays: [], tarotDay: null,
    cardPaymentEnabled: cardPaymentAvailable(), loadError: false,
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
    const [account, telegramIdentity, points, subscription, dialogues, diary, tarotDayEligible] = await Promise.all([
      db.user.findUnique({
        where: { id: viewer.id },
        // B681: `tarotDayHidden` читается из уже загружаемой строки — второго
        // обращения к `users` ради одного флажка не нужно.
        select: { password: true, tarotDayHidden: true },
      }),
      db.platformIdentity.findUnique({
        where: { provider_userId: { provider: "telegram", userId: viewer.id } },
        select: { id: true },
      }),
      getClarityCreditBalance(viewer.id),
      db.userSubscription.findFirst({
        where: { userId: viewer.id, status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] } },
        orderBy: { createdAt: "desc" },
        select: { planKey: true, status: true, cancelAtPeriodEnd: true },
      }),
      db.dialogue.findMany({
        where: { userId: viewer.id, deletedAt: null },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 13,
        select: { id: true, title: true, topic: true, status: true, updatedAt: true, _count: { select: { messages: true } } },
      }),
      listDiaryItems(viewer.id),
      hasCompletedEsotericService(viewer.id).catch(() => false),
    ]);

    // B681 — те же два гейта, что и в кабинете: аудитория (пройдена хотя бы
    // одна эзотерическая услуга) и собственное скрытие. Мини-апп и кабинет
    // показывают одному человеку одно и то же — иначе крестик в кабинете
    // выглядел бы сломанным.
    const showTarotDay = tarotDayEligible && !account?.tarotDayHidden;
    const tarotPick = tarotDayPick(viewer.id);
    const tarotDay = !showTarotDay ? null : await getTarotDayInterpretation(tarotPick, { allowGenerate: false })
      .then(({ interpretation }) => ({
        key: tarotPick.key,
        name: tarotPick.card.name,
        reversed: tarotPick.reversed,
        artworkUrl: tarotCardArtworkPath(tarotPick.card),
        headline: interpretation.headline,
        body: interpretation.body,
        focus: interpretation.focus,
      }))
      .catch(() => null);

    const [practitioner, bookings, materials, unreadNotifications, streak, weekCards, journal] = await Promise.all([
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
      db.booking.findMany({
        where: { clientId: viewer.id },
        orderBy: { createdAt: "desc" },
        take: 20,
        select: {
          id: true, status: true, priceRub: true, createdAt: true,
          slot: { select: { startAt: true, endAt: true } },
          practitioner: { select: { user: { select: { name: true } } } },
        },
      }),
      db.practitionerClientMessage.findMany({
        where: { clientId: viewer.id },
        orderBy: { sentAt: "desc" }, take: 40,
        select: { id: true, text: true, attachmentName: true, sentAt: true, readAt: true, practitioner: { select: { user: { select: { name: true } } } } },
      }),
      db.notification.count({ where: { userId: viewer.id, readAt: null } }),
      getPracticeStreakSnapshot(viewer.id),
      db.dailyCard.findMany({
        where: { userId: viewer.id, completedAt: { not: null }, cardDate: { gte: startOfPracticeWeek() } },
        select: { cardDate: true },
      }),
      // B554 п.20: «Ваши записи» — дни практики, а не последние разборы.
      listJournalEntries(viewer.id, 7),
    ]);

    return {
      ...fallback,
      viewer: {
        ...fallback.viewer,
        points,
        hasPassword: Boolean(account?.password && !account.password.startsWith("oauth:")),
        telegramLinked: Boolean(telegramIdentity),
        plan: subscription ? getSubscriptionPlanLabel(subscription.planKey) : "Базовый",
        planStatus: subscription
          ? subscription.cancelAtPeriodEnd ? "До конца периода" : getSubscriptionStatusLabel(subscription.status)
          : "Базовый доступ",
      },
      dialogues: dialogues.slice(0, 12).map((item) => ({
        id: item.id, title: item.title,
        topic: dialogueTopicLabelRu(item.topic), status: dialogueStatusLabelRu(item.status),
        updated: relativeDate(item.updatedAt), messageCount: item._count.messages,
        href: `/miniapp/checkin?dialogueId=${encodeURIComponent(item.id)}`,
      })),
      dialogueNextCursor: dialogues.length > 12 ? dialogues[11]?.id ?? null : null,
      diaryItems: diary.slice(0, 20).map((item) => ({
        id: `${item.kind}:${item.id}`, title: item.title, type: item.eyebrow,
        topic: item.topicLabel ?? item.topic ?? "Личное", date: relativeDate(item.updatedAt),
        dayLabel: String(item.updatedAt.getDate()),
        insight: item.description, href: toMiniAppPath(item.href),
      })),
      journalEntries: journal.map((entry) => ({
        id: entry.id,
        dayLabel: String(entry.date.getDate()),
        // `month: "short"` в разных сборках ICU даёт то «июл.», то «июль» — рядом
        // с числом это читается как «21 июль». Фиксируем сокращения явно.
        monthLabel: SHORT_MONTHS_RU[entry.date.getMonth()],
        fullDateLabel: entry.date.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" }),
        question: entry.question,
        own: entry.own,
        perspective: entry.perspective,
        step: entry.step,
      })),
      practitioner: practitioner ? {
        name: practitioner.user.name ?? "Специалист", title: practitioner.title,
        price: formatSessionFloor(practitioner.pricePerSession),
        href: `/miniapp/practitioners/${practitioner.slug}`,
        avatar: practitioner.user.avatarUrl?.startsWith("/") ? practitioner.user.avatarUrl : null,
      } : null,
      bookings: [...bookings].sort((left, right) => {
        const now = Date.now();
        const leftAt = left.slot?.startAt.getTime() ?? left.createdAt.getTime();
        const rightAt = right.slot?.startAt.getTime() ?? right.createdAt.getTime();
        const leftUpcoming = ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(left.status) && leftAt >= now;
        const rightUpcoming = ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(right.status) && rightAt >= now;
        if (leftUpcoming !== rightUpcoming) return leftUpcoming ? -1 : 1;
        return leftUpcoming ? leftAt - rightAt : rightAt - leftAt;
      }).map((booking) => {
        const start = booking.slot?.startAt ?? null;
        const canJoin = canJoinBooking({
          status: booking.status,
          slot: booking.slot ? {
            startAt: booking.slot.startAt.toISOString(),
            endAt: booking.slot.endAt.toISOString(),
          } : null,
        });
        return {
          id: booking.id,
          practitioner: booking.practitioner.user.name ?? "Специалист",
          status: getBookingStatus(booking.status).label,
          date: start ? start.toLocaleDateString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : "Время уточняется",
          price: `${booking.priceRub.toLocaleString("ru-RU")} ₽`,
          canJoin,
        };
      }),
      materials: materials.map((material) => ({
        id: material.id,
        practitioner: material.practitioner.user.name ?? "Ваш специалист",
        preview: material.text.slice(0, 180),
        date: relativeDate(material.sentAt),
        unread: !material.readAt,
        attachmentName: material.attachmentName,
      })),
      profileNotice: unreadNotifications > 0 || materials.some((material) => !material.readAt),
      upcomingBookingLabel: bookings.find((booking) => booking.slot?.startAt && booking.slot.startAt > new Date() && ["PENDING", "CONFIRMED"].includes(booking.status))?.slot?.startAt.toLocaleDateString("ru-RU", {
        day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
      }) ?? null,
      streak: effectivePracticeStreak(streak.count, streak.lastDoneDate),
      completedWeekdays: weekCards.map((card) => card.cardDate.getDay()),
      // B678: карта дня. Трактовка берётся ТОЛЬКО из общего кэша
      // (`allowGenerate: false`) — первый экран мини-аппа не имеет права ждать
      // модель; если развёрнутого текста ещё нет, показывается значение колоды.
      tarotDay,
    };
  } catch (error) {
    log.warn("miniapp.initial_data_failed", { error: serializeError(error) });
    return { ...fallback, loadError: true };
  }
}
