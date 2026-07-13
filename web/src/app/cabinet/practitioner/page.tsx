export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Inbox, Plus, ShieldAlert, Sparkles, Video } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { canJoinBooking, bookingDurationMin } from "@/lib/booking-actions";
import { getPractitionerAiQuota } from "@/lib/practitioner-ai-quota-db";
import { practitionerTierBadge, practitionerTierFromPlanKey } from "@/lib/practitioner-tier";
import { getActivePractitionerPlanKey } from "@/lib/practitioner-entitlements";
import {
  formatMskDayLong,
  formatMskDayLongWeekdayFirst,
  formatMskDayMonth,
  formatMskMonthName,
  formatMskTime,
  mskDayRange,
  mskHour,
} from "@/lib/msk-time";
import { mskMonthRange } from "@/lib/practitioner-ai-quota";
import { appUrl, loginUrl } from "@/lib/subdomain";
import {
  PractitionerTodayMobile,
  type TodayMobileAttentionRow,
} from "./practitioner-today-mobile";

// B466 — «Сегодня»: the Practice-cockpit home. Hero = ближайшая сессия
// (T-30 join gate), затем «требует внимания», расписание дня и метрики.
// Approved mockups: practitioner-cabinet-today.html / practitioner-desktop-today.html.

const STATUS_LABELS: Record<string, string> = {
  PENDING: "Профиль на проверке",
  SUSPENDED: "Профиль приостановлен",
  BLOCKED: "Профиль заблокирован",
};

function greetingFor(hour: number): string {
  if (hour >= 5 && hour < 12) return "Доброе утро";
  if (hour >= 12 && hour < 18) return "Добрый день";
  if (hour >= 18 && hour < 23) return "Добрый вечер";
  return "Доброй ночи";
}

function clientLabel(client: { name: string | null; email: string | null }): string {
  return client.name ?? client.email ?? "Клиент";
}

