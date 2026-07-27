export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight, CheckCircle2, ChevronDown, Clock, Gift, LifeBuoy, Plus, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import { PinBlurGate } from "@/components/cabinet/pin-blur-gate";
import db from "@/lib/db";
import { getClarityCreditBalance } from "@/lib/clarity-credits";
import { pointsWord } from "@/lib/points";
import { listMissionChecklist } from "@/lib/missions";
import { getPracticeStreakSnapshot } from "@/lib/streaks";
import { effectivePracticeStreak } from "@/lib/streak-display";
import { dialogueTopicLabelRu } from "@/lib/dialogue-router";
import {
  buildDiaryCard,
  buildServiceNudge,
  buildUsageRecommendations,
  daySeed,
  planPractitionerCard,
  type CabinetSignals,
} from "@/lib/cabinet-recommendations";
import {
  getProductLabel,
  getProductRoute,
  getSubscriptionPlanLabel,
  getSubscriptionStatusLabel,
} from "@/lib/billing-labels";
import { getReferralStats } from "@/lib/referral-stats";
import { adminUrl, appUrl, loginUrl, mainUrl } from "@/lib/subdomain";
import { log, serializeError } from "@/lib/logger";

type RecommendedPractitioner = {
  slug: string;
  name: string;
  title: string;
  pricePerSession: number;
};

// G5/B464 round-4 #5: fill the "живой разговор" slot with a specialist —
// theme-matched (categories) when the engine asks for it, otherwise the single
// best-ranked ACTIVE + verified practitioner. A DB hiccup must never crash the
// cabinet: on any failure we render nothing.
async function loadRecommendedPractitioner(categories: string[] = []): Promise<RecommendedPractitioner | null> {
  try {
    const row = await db.practitioner.findFirst({
      where: {
        status: "ACTIVE",
        verified: true,
        ...(categories.length > 0 ? { categories: { hasSome: categories } } : {}),
      },
      orderBy: [{ founding: "desc" }, { reviewCount: "desc" }, { ratingSum: "desc" }],
      select: {
        slug: true,
        title: true,
        pricePerSession: true,
        user: { select: { name: true } },
      },
    });
    if (!row) return null;
    return {
      slug: row.slug,
      name: row.user.name ?? "Специалист",
      title: row.title,
      pricePerSession: row.pricePerSession,
    };
  } catch (error) {
    log.warn("cabinet.recommended_practitioner_fallback", { error: serializeError(error) });
    return null;
  }
}

export default async function ClientCabinetPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  const role = session.user?.role ?? "CLIENT";
  if (role === "PRACTITIONER") redirect("/cabinet/practitioner");
  if (role === "ADMIN" || role === "SUPERADMIN") redirect(adminUrl("/admin"));

  if (!session.user?.id) {
    redirect(loginUrl());
  }
  const userId = session.user.id;

  const [recentDialogues, recentResults, upcomingBooking, lastPastBooking, activeSubscription, dialogueCount, productCount, activeRoutes, todayCard, clarityCredits, topicGroups, journalTotal, missionChecklist, practiceStreak, referralStats, nearestCreditExpiry, awaitingEntitlements] = await Promise.all([
    db.dialogue.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: { id: true, title: true, status: true, topic: true, updatedAt: true, safetyLevel: true, metadata: true },
    }),
    // Готовые разборы нужны рекомендательному движку: он предлагает то, что
    // примыкает к уже пройденному. Показывает их «Дневник» (B602).
    db.productResult.findMany({
      where: { userId, deletedAt: null, status: "READY" },
      orderBy: { updatedAt: "desc" },
      take: 8,
      select: { id: true, title: true, productKey: true, updatedAt: true, metadata: true },
    }),
    // B326: "ближайшая встреча" must be a real future appointment. The booking
    // time lives on its TimeSlot — filter slot.startAt > now AND active statuses.
    db.booking.findFirst({
      where: {
        clientId: userId,
        status: { in: ["PENDING", "CONFIRMED"] },
        slot: { startAt: { gt: new Date() } },
      },
      orderBy: { slot: { startAt: "asc" } },
      include: {
        practitioner: { include: { user: { select: { name: true } } } },
        slot: { select: { startAt: true } },
      },
    }),
    // B464 round-4 #5: the practitioner card is booking-aware — «продолжить с
    // тем же специалистом» while the theme matches their categories.
    db.booking.findFirst({
      where: { clientId: userId, status: "COMPLETED" },
      orderBy: { slot: { startAt: "desc" } },
      select: {
        practitioner: {
          select: { slug: true, categories: true, user: { select: { name: true } } },
        },
      },
    }),
    db.userSubscription.findFirst({
      where: {
        userId,
        status: { in: ["TRIALING", "ACTIVE", "PAST_DUE"] },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
      },
      orderBy: { createdAt: "desc" },
      select: { planKey: true, status: true, currentPeriodEnd: true, cancelAtPeriodEnd: true },
    }),
    db.dialogue.count({ where: { userId, deletedAt: null } }),
    db.productResult.count({ where: { userId, deletedAt: null } }),
    db.clarityRoute.findMany({
      where: { userId, status: { in: ["ACTIVE", "PAUSED"] } },
      orderBy: { updatedAt: "desc" },
      take: 2,
      select: { id: true, title: true, status: true, currentDay: true },
    }),
    // B602: «вопрос дня» целиком переехал на «Дневник» (тот же
    // `DailyPracticeActions`, полоса недели и кольцо серии) — на Главной он был
    // второй копией. Здесь остаётся только признак «сегодня уже отвечено»,
    // который нужен рекомендательному движку. Карточку дня создаёт «Дневник»,
    // Главная её только читает — открытие Главной не должно ничего заводить.
    db.dailyCard.findFirst({
      where: { userId, cardDate: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
      select: { completedAt: true },
    }).catch(() => null),
    getClarityCreditBalance(userId),
    // Count dialogues per topic across ALL history so the service-nudge can key
    // off the dominant theme.
    db.dialogue.groupBy({
      by: ["topic"],
      where: { userId, deletedAt: null, topic: { not: null } },
      _count: { _all: true },
    }),
    db.dailyCard.count({ where: { userId, completedAt: { not: null } } }),
    listMissionChecklist(userId),
    getPracticeStreakSnapshot(userId),
    getReferralStats(userId),
    // B512 §3.5 (P6): ближайшее истечение подтверждённых начислений — для
    // тёплой строки «баллы действуют до …» (честно, без countdown-таймера).
    db.clarityCreditLedgerEntry.findFirst({
      where: { userId, status: "confirmed", type: "grant", expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: "asc" },
      select: { expiresAt: true },
    }).catch(() => null),
    // INC-087: оплаченные и ещё НЕ израсходованные доступы. Владелец заплатил
    // 299 ₽ за «Переосмысление», доступ был выдан — и не был виден нигде: ни в
    // кабинете, ни в админке. С его стороны это выглядело как пропавшие деньги.
    db.productEntitlement.findMany({
      where: { userId, status: "ACTIVE", consumedAt: null, revokedAt: null, source: "purchase" },
      orderBy: { createdAt: "desc" },
      take: 3,
      select: { id: true, productKey: true },
    }).catch(() => []),
  ]);

  const firstName = session.user?.name?.split(" ")[0] ?? "пользователь";
  const subscriptionLabel = getSubscriptionPlanLabel(activeSubscription?.planKey);
  const subscriptionStatus = activeSubscription
    ? activeSubscription.cancelAtPeriodEnd
      ? "Отменяется в конце периода"
      : getSubscriptionStatusLabel(activeSubscription.status)
    : "Базовый доступ";

  // B464: crisis-guard — if the latest разбор was flagged sensitive/crisis/blocked
  // (lib/dialogue-safety.ts), suppress ALL monetization (offers, service-nudge,
  // referral, subscription) and lead with calm continuity + support. Safety above
  // monetization (doc 18 §23.3).
  const latestSafety = recentDialogues[0]?.safetyLevel ?? null;
  const crisisGuard = latestSafety === "sensitive" || latestSafety === "crisis" || latestSafety === "blocked";
  const showMonetization = !crisisGuard;

  const currentTopicKey = [...topicGroups].sort((a, b) => b._count._all - a._count._all)[0]?.topic ?? null;
  const currentTheme = currentTopicKey ? dialogueTopicLabelRu(currentTopicKey) : null;

  // B464 round-4 (items 2·4·5): the deterministic, day-seeded recommendation
  // engine — see lib/cabinet-recommendations.ts. Every block below derives from
  // one signals snapshot so the surfaces rotate together and never freeze on a
  // single suggestion.
  const now = new Date();
  // Round-5 #6a: показываем только ЖИВУЮ серию (последняя отметка сегодня или
  // вчера); stale-счётчик из БД без активной серии читается как «Серия: 1» и
  // вводит в заблуждение.
  const liveStreak = effectivePracticeStreak(practiceStreak.count, practiceStreak.lastDoneDate, now);
  const diaryTopicCounts: Record<string, number> = Object.fromEntries(
    topicGroups
      .filter((group) => group.topic)
      .map((group) => [group.topic as string, group._count._all]),
  );
  const lastDialogue = recentDialogues[0];
  const signals: CabinetSignals = {
    topicCounts: diaryTopicCounts,
    lastDialogue: lastDialogue
      ? {
          id: lastDialogue.id,
          title: lastDialogue.title,
          status: lastDialogue.status,
          topic: lastDialogue.topic,
          ageHours: Math.max(0, (now.getTime() - lastDialogue.updatedAt.getTime()) / 3_600_000),
        }
      : null,
    activeRoute: activeRoutes[0]
      ? { title: activeRoutes[0].title, status: activeRoutes[0].status, currentDay: activeRoutes[0].currentDay }
      : null,
    recentProductKeys: [...new Set(recentResults.map((result) => result.productKey))],
    hasUpcomingBooking: Boolean(upcomingBooking),
    lastPastBooking: lastPastBooking
      ? {
          practitionerName: lastPastBooking.practitioner.user.name ?? "Специалист",
          practitionerSlug: lastPastBooking.practitioner.slug,
          categories: lastPastBooking.practitioner.categories,
        }
      : null,
    journal: {
      total: journalTotal,
      entryToday: Boolean(todayCard?.completedAt),
      streak: liveStreak,
    },
    crisisGuard,
  };
  const seed = daySeed(userId, now);

  // B602 ряд 3 слева: «Рекомендуем вам» — по УЖЕ ПРОЙДЕННЫМ разборам.
  const usageRecommendations = buildUsageRecommendations(signals, seed);
  const serviceNudge = buildServiceNudge(signals, seed);
  const serviceNudgeHref = serviceNudge
    ? serviceNudge.surface === "app" ? appUrl(serviceNudge.route) : mainUrl(serviceNudge.route)
    : null;
  const diaryCardReco = buildDiaryCard(signals, seed);
  const practitionerPlan = planPractitionerCard(signals);
  // The practitioner card needs a DB pick only for theme-match/explore modes.
  const recommendedPractitioner = practitionerPlan && practitionerPlan.mode !== "continue"
    ? await loadRecommendedPractitioner(practitionerPlan.mode === "theme-match" ? practitionerPlan.categories : [])
    : null;

  const missionHref = (href: string) => (
    href.startsWith("/cabinet") ? appUrl(href.replace(/^\/cabinet/, "")) : mainUrl(href)
  );

  // Quiet subscription offer only when the client has enough history to benefit
  // (value before paywall) and is not already subscribed. Otherwise the card
  // just states the current plan.
  const subscriptionQualified = showMonetization && !activeSubscription && (dialogueCount >= 2 || productCount >= 2);

  // INC-087: оплаченный, но ещё не сделанный разбор. «Оплачено, ждёт вас» —
  // это состояние товара, а не сбой, и человек должен видеть его там же, где
  // видит баланс, а не искать в письмах.
  const awaitingAccess = awaitingEntitlements
    .map((row) => ({ id: row.id, label: getProductLabel(row.productKey), route: getProductRoute(row.productKey) }))
    .filter((row): row is { id: string; label: string; route: string } => Boolean(row.route));

  // B512 (P6): warm expiry line for the Home wallet cue.
  const creditExpiryLabel = clarityCredits > 0 && nearestCreditExpiry?.expiresAt
    ? nearestCreditExpiry.expiresAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })
    : null;

  return (
    <div className="max-w-6xl px-4 py-6 sm:px-6 md:py-8" style={{ paddingBottom: 80 }}>

      {/* ─── Приветствие. B602: пилюля баланса `client-dashboard-balance` снята
          по прямому указанию владельца — баланс живёт в карточке «Кошелёк»
          первого ряда и в верхнем баре мобильного, третья копия не нужна. ─── */}
      <section data-testid="client-primary-action">
        <p className="soft-eyebrow">с возвращением</p>
        <h1 className="soft-h1 mt-2">
          <span className="soft-italic">{firstName}</span>, ваша работа продолжается
        </h1>
      </section>

      {/* ═══════ РЯД 1 — подписка · кошелёк · подарите разбор ═══════
          ТЗ владельца, п. 9.1. Сетка без `items-start`: именно она делала
          «мозаику» — карточки разной высоты в одной строке. Здесь высоты
          выравниваются по ряду.
          Кризис: ряд схлопывается до «Кошелька». Баланс — факт, а подписка и
          приглашение — предложения; человеку в кризисе платформа не продаёт. */}
      <div
        className={`mt-5 grid gap-4 ${showMonetization ? "md:grid-cols-3" : ""}`}
        data-testid="client-home-row-1"
      >
        {/* Подписка */}
        {showMonetization && (subscriptionQualified ? (
          <section
            className="soft-card relative flex flex-col overflow-hidden p-5"
            data-testid="client-subscription-status"
            style={{ background: "linear-gradient(155deg, #6B3030, var(--soft-bordeaux) 70%)", border: "1px solid transparent", boxShadow: "0 18px 40px -22px rgba(92, 42, 44, 0.9)" }}
          >
            <p className="soft-eyebrow flex items-center gap-1.5" style={{ color: "#E9C9B6" }}>
              <Sparkles className="size-3 shrink-0" aria-hidden="true" />
              подписка
            </p>
            <h2 className="mt-2.5 font-heading text-lg font-semibold" style={{ color: "#FBF1E4" }}>
              В подписке — больше баллов каждый месяц
            </h2>
            <p className="mt-2 text-[12.5px] leading-relaxed" style={{ color: "rgba(251, 241, 228, 0.84)" }}>
              Pro — <b style={{ color: "#F1D9A6", fontWeight: 600 }}>20 разборов в месяц</b> и расширенный дневник.
            </p>
            <div className="mt-auto pt-4">
              <Link
                href={appUrl("/wallet")}
                className="inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 text-[13px] font-semibold"
                style={{ background: "#FBF1E4", color: "var(--soft-bordeaux)" }}
              >
                Сравнить тарифы <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-3 text-[11px]" style={{ color: "rgba(251, 241, 228, 0.6)" }}>
              Сейчас: {subscriptionLabel}
            </p>
          </section>
        ) : (
          <section className="soft-card flex flex-col p-5" data-testid="client-subscription-status">
            <p className="soft-eyebrow">подписка</p>
            <p className="mt-2" style={{ fontFamily: "var(--font-heading-v4, serif)", fontSize: 22, color: "var(--soft-bordeaux)", fontWeight: 500 }}>{subscriptionLabel}</p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
              {subscriptionStatus}
              {activeSubscription?.currentPeriodEnd
                ? ` · до ${activeSubscription.currentPeriodEnd.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`
                : ""}
            </p>
            <div className="mt-auto pt-4"><Link href={appUrl("/wallet")} className="soft-chip min-h-11 w-fit">Управлять →</Link></div>
          </section>
        ))}

        {/* Кошелёк */}
        <section className="soft-card flex flex-col p-5" data-testid="client-home-wallet-card">
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="soft-eyebrow">кошелёк</p>
            <Link href={appUrl("/wallet")} className="text-xs font-semibold" style={{ color: "var(--soft-ink-soft)" }}>
              Подробнее →
            </Link>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-heading text-[26px] font-semibold leading-none" style={{ color: "var(--soft-bordeaux)" }}>{clarityCredits}</span>
            <span className="text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>{pointsWord(clarityCredits)} на балансе</span>
          </div>
          {/* INC-087: оплачено — но разбор ещё не сделан. Это состояние ждало
              человека молча: в кабинете его не было, в админке тоже. */}
          {awaitingAccess.map((access) => (
            <Link
              key={access.id}
              href={mainUrl(access.route)}
              className="mt-2.5 flex items-center justify-between gap-2 rounded-[10px] px-2.5 py-2 text-[12px] font-semibold no-underline"
              data-testid="client-awaiting-access"
              style={{ background: "#FBF3EC", border: "1.5px solid var(--soft-terracotta)", color: "var(--soft-bordeaux)" }}
            >
              <span className="min-w-0 truncate">Оплачено: «{access.label}» — разбор ещё не сделан</span>
              <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
            </Link>
          ))}
          {creditExpiryLabel && (
            <p
              className="mt-2.5 inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px]"
              data-testid="client-credit-expiry"
              style={{ background: "var(--soft-amber-bg, #F2E2C2)", color: "var(--soft-amber-ink, #6E5114)" }}
            >
              <Clock className="size-3 shrink-0" aria-hidden="true" />
              Баллы действуют до {creditExpiryLabel}
            </p>
          )}
          <div className="mt-auto pt-4">
            <Link
              href={appUrl("/wallet")}
              className="flex items-center justify-center gap-2 rounded-[12px] border-[1.5px] border-[var(--soft-terracotta)] px-4 py-2.5 text-[13px] font-semibold transition-colors hover:bg-[#F6E7DD]"
              style={{ background: "#FBF3EC", color: "var(--soft-bordeaux)" }}
            >
              <Plus className="size-4" aria-hidden="true" />
              Пополнить баллы
            </Link>
          </div>
        </section>

        {/* Подарите разбор — ТЗ владельца: «только этот блок нужно сделать очень
            компактным», два поясняющих абзаца убраны. Остались счётчики и CTA. */}
        {showMonetization && (
          <section
            className="soft-card flex flex-col p-5"
            data-testid="client-referral-card"
            style={{ background: "linear-gradient(155deg, var(--soft-apricot) 0%, #F8E6D1 100%)", border: "1px solid transparent" }}
          >
            <p className="soft-eyebrow">подарите разбор — получите баллы</p>
            <div className="mt-3 flex gap-6">
              {[
                { n: referralStats.invited, label: "приглашены" },
                { n: referralStats.tried, label: "попробовали" },
                { n: referralStats.stayed, label: "остались" },
              ].map((s) => (
                <div key={s.label}>
                  <p className="soft-italic" style={{ fontSize: 22, color: "var(--soft-bordeaux)" }}>{s.n}</p>
                  <p className="text-[11px]" style={{ color: "var(--soft-ink-soft)" }}>{s.label}</p>
                </div>
              ))}
            </div>
            <div className="mt-auto pt-4">
              <Link href={appUrl("/invite")} className="soft-button soft-button-primary w-fit shrink-0">
                <Gift className="size-4" aria-hidden="true" /> Пригласить друга
              </Link>
            </div>
          </section>
        )}
      </div>

      {/* Кризисный режим: спокойная преемственность вместо ряда продаж. */}
      {crisisGuard && (
        <section className="soft-card mt-4 p-5" data-testid="client-crisis-continuity">
          <h2 className="soft-h3">Вы можете вернуться к этому в своём темпе</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
            Здесь нет спешки. Если сейчас тяжело — рядом есть живая поддержка.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link href={appUrl("/support")} className="soft-button soft-button-primary shrink-0">
              <LifeBuoy className="size-4" aria-hidden="true" /> Поддержка
            </Link>
            {lastDialogue && (
              <Link href={mainUrl(`/checkin?dialogueId=${lastDialogue.id}`)} className="soft-button soft-button-ghost shrink-0">
                Вернуться к разговору
              </Link>
            )}
          </div>
        </section>
      )}

      {/* ═══════ РЯД 2 — «Первые шаги» ═══════
          ТЗ владельца, п. 9.2: свёрнут по умолчанию, прогресс-бар, карточки в
          один ряд, в карточке — только короткий текст действия, пройденные
          помечены галочкой и НЕ кликабельны. */}
      {missionChecklist.completedCount < missionChecklist.totalCount && (
        <details className="soft-card mt-4 p-5" data-testid="client-first-steps" open={false}>
          <summary className="group flex cursor-pointer list-none flex-wrap items-start justify-between gap-4 [&::-webkit-details-marker]:hidden">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="soft-eyebrow">первые шаги</p>
                <span className="text-[12px] tabular-nums" style={{ color: "var(--soft-ink-soft)" }}>
                  {missionChecklist.completedCount} из {missionChecklist.totalCount} · +{missionChecklist.totalRewardCredits} {pointsWord(missionChecklist.totalRewardCredits)}
                </span>
              </div>
              {/* Прогресс-бар. Раньше здесь стояла фраза про «немного
                  осталось» даже при нуле пройденных шагов — прямая неправда. */}
              <div
                className="mt-2.5 h-2 w-full overflow-hidden rounded-full"
                style={{ background: "var(--soft-paper-deep)" }}
                role="progressbar"
                aria-valuenow={missionChecklist.completedCount}
                aria-valuemin={0}
                aria-valuemax={missionChecklist.totalCount}
                aria-label="Прогресс первых шагов"
                data-testid="client-first-steps-progress"
              >
                <span
                  className="block h-full rounded-full transition-[width]"
                  style={{
                    width: `${Math.round((missionChecklist.completedCount / Math.max(1, missionChecklist.totalCount)) * 100)}%`,
                    background: "var(--soft-terracotta-dark)",
                  }}
                />
              </div>
              <span className="soft-chip mt-3 inline-flex items-center gap-1.5" data-testid="client-first-steps-cta">
                <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" />
                <span className="group-open:hidden">Показать шаги</span>
                <span className="hidden group-open:inline">Свернуть</span>
              </span>
            </div>
          </summary>
          {/* Один ряд. На узком экране — горизонтальная прокрутка, а не перенос
              в сетку: «в один ряд» перестаёт быть рядом при переносе. */}
          <div className="-mx-1 mt-4 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
            {missionChecklist.items.map((mission) => {
              const body = (
                <>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--soft-ink-faint)" }}>
                      +{mission.rewardCredits} {pointsWord(mission.rewardCredits)}
                    </span>
                    {mission.completed ? (
                      <CheckCircle2 className="size-4 text-[var(--soft-sage)]" aria-hidden="true" />
                    ) : (
                      <span className="size-2 rounded-full bg-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                    )}
                  </div>
                  <p className="mt-2 text-sm font-semibold leading-snug">{mission.title}</p>
                </>
              );
              const shell = "w-[180px] shrink-0 snap-start rounded-[14px] border border-[var(--soft-paper-edge)] p-4 no-underline";
              const tone = {
                background: mission.completed ? "var(--soft-paper-deep)" : "var(--soft-paper-card)",
                color: "var(--soft-ink)",
                opacity: mission.completed ? 0.7 : 1,
              };
              // Пройденный шаг — не ссылка: вести человека туда, где уже нечего
              // делать, значит обещать действие, которого нет.
              return mission.completed ? (
                <div key={mission.key} className={shell} style={tone} data-testid={`client-mission-${mission.key}`} data-completed="1">
                  {body}
                </div>
              ) : (
                <Link key={mission.key} href={missionHref(mission.actionHref)} className={shell} style={tone} data-testid={`client-mission-${mission.key}`} data-completed="0">
                  {body}
                </Link>
              );
            })}
          </div>
        </details>
      )}

      {/* ═══════ РЯД 3 — «Рекомендуем вам» · «Если хочется живого разговора» ═══
          ТЗ владельца, п. 9.4: «в этом же ряду ТОЙ ЖЕ ВЫСОТЫ». */}
      <div className="mt-4 grid gap-4 md:grid-cols-2" data-testid="client-home-row-3">
        {usageRecommendations.length > 0 && (
          <section className="soft-card flex flex-col p-5" data-testid="client-recommendations">
            <p className="soft-eyebrow">рекомендуем вам</p>
            <div className="mt-3 grid gap-2">
              {usageRecommendations.map((item) => (
                <Link
                  key={item.productKey ?? item.route}
                  href={item.surface === "app" ? appUrl(item.route) : mainUrl(item.route)}
                  className="flex items-center justify-between gap-3 rounded-[12px] border border-[var(--soft-paper-edge)] px-3.5 py-3 no-underline transition-colors hover:bg-[var(--soft-paper-deep)]"
                  data-recommendation-key={item.productKey ?? "start"}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold" style={{ color: "var(--soft-ink)" }}>{item.title}</span>
                    <span className="mt-0.5 block truncate text-[11.5px]" style={{ color: "var(--soft-ink-faint)" }}>{item.reason}</span>
                  </span>
                  <ArrowRight className="size-4 shrink-0" style={{ color: "var(--soft-terracotta)" }} aria-hidden="true" />
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* «Если хочется живого разговора» — автомат из четырёх состояний:
            при существующей брони рекомендовать бронь было бы ошибкой. */}
        <PinBlurGate label="Работа со специалистом">
        {upcomingBooking ? (
          <section className="soft-card flex h-full flex-col p-5" style={{ borderLeft: "3px solid var(--soft-bordeaux)" }} data-testid="client-next-meeting">
            <p className="soft-eyebrow">ближайшая встреча</p>
            <p className="mt-2" style={{ fontSize: 15, fontWeight: 600, color: "var(--soft-ink)" }}>{upcomingBooking.practitioner.user.name}</p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
              {upcomingBooking.slot
                ? `${upcomingBooking.slot.startAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, ${upcomingBooking.slot.startAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · `
                : ""}
              {upcomingBooking.status === "CONFIRMED" ? "подтверждено" : "ожидает подтверждения"}
            </p>
            <div className="mt-auto pt-4"><Link href={appUrl("/bookings")} className="soft-button soft-button-ghost w-fit shrink-0">К записи</Link></div>
          </section>
        ) : practitionerPlan?.mode === "continue" && practitionerPlan.continueWith && showMonetization ? (
          <section className="soft-card flex h-full flex-col p-5" data-testid="client-practitioner-suggestion" data-practitioner-mode="continue">
            <p className="soft-eyebrow">продолжить работу со специалистом</p>
            {/* Имя в именительном падеже — произвольные ФИО нельзя надёжно склонять. */}
            <p className="soft-h3 mt-2" style={{ color: "var(--soft-bordeaux)" }}>
              {practitionerPlan.continueWith.name} уже знает вашу историю — можно продолжить в своём темпе
            </p>
            <p className="mt-2 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
              {practitionerPlan.topicLabel
                ? `Тема «${practitionerPlan.topicLabel}» всё ещё рядом — регулярные встречи помогают удержать найденное.`
                : "Регулярные встречи помогают удержать найденное."}
            </p>
            <div className="mt-auto pt-4"><Link href={mainUrl(`/practitioners/${practitionerPlan.continueWith.slug}`)} className="soft-button soft-button-primary w-fit shrink-0">Записаться снова</Link></div>
          </section>
        ) : recommendedPractitioner && showMonetization ? (
          <section className="soft-card flex h-full flex-col p-5" data-testid="client-practitioner-suggestion" data-practitioner-mode={practitionerPlan?.mode ?? "explore"}>
            <p className="soft-eyebrow">если хочется живого разговора</p>
            <p className="soft-h3 mt-2" style={{ color: "var(--soft-bordeaux)" }}>
              {practitionerPlan?.mode === "theme-match" && practitionerPlan.topicLabel
                ? `Тема «${practitionerPlan.topicLabel}» — можно обсудить со специалистом этого направления`
                : currentTheme
                  ? `Тема «${currentTheme}» возвращается — может, обсудить с человеком?`
                  : "Можно обсудить ваш вопрос со специалистом"}
            </p>
            <p className="mt-2 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
              {recommendedPractitioner.name} · {recommendedPractitioner.title} · от {recommendedPractitioner.pricePerSession.toLocaleString("ru-RU")} ₽
            </p>
            <div className="mt-auto pt-4"><Link href={mainUrl(`/practitioners/${recommendedPractitioner.slug}`)} className="soft-button soft-button-primary w-fit shrink-0">Записаться</Link></div>
          </section>
        ) : (
          <section className="soft-card flex h-full flex-col p-5" data-testid="client-support-card">
            <p className="soft-eyebrow">рядом, если нужно</p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>Живой разговор со специалистом всегда доступен — спокойно, в своём темпе.</p>
            <div className="mt-auto pt-4"><Link href={mainUrl("/practitioners")} className="soft-button soft-button-ghost w-fit shrink-0">Посмотреть специалистов</Link></div>
          </section>
        )}
        </PinBlurGate>
      </div>

      {/* ═══════ РЯД 4 — «Ваш дневник» · «Что дальше по вашей теме» ═══════
          ТЗ владельца, п. 9.5: «в один ряд одной высоты». */}
      <div className="mt-4 grid gap-4 md:grid-cols-2" data-testid="client-home-row-4">
        <PinBlurGate label="Ваш дневник">
        <div className="soft-card flex h-full flex-col p-5" data-testid="client-map-preview">
          <div className="min-w-0">
            <p className="soft-eyebrow mb-2">ваш дневник</p>
            <p className="soft-italic" style={{ fontSize: 16, color: "var(--soft-ink-soft)", lineHeight: 1.5 }}>
              {diaryCardReco.text}
            </p>
          </div>
          <div className="pt-4"><Link href={appUrl("/diary")} className="soft-button soft-button-ghost w-fit shrink-0">{diaryCardReco.ctaLabel}</Link></div>
        </div>
        </PinBlurGate>

        {showMonetization && serviceNudge && serviceNudgeHref ? (
          <PinBlurGate label="Что дальше по вашей теме">
          <div
            className="soft-card flex h-full flex-col p-5"
            data-testid="diary-recommendation"
            data-nudge-key={serviceNudge.key}
            style={{ background: "linear-gradient(155deg, #FBF8FE 0%, var(--soft-lilac-bg, #EFEAF6) 100%)", border: "1px solid rgba(168,155,201,0.28)" }}
          >
            <p className="soft-eyebrow" style={{ color: "#6E5BA6" }}>что дальше по вашей теме</p>
            <p className="soft-h3 mt-2 font-normal" style={{ color: "#43356E", lineHeight: 1.4 }}>
              {serviceNudge.body}
            </p>
            <div className="mt-auto flex flex-wrap items-center gap-3 pt-4">
              <Link href={serviceNudgeHref} className="soft-button shrink-0" style={{ background: "var(--soft-lilac, #A89BC9)", color: "#fff", fontSize: 13 }} data-testid="diary-recommendation-cta">
                {serviceNudge.ctaLabel}
              </Link>
              <Link href={mainUrl("/practitioners")} className="soft-button soft-button-ghost shrink-0" style={{ fontSize: 13 }}>
                Подобрать специалиста
              </Link>
            </div>
          </div>
          </PinBlurGate>
        ) : null}
      </div>
    </div>
  );
}