function initialsOf(label: string): string {
  return label
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

function startsInLabel(startAt: Date, now: Date): string {
  const diffMin = Math.round((startAt.getTime() - now.getTime()) / 60000);
  if (diffMin <= 0) return "идёт сейчас";
  if (diffMin < 60) return `через ${diffMin} мин`;
  if (diffMin < 24 * 60) return `сегодня в ${formatMskTime(startAt)}`;
  return formatMskDayMonth(startAt);
}

function AttentionRow({
  href,
  icon,
  tone,
  title,
  badge,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  tone: "warm" | "amber" | "calm";
  title: string;
  badge?: string;
  subtitle: string;
}) {
  const toneStyle =
    tone === "warm"
      ? { background: "#F6E7DD", color: "var(--soft-terracotta-dark)" }
      : tone === "amber"
        ? { background: "var(--soft-amber-bg, #F2E2C2)", color: "var(--soft-amber-ink, #6E5114)" }
        : { background: "var(--soft-paper-deep)", color: "var(--soft-ink-soft)" };
  return (
    <Link href={href} data-testid="practitioner-attention-row" className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={toneStyle}>
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[13.5px] font-medium">
          <span className="truncate">{title}</span>
          {badge && (
            <span className="shrink-0 rounded-md px-1.5 py-px text-[10px] font-semibold" style={{ background: "var(--soft-amber-bg, #F2E2C2)", color: "var(--soft-amber-ink, #6E5114)" }}>
              {badge}
            </span>
          )}
        </span>
        <span className="mt-0.5 block truncate text-xs text-[var(--soft-ink-faint)]">{subtitle}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
    </Link>
  );
}

export default async function PractitionerTodayPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const userId = session.user!.id!;
  const practitioner = await db.practitioner.findUnique({
    where: { userId },
    select: {
      id: true,
      title: true,
      status: true,
      verified: true,
      ratingSum: true,
      reviewCount: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!practitioner) {
    return (
      <div className="px-6 py-8 text-center">
        <h1 className="font-heading text-xl font-bold">Профиль практика не настроен</h1>
        <p className="mt-2 text-sm text-[var(--soft-ink-faint)]">Обратитесь в поддержку: support@eterapy.com</p>
      </div>
    );
  }

  const now = new Date();
  const day = mskDayRange(now);
  const month = mskMonthRange(now);
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const [nextBooking, todayBookings, pendingRequests, freshAnalyses, monthCompleted, weekSessionCount, planKey, quota] =
    await Promise.all([
      db.booking.findFirst({
        where: {
          practitionerId: practitioner.id,
          status: { in: ["CONFIRMED", "IN_PROGRESS"] },
          slot: { endAt: { gte: now } },
        },
        include: { client: { select: { id: true, name: true, email: true } }, slot: true },
        orderBy: { slot: { startAt: "asc" } },
      }),
      db.booking.findMany({
        where: {
          practitionerId: practitioner.id,
          status: { in: ["CONFIRMED", "IN_PROGRESS", "COMPLETED"] },
          slot: { startAt: { gte: day.start, lt: day.end } },
        },
        include: { client: { select: { id: true, name: true, email: true } }, slot: true },
        orderBy: { slot: { startAt: "asc" } },
      }),
      db.booking.findMany({
        where: { practitionerId: practitioner.id, status: "PENDING" },
        include: { client: { select: { name: true, email: true } } },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
      db.videoSession.findMany({
        where: {
          summaryText: { not: null },
          createdAt: { gte: weekAgo },
          booking: { practitionerId: practitioner.id },
        },
        select: {
          bookingId: true,
          booking: { select: { client: { select: { name: true, email: true } } } },
        },
        orderBy: { createdAt: "desc" },
        take: 3,
      }),
      db.booking.findMany({
        where: {
          practitionerId: practitioner.id,
          status: "COMPLETED",
          slot: { startAt: { gte: month.start, lt: month.end } },
        },
        select: { priceRub: true, commissionPercentApplied: true },
      }),
      db.booking.count({
        where: {
          practitionerId: practitioner.id,
          status: "COMPLETED",
          slot: { startAt: { gte: weekAgo } },
        },
      }),
      getActivePractitionerPlanKey(userId),
      getPractitionerAiQuota(practitioner.id, userId),
    ]);

  const heroSessionNumber = nextBooking
    ? (await db.booking.count({
        where: { practitionerId: practitioner.id, clientId: nextBooking.clientId, status: "COMPLETED" },
      })) + 1
    : 0;

  const tier = practitionerTierFromPlanKey(planKey);
  const firstName = practitioner.user.name?.split(" ")[0] ?? "Специалист";
  const rating = practitioner.reviewCount > 0
    ? (practitioner.ratingSum / practitioner.reviewCount).toFixed(1).replace(".", ",")
    : "—";
  const monthIncome = monthCompleted.reduce((sum, b) => {
    const commission = b.commissionPercentApplied ?? 35;
    return sum + (b.priceRub - Math.round(b.priceRub * (commission / 100)));
  }, 0);
  const statusNote = STATUS_LABELS[practitioner.status];
  const canJoinNext = nextBooking
    ? canJoinBooking(
        {
          status: nextBooking.status,
          slot: nextBooking.slot
            ? { startAt: nextBooking.slot.startAt.toISOString(), endAt: nextBooking.slot.endAt.toISOString() }
            : null,
        },
        now.getTime(),
      )
    : false;
  const nextClientLabel = nextBooking ? clientLabel(nextBooking.client) : "";
  const requestNames = pendingRequests.map((b) => clientLabel(b.client).split(" ")[0]).slice(0, 2);
  const freshAnalysisNames = freshAnalyses.map((s) => clientLabel(s.booking.client).split(" ")[0]);
  const quotaPct = quota.included > 0 ? Math.min(100, Math.round((quota.usedThisMonth / quota.included) * 100)) : 0;

  // R9-4 P1: «требует внимания» описывается данными — десктоп рендерит их
  // прежними AttentionRow, мобильный кокпит получает этот же массив как пропсы.
  const attentionData: TodayMobileAttentionRow[] = [
    ...(pendingRequests.length > 0
      ? [
          {
            key: "requests",
            href: appUrl("/practitioner/calendar?tab=requests"),
            tone: "warm" as const,
            icon: "inbox" as const,
            title: `${pendingRequests.length} ${pendingRequests.length === 1 ? "новая заявка" : pendingRequests.length < 5 ? "новые заявки" : "новых заявок"}`,
            subtitle: requestNames.join(" · ") + (pendingRequests.length > 2 ? " · и ещё" : ""),
          },
        ]
      : []),
    ...(freshAnalyses.length > 0
      ? [
          {
            key: "analyses",
            href: appUrl(`/practitioner/sessions/${freshAnalyses[0].bookingId}`),
            tone: "amber" as const,
            icon: "spark" as const,
            title: "AI-разбор готов",
            badge: "AI",
            subtitle: `${freshAnalysisNames.join(" · ")} · резюме и заметки`,
          },
        ]
      : []),
    ...(!practitioner.verified
      ? [
          {
            key: "verification",
            href: appUrl("/practitioner/verification"),
            tone: "calm" as const,
            icon: "shield" as const,
            title: "Верификация не пройдена",
            subtitle: "подтвердите личность и образование",
          },
        ]
      : []),
  ];
  const desktopAttentionIcons: Record<TodayMobileAttentionRow["icon"], React.ReactNode> = {
    inbox: <Inbox className="h-[18px] w-[18px]" />,
    spark: <Sparkles className="h-[18px] w-[18px]" />,
    shield: <ShieldAlert className="h-[18px] w-[18px]" />,
  };

  // Общие для мобайла и десктопа подписи/значения.
  const tierLabel = practitionerTierBadge(tier);
  const displayName = practitioner.user.name ?? practitioner.user.email ?? "Специалист";
  const heroDurationMin = nextBooking?.slot
    ? bookingDurationMin({
        status: nextBooking.status,
        slot: { startAt: nextBooking.slot.startAt.toISOString(), endAt: nextBooking.slot.endAt.toISOString() },
      }) ?? 50
    : 50;
  const todaySessionsLabel = `Сегодня · ${todayBookings.length} ${
    todayBookings.length === 1 ? "сессия" : todayBookings.length > 0 && todayBookings.length < 5 ? "сессии" : "сессий"
  }`;
  const weekSessionsLabel = `${
    weekSessionCount === 1 ? "сессия" : weekSessionCount < 5 && weekSessionCount > 0 ? "сессии" : "сессий"
  } · неделя`;

  const heroMobile = nextBooking?.slot
    ? {
        startsIn: startsInLabel(nextBooking.slot.startAt, now),
        clientInitials: initialsOf(nextClientLabel),
        clientName: nextClientLabel,
        modalityLine: `Индивидуальная сессия · ${heroDurationMin} мин · ${heroSessionNumber}-я сессия`,
        timeRange: `${formatMskTime(nextBooking.slot.startAt)} – ${formatMskTime(nextBooking.slot.endAt)}`,
        canJoin: canJoinNext,
        joinHref: `/session/${nextBooking.id}`,
        cardHref: appUrl(`/practitioner/clients/${nextBooking.client.id}`),
      }
    : null;

  // Мобильные теги расписания — словарь макета: «следующая» / «подтверждено».
  const scheduleMobile = todayBookings.map((b) => {
    const isNext = nextBooking?.id === b.id;
    const kind = b.status === "COMPLETED" ? ("ok" as const) : b.status === "IN_PROGRESS" ? ("live" as const) : isNext ? ("next" as const) : ("ok" as const);
    const label = b.status === "COMPLETED" ? "завершена" : b.status === "IN_PROGRESS" ? "идёт" : isNext ? "следующая" : "подтверждено";
    return {
      id: b.id,
      time: b.slot ? formatMskTime(b.slot.startAt) : "—",
      title: clientLabel(b.client),
      subtitle: `Индивидуальная сессия${b.slot ? ` · ${Math.round((b.slot.endAt.getTime() - b.slot.startAt.getTime()) / 60000)} мин` : ""}`,
      tag: { label, kind },
    };
  });

  const statsMobile = [
    {
      key: "income",
      href: appUrl("/practitioner/finance"),
      value: monthIncome.toLocaleString("ru"),
      unit: "₽",
      label: `доход · ${formatMskMonthName(now)}`,
    },
    {
      key: "sessions",
      href: appUrl("/practitioner/calendar"),
      value: String(weekSessionCount),
      label: weekSessionsLabel,
    },
    {
      key: "rating",
      href: appUrl("/practitioner/reviews"),
      value: rating,
      unit: "★",
      label: `рейтинг · ${practitioner.reviewCount}`,
    },
  ];

  const ctaData =
    tier !== "pro_plus"
      ? {
          href: appUrl("/practitioner/finance?tab=tariff"),
          eyebrow: tier === "free" ? "Тариф · Базовый" : "Тариф · Pro",
          title:
            tier === "free"
              ? "Подключите Pro — AI-разборы и ниже комиссия"
              : "Перейдите на Pro+ — 50 разборов, комиссия 25%",
          body:
            tier === "free"
              ? "AI-заметки, план сопровождения, комиссия от 30% и приоритет в каталоге."
              : "Больше AI-разборов в месяц, приоритет в каталоге и бейдж Pro+.",
          button: tier === "free" ? "Подключить Pro" : "Перейти на Pro+",
        }
      : null;

  const quotaMobile = {
    used: quota.usedThisMonth,
    included: quota.included,
    pct: quotaPct,
    remaining: quota.remaining,
    resetLabel: formatMskDayMonth(quota.periodResetAt),
    manageHref: appUrl("/practitioner/ai-usage"),
  };

  // R9-5 desktop — «строка-ориентир» (approved psychologist element): a calm,
  // server-assembled sentence built from the SAME signals that feed the mobile
  // «Сегодня» (next session · fresh AI summary · pending requests), so the two
  // surfaces can't drift. Each clause drops out when its data is absent.
  const orientationSentences: string[] = [];
  if (nextBooking?.slot) {
    const inLabel = startsInLabel(nextBooking.slot.startAt, now);
    let lead =
      inLabel === "идёт сейчас"
        ? "Сейчас идёт сессия"
        : `Ближайшая встреча — ${inLabel}`;
    if (freshAnalyses.length > 0) {
      lead += ", к ней уже готово AI-резюме прошлой сессии";
    }
    orientationSentences.push(lead);
  } else {
    orientationSentences.push(
      "Сегодня подтверждённых встреч нет — откройте доступность, чтобы клиенты могли записаться",
    );
  }
  if (pendingRequests.length > 0) {
    const n = pendingRequests.length;
    const word = n === 1 ? "новая заявка ждёт" : n < 5 ? "новые заявки ждут" : "новых заявок ждут";
    orientationSentences.push(`${n} ${word} ответа`);
  }
  const orientationLine = `${orientationSentences.join(". ")}.`;

  return (
    <>
      {/* R9-4 P1 — мобильный кокпит 1-в-1 по макету; десктоп ниже остаётся
          прежним до утверждения новых десктоп-макетов (R9-5). */}
      <PractitionerTodayMobile
        appbar={{ initials: initialsOf(displayName), name: displayName, tierLabel, subtitle: practitioner.title }}
        dateLabel={formatMskDayLongWeekdayFirst(now)}
        greeting={`${greetingFor(mskHour(now))}, ${firstName}`}
        statusNote={statusNote}
        hero={heroMobile}
        availabilityHref={appUrl("/practitioner/calendar?tab=availability")}
        attention={attentionData}
        scheduleCountLabel={todaySessionsLabel}
        calendarHref={appUrl("/practitioner/calendar")}
        schedule={scheduleMobile}
        stats={statsMobile}
        cta={ctaData}
        quota={quotaMobile}
      />

    <div className="mx-auto hidden w-full max-w-6xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-today-page">
      {/* Greeting */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="soft-eyebrow">{formatMskDayLong(now)}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2.5">
            <h1 className="soft-h1">
              {greetingFor(mskHour(now))}, <span className="soft-italic">{firstName}</span>
            </h1>
            <span
              className="rounded-full px-2 py-px text-[11px] font-semibold tracking-wide"
              style={{ background: "var(--soft-amber-bg, #F2E2C2)", color: "var(--soft-amber-ink, #6E5114)" }}
            >
              {practitionerTierBadge(tier)}
            </span>
          </div>
          <p className="mt-1 text-sm text-[var(--soft-ink-faint)]">{practitioner.title}</p>
          {statusNote && (
            <p className="mt-1.5 text-sm font-medium" style={{ color: "var(--soft-bordeaux)" }}>{statusNote}</p>
          )}
        </div>
      </div>

      {/* R9-5 — «строка-ориентир»: calm, server-assembled orientation line. */}
      <p
        className="mt-2.5 max-w-2xl text-[15px] leading-relaxed text-[var(--soft-ink-soft)]"
        data-testid="practitioner-today-orientation"
      >
        {orientationLine}
      </p>

      {/* Пульс практики — metrics, each card links into its screen (B466 round-8 #3). */}
      <div className="mt-6 mb-2.5 flex items-baseline justify-between">
        <p className="soft-eyebrow">Пульс практики</p>
        <Link href={appUrl("/practitioner/finance")} className="text-xs text-[var(--soft-ink-soft)]">
          Финансы →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-2.5 lg:grid-cols-4">
        <Link
          href={appUrl("/practitioner/finance")}
          className="soft-card p-3.5 transition-shadow hover:shadow-[0_10px_24px_rgba(60,40,25,.07)]"
          data-testid="practitioner-metric-income"
        >
          <p className="font-heading text-lg leading-tight text-[var(--soft-bordeaux)]">
            {monthIncome.toLocaleString("ru")} <span className="text-xs text-[var(--soft-ink-faint)]">₽</span>
          </p>
          <p className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">доход · {formatMskMonthName(now)}</p>
        </Link>
        <Link
          href={appUrl("/practitioner/calendar")}
          className="soft-card p-3.5 transition-shadow hover:shadow-[0_10px_24px_rgba(60,40,25,.07)]"
          data-testid="practitioner-metric-sessions"
        >
          <p className="font-heading text-lg leading-tight text-[var(--soft-bordeaux)]">{weekSessionCount}</p>
          <p className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">{weekSessionsLabel}</p>
        </Link>
        <Link
          href={appUrl("/practitioner/reviews")}
          className="soft-card p-3.5 transition-shadow hover:shadow-[0_10px_24px_rgba(60,40,25,.07)]"
          data-testid="practitioner-metric-rating"
        >
          <p className="font-heading text-lg leading-tight text-[var(--soft-bordeaux)]">
            {rating} <span className="text-xs text-[var(--soft-ink-faint)]">★</span>
          </p>
          <p className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">рейтинг · {practitioner.reviewCount}</p>
        </Link>
        <Link
          href={appUrl("/practitioner/ai-usage")}
          className="soft-card hidden p-3.5 transition-shadow hover:shadow-[0_10px_24px_rgba(60,40,25,.07)] lg:block"
          data-testid="practitioner-metric-ai"
        >
          <p className="font-heading text-lg leading-tight text-[var(--soft-bordeaux)]">
            {quota.usedThisMonth} <span className="text-xs text-[var(--soft-ink-faint)]">из {quota.included}</span>
          </p>
          <p className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">AI-разборов в месяце</p>
        </Link>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        {/* Left column: hero + timeline */}
        <div className="flex flex-col gap-4">
          {/* Next session hero */}
          {nextBooking?.slot ? (
            <section
              className="soft-card relative overflow-hidden p-4 sm:p-5"
              data-testid="practitioner-next-session"
            >
              <span aria-hidden className="absolute inset-y-0 left-0 w-1" style={{ background: "var(--soft-terracotta)" }} />
              <div className="flex items-center justify-between gap-2">
                <p className="soft-eyebrow">Следующая сессия</p>
                <span className="rounded-full px-2.5 py-1 text-[11.5px] font-semibold" style={{ background: "#F6E7DD", color: "var(--soft-bordeaux)" }}>
                  {startsInLabel(nextBooking.slot.startAt, now)}
                </span>
              </div>
              <div className="mt-3 flex items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--soft-paper-deep)] text-[13px] font-semibold text-[var(--soft-bordeaux)]">
                  {initialsOf(nextClientLabel)}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[15.5px] font-semibold">{nextClientLabel}</p>
                  <p className="mt-0.5 text-[12.5px] text-[var(--soft-ink-faint)]">
                    Индивидуальная сессия · {heroDurationMin} мин · {heroSessionNumber}-я сессия
                  </p>
                </div>
              </div>
              <div className="mt-3.5 flex items-center justify-between gap-2">
                <p className="font-heading text-[19px]">
                  {formatMskTime(nextBooking.slot.startAt)} – {formatMskTime(nextBooking.slot.endAt)}
                </p>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px]" style={{ background: "var(--soft-sage, #E4EADF)", color: "var(--soft-sage-ink, #4B6146)" }}>
                  <Video className="h-3 w-3" />
                  запись включена
                </span>
              </div>
              <div className="mt-4 flex gap-2.5">
                {canJoinNext ? (
                  <a href={`/session/${nextBooking.id}`} className="soft-button soft-button-primary flex-1 justify-center" data-testid="practitioner-join-session">
                    Войти в сессию
                  </a>
                ) : (
                  <span
                    className="soft-button flex-1 cursor-default justify-center opacity-70"
                    style={{ background: "var(--soft-paper-deep)", color: "var(--soft-ink-faint)" }}
                    data-testid="practitioner-join-gated"
                    title="«Войти» откроется за 30 минут до начала"
                  >
                    Войти — за 30 мин до начала
                  </span>
                )}
                <Link href={appUrl(`/practitioner/clients/${nextBooking.client.id}`)} className="soft-button soft-button-ghost shrink-0">
                  Карточка
                </Link>
              </div>
            </section>
          ) : (
            <section className="soft-card p-5" data-testid="practitioner-next-session-empty">
              <p className="soft-eyebrow">Следующая сессия</p>
              <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
                Подтверждённых сессий впереди нет. Проверьте доступность в календаре — клиенты записываются только в открытые часы.
              </p>
              <Link href={appUrl("/practitioner/calendar?tab=availability")} className="soft-button soft-button-ghost mt-4 inline-flex">
                Открыть доступность
              </Link>
            </section>
          )}

          {/* Today timeline */}
          <section className="soft-card p-4 sm:p-5" data-testid="practitioner-today-timeline">
            <div className="mb-3 flex items-baseline justify-between">
              <p className="soft-eyebrow">{todaySessionsLabel}</p>
              <Link href={appUrl("/practitioner/calendar")} className="text-xs text-[var(--soft-ink-soft)]">
                весь день →
              </Link>
            </div>
            {todayBookings.length === 0 ? (
              <p className="text-sm text-[var(--soft-ink-faint)]">На сегодня сессий нет</p>
            ) : (
              <div className="divide-y divide-[var(--soft-paper-deep)]">
                {todayBookings.map((b) => {
                  const isNext = nextBooking?.id === b.id;
                  const tag = b.status === "COMPLETED"
                    ? { label: "завершена", style: { background: "var(--soft-paper-deep)", color: "var(--soft-ink-soft)" } }
                    : b.status === "IN_PROGRESS"
                      ? { label: "идёт", style: { background: "var(--soft-terracotta)", color: "#FBF1E4" } }
                      : isNext
                        ? { label: "следующая", style: { background: "#F6E7DD", color: "var(--soft-bordeaux)", fontWeight: 600 } }
                        : { label: "подтверждена", style: { background: "var(--soft-sage, #E4EADF)", color: "var(--soft-sage-ink, #4B6146)" } };
                  return (
                    <div key={b.id} className="flex items-center gap-3 py-3">
                      <span className="w-12 shrink-0 font-heading text-[15px]">
                        {b.slot ? formatMskTime(b.slot.startAt) : "—"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium">{clientLabel(b.client)}</p>
                        <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
                          Индивидуальная сессия{b.slot ? ` · ${Math.round((b.slot.endAt.getTime() - b.slot.startAt.getTime()) / 60000)} мин` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px]" style={tag.style}>
                        {tag.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>

        {/* Right column: attention + AI quota */}
        <div className="flex flex-col gap-4">
          {attentionData.length > 0 && (
            <section data-testid="practitioner-attention">
              <p className="soft-eyebrow mb-2.5">Требует внимания</p>
              <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
                {attentionData.map((row) => (
                  <AttentionRow
                    key={row.key}
                    href={row.href}
                    icon={desktopAttentionIcons[row.icon]}
                    tone={row.tone}
                    title={row.title}
                    badge={row.badge}
                    subtitle={row.subtitle}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Subscription CTA — upgrade nudge shown until the top tier
              (B466 round-8 #2). R9-1: styled after the mockup `.comm` card
              (practitioner-finance-tariff): FLAT bordeaux, explicit #FBF1E4 /
              #E9C9B6 text (font-heading inherits a dark ink colour — never rely
              on inheritance over the dark card). */}
          {ctaData && (
            <Link
              href={ctaData.href}
              data-testid="practitioner-subscription-cta"
              className="block overflow-hidden rounded-[18px] p-4 transition-shadow hover:shadow-[0_14px_30px_rgba(60,30,20,0.16)] sm:p-5"
              style={{ background: "var(--soft-bordeaux)", color: "#FBF1E4" }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.12em]" style={{ color: "#E9C9B6" }}>
                  {ctaData.eyebrow}
                </p>
                <Sparkles className="h-4 w-4" style={{ color: "#E9C9B6" }} aria-hidden="true" />
              </div>
              <p className="mt-2 font-heading text-[17px] font-semibold leading-snug" style={{ color: "#FBF1E4" }}>
                {ctaData.title}
              </p>
              <p className="mt-1.5 text-[12.5px] leading-relaxed" style={{ color: "rgba(251,241,228,0.82)" }}>
                {ctaData.body}
              </p>
              <span
                className="mt-3.5 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-semibold"
                style={{ background: "#FBF1E4", color: "var(--soft-bordeaux)" }}
              >
                {ctaData.button}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </Link>
          )}

          <section className="soft-card p-4 sm:p-5" data-testid="practitioner-ai-quota-card">
            <p className="soft-eyebrow">Разборы и AI</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">{quota.usedThisMonth}</span>
              <span className="text-[13px] text-[var(--soft-ink-soft)]">из {quota.included} в этом месяце</span>
            </div>
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--soft-paper-deep)]">
              <div className="h-full rounded-full" style={{ width: `${quotaPct}%`, background: "var(--soft-bordeaux)" }} />
            </div>
            <p className="mt-2 text-[11.5px] text-[var(--soft-ink-faint)]">
              Осталось {quota.remaining} · обновится {formatMskDayMonth(quota.periodResetAt)}
            </p>
            {/* R9-5 — top-up CTA (B434 metered): докупка разборов с баланса. */}
            <Link
              href={appUrl("/practitioner/ai-usage")}
              data-testid="practitioner-ai-topup"
              className="mt-3.5 flex items-center justify-center gap-1.5 rounded-full border px-4 py-2 text-[13px] font-semibold transition-colors hover:bg-[var(--soft-bordeaux)] hover:text-[#FBF1E4]"
              style={{ borderColor: "var(--soft-bordeaux)", color: "var(--soft-bordeaux)" }}
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Докупить разборы
            </Link>
          </section>
        </div>
      </div>
    </div>
    </>
  );
}
