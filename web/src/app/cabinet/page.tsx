export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Sparkles, Gift, ArrowRight, LifeBuoy } from "lucide-react";
import { auth } from "@/lib/auth";
import { DailyPracticeActions } from "@/components/cabinet/daily-practice-actions";
import db from "@/lib/db";
import { dailyCardBeats, getOrCreateDailyCard } from "@/lib/daily-card";
import { getClarityCreditBalance } from "@/lib/clarity-credits";
import { pointsWord } from "@/lib/points";
import { listMissionChecklist } from "@/lib/missions";
import { getPracticeStreakSnapshot, STREAK_REWARDS } from "@/lib/streaks";
import { practiceWeekDays, startOfPracticeWeek, WEEKLY_SUMMARY_PRODUCT_KEY } from "@/lib/weekly-summary";
import { getSubscriptionPlanLabel, getSubscriptionStatusLabel } from "@/lib/billing-labels";
import { dialogueTopicLabelRu } from "@/lib/dialogue-router";
import { recommendForDiary, topObservation } from "@/lib/diary-recommendation";
import { getReferralStats } from "@/lib/referral-stats";
import { adminUrl, appUrl, loginUrl, mainUrl } from "@/lib/subdomain";
import { log, serializeError } from "@/lib/logger";

type RecommendedPractitioner = {
  slug: string;
  name: string;
  title: string;
  pricePerSession: number;
};

// G5: when the client has no upcoming booking we still fill the "ближайшая
// встреча" slot with a gentle recommendation to talk to a real specialist —
// the single best-ranked ACTIVE + verified practitioner. A DB hiccup must
// never crash the cabinet: on any failure we render nothing.
async function loadRecommendedPractitioner(): Promise<RecommendedPractitioner | null> {
  try {
    const row = await db.practitioner.findFirst({
      where: { status: "ACTIVE", verified: true },
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

  const [recentDialogues, upcomingBooking, activeSubscription, dialogueCount, productCount, activeRoutes, dailyCardResult, weekCards, weeklySummary, clarityCredits, topicGroups, recommendedPractitioner, missionChecklist, practiceStreak, referralStats] = await Promise.all([
    db.dialogue.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { id: true, title: true, status: true, topic: true, updatedAt: true, safetyLevel: true },
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
    getOrCreateDailyCard(userId),
    // B375: прогресс пн–вс и готовый «итог недели» для блока «Вопрос дня».
    db.dailyCard.findMany({
      where: { userId, completedAt: { not: null }, cardDate: { gte: startOfPracticeWeek() } },
      select: { cardDate: true },
    }),
    db.productResult.findFirst({
      where: { userId, productKey: WEEKLY_SUMMARY_PRODUCT_KEY, createdAt: { gte: startOfPracticeWeek() }, status: "READY" },
      select: { id: true },
    }),
    getClarityCreditBalance(userId),
    // Count dialogues per topic across ALL history so the service-nudge can key
    // off the dominant theme.
    db.dialogue.groupBy({
      by: ["topic"],
      where: { userId, deletedAt: null, topic: { not: null } },
      _count: { _all: true },
    }),
    loadRecommendedPractitioner(),
    listMissionChecklist(userId),
    getPracticeStreakSnapshot(userId),
    getReferralStats(userId),
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

  const sortedTopics = [...topicGroups].sort((a, b) => b._count._all - a._count._all);
  const currentTopicKey = sortedTopics[0]?.topic ?? null;
  const currentTheme = currentTopicKey ? dialogueTopicLabelRu(currentTopicKey) : null;

  // B389 (M26): рекомендательный движок Дневника — одна контекстная рекомендация
  // (the cabinet→services bridge) + a warm, un-quoted self-noticing line.
  const diaryTopicCounts: Record<string, number> = Object.fromEntries(
    topicGroups
      .filter((group) => group.topic)
      .map((group) => [group.topic as string, group._count._all]),
  );
  const diaryRecommendation = recommendForDiary(diaryTopicCounts);
  const diaryRecommendationHref = diaryRecommendation.surface === "app"
    ? appUrl(diaryRecommendation.route.replace(/^\/cabinet/, ""))
    : mainUrl(diaryRecommendation.route);
  const diaryObservation = topObservation(diaryTopicCounts);

  // B464 Triage next-step: resume the active route OR the last thread (explicit
  // state, never a vague «продолжить» that dead-ends at a free checkin).
  const lastDialogue = recentDialogues[0];
  const nextAction = activeRoutes[0]
    ? {
        href: appUrl("/wallet"),
        eyebrow: "вы продолжаете маршрут",
        title: activeRoutes[0].title,
        cta: "Продолжить маршрут",
        hint: `${activeRoutes[0].currentDay} день · ${activeRoutes[0].status === "PAUSED" ? "на паузе" : "активен"}`,
      }
    : lastDialogue
      ? {
          href: mainUrl(`/checkin?dialogueId=${lastDialogue.id}`),
          eyebrow: currentTheme ? `вы остановились на теме «${currentTheme}»` : "вы остановились на разговоре",
          title: lastDialogue.title,
          cta: "Продолжить разбор",
          hint: lastDialogue.status === "ANSWERED" ? "ответ уже готов" : "можно продолжить",
        }
      : {
          href: mainUrl("/checkin"),
          eyebrow: "с чего начать",
          title: "Задайте первый вопрос — спокойно и своими словами",
          cta: "Задать вопрос",
          hint: "первичный разбор бесплатный",
        };

  const dailyCard = dailyCardResult.card;
  const dailyBeats = dailyCardBeats(dailyCard.metadata);
  const missionHref = (href: string) => (
    href.startsWith("/cabinet") ? appUrl(href.replace(/^\/cabinet/, "")) : mainUrl(href)
  );

  // Quiet subscription offer only when the client has enough history to benefit
  // (value before paywall) and is not already subscribed. Otherwise the card
  // just states the current plan.
  const subscriptionQualified = showMonetization && !activeSubscription && (dialogueCount >= 2 || productCount >= 2);

  return (
    <div className="max-w-6xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }}>

      {/* ═══════ ZONE 1 · ACT — resume your thread ═══════ */}
      <section
        className="soft-card mb-4 p-6"
        data-testid="client-primary-action"
        style={{ background: "linear-gradient(155deg, var(--soft-paper-card) 0%, var(--soft-apricot) 100%)", border: "1px solid transparent" }}
      >
        <p className="soft-eyebrow">с возвращением</p>
        <h1 className="soft-h1 mt-2">
          <span className="soft-italic">{firstName}</span>, ваша работа продолжается
        </h1>

        {/* Spendable-balance pill (A3 reframed as spendable) */}
        <div className="mt-4" data-testid="client-dashboard-balance">
          <Link
            href={appUrl("/wallet")}
            className="inline-flex items-center gap-2 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-4 py-2 text-sm font-semibold"
            style={{ color: "var(--soft-bordeaux)" }}
          >
            <Sparkles className="size-4" aria-hidden="true" />
            {clarityCredits} {pointsWord(clarityCredits)} · на что потратить
          </Link>
        </div>

        {crisisGuard ? (
          /* Crisis-guard: calm continuity + support, no offers. */
          <div className="mt-5 rounded-[16px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5" data-testid="client-crisis-continuity">
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
          </div>
        ) : (
          <div className="mt-5 rounded-[16px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5">
            <p className="text-[13px]" style={{ color: "var(--soft-ink-faint)" }}>{nextAction.eyebrow}</p>
            <p className="soft-italic mt-1.5" style={{ fontSize: 18, color: "var(--soft-bordeaux)", lineHeight: 1.4 }}>
              {nextAction.title}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Link href={nextAction.href} className="soft-button soft-button-primary shrink-0">
                {nextAction.cta} <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <span className="text-[13px]" style={{ color: "var(--soft-ink-faint)" }}>{nextAction.hint}</span>
            </div>
          </div>
        )}
      </section>

      {/* ═══════ ZONE 2 · RESULTS + SERVICES ═══════ */}

      {/* «ваши результаты» — recent 4, category inline-with-date (round-2 #3),
          «все разборы» → /questions. */}
      <div className="soft-card mb-4 p-5" data-testid="client-recent-questions">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="soft-eyebrow">ваши результаты</p>
          {recentDialogues.length > 0 && (
            <Link href={appUrl("/questions")} className="text-sm font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
              Все разборы →
            </Link>
          )}
        </div>
        {recentDialogues.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--soft-ink-soft)" }}>Здесь появятся ваши разборы.</p>
        ) : recentDialogues.map((d, i) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-3"
            style={{ padding: "12px 0", borderTop: i > 0 ? "1px solid var(--soft-paper-edge)" : "none" }}
          >
            {/* min-w-0 lets a long title wrap (break-words) instead of pushing
                «Открыть» out of the card. Category label sits inline before the
                date (round-2 #3): «отношения · 2 июля». */}
            <div className="min-w-0">
              <p className="break-words" style={{ fontWeight: 500 }}>{d.title}</p>
              <p className="mt-0.5 text-xs sm:w-[110px]" style={{ color: "var(--soft-ink-faint)" }}>
                {dialogueTopicLabelRu(d.topic)} · {d.updatedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
              </p>
            </div>
            <Link href={mainUrl(`/checkin?dialogueId=${d.id}`)} className="soft-chip shrink-0">Открыть →</Link>
          </div>
        ))}
      </div>

      {/* «что дальше по вашей теме» — the cabinet→services lilac bridge
          (A12 promoted). Suppressed on crisis. */}
      {showMonetization && (
        <div
          className="soft-card mb-4 p-5"
          data-testid="diary-recommendation"
          style={{ background: "linear-gradient(155deg, #FBF8FE 0%, var(--soft-lilac-bg, #EFEAF6) 100%)", border: "1px solid rgba(168,155,201,0.28)" }}
        >
          <p className="soft-eyebrow" style={{ color: "#6E5BA6" }}>что дальше по вашей теме</p>
          <p className="soft-h3 mt-2 font-normal" style={{ color: "#43356E", lineHeight: 1.4 }}>
            {diaryRecommendation.body}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link href={diaryRecommendationHref} className="soft-button shrink-0" style={{ background: "var(--soft-lilac, #A89BC9)", color: "#fff", fontSize: 13 }} data-testid="diary-recommendation-cta">
              {diaryRecommendation.ctaLabel}
            </Link>
            <Link href={mainUrl("/practitioners")} className="soft-button soft-button-ghost shrink-0" style={{ fontSize: 13 }}>
              Подобрать специалиста
            </Link>
          </div>
        </div>
      )}

      {/* warm diary preview — self-noticing the user owns (un-quoted, no
          «дневник заметил» surveillance framing, owner #4). Carries the map
          preview slot → Дневник. */}
      <div className="soft-card mb-4 flex items-center gap-4 p-5" data-testid="client-map-preview">
        <div className="min-w-0 flex-1">
          <p className="soft-eyebrow mb-2">ваш дневник</p>
          <p className="soft-italic" style={{ fontSize: 16, color: "var(--soft-ink-soft)", lineHeight: 1.5 }}>
            {diaryObservation
              ? diaryObservation.text
              : currentTheme
                ? `В последнее время вы чаще возвращаетесь к теме «${currentTheme}» — кажется, это сейчас важно для вас.`
                : "Здесь собираются ваши разборы и заметки — только для вас."}
          </p>
        </div>
        <Link href={appUrl("/diary")} className="soft-button soft-button-ghost shrink-0">Открыть дневник</Link>
      </div>

      {/* ═══════ ZONE 3 · GROW (free) ═══════ */}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        {/* Daily-Q «по вашим разборам» — the FULL ritual right here (round-4 #6):
            the client writes their answer/question, gets взгляд+шаг immediately,
            and the entry lands in «ваши записи» Дневника. NOT /checkin. */}
        <section className="soft-card p-5" data-testid="client-daily-card">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="soft-eyebrow">вопрос дня · по вашим разборам</p>
            </div>
            <div
              className="grid size-12 shrink-0 place-items-center rounded-full text-sm font-semibold"
              data-testid="client-streak-badge"
              style={{ background: "var(--soft-paper-deep)", color: "var(--soft-bordeaux)", fontFamily: "var(--font-heading-v4, serif)" }}
              aria-label={`Серия: ${practiceStreak.count} дней`}
            >
              {practiceStreak.count}
            </div>
          </div>
          <DailyPracticeActions
            completed={Boolean(dailyCard.completedAt)}
            variant="full"
            prompt={dailyCard.prompt}
            perspective={dailyBeats.perspective}
            step={dailyBeats.step}
            initialReflection={dailyCard.reflectionText}
          />
          <div className="mt-4 flex items-center gap-2" data-testid="practice-week-progress" aria-label="Прогресс недели">
            {practiceWeekDays(weekCards.map((card) => card.cardDate)).map((day) => (
              <span key={day.label} className="flex flex-col items-center gap-1">
                <span
                  className="grid size-6 place-items-center rounded-full text-[10px] font-semibold"
                  style={{
                    background: day.done ? "var(--soft-terracotta-dark)" : "var(--soft-paper-deep)",
                    color: day.done ? "#FFFCF5" : "var(--soft-ink-faint)",
                    outline: day.isToday ? "2px solid var(--soft-bordeaux)" : "none",
                    outlineOffset: 2,
                  }}
                  data-done={day.done ? "1" : "0"}
                >
                  {day.done ? "✓" : ""}
                </span>
                <span className="text-[10px] text-[var(--soft-ink-faint)]">{day.label}</span>
              </span>
            ))}
          </div>
          <p className="mt-3 text-[11.5px]" style={{ color: "var(--soft-ink-faint)" }} data-testid="practice-milestones-hint">
            записи сохраняются в Дневнике и видны только вам · на 7-й день серии придёт итог недели · вехи: {Object.entries(STREAK_REWARDS).map(([d, r]) => `${d} дн. +${r.creditAmount}`).join(" · ")}
          </p>
          {weeklySummary && (
            <Link href={appUrl("/diary")} className="soft-chip mt-3 inline-flex items-center gap-2" data-testid="weekly-summary-link">
              <CheckCircle2 className="size-3.5" aria-hidden="true" />
              Итог недели готов — открыть в Дневнике
            </Link>
          )}
        </section>

        {/* Referral card — warm gift framing + staged counter (owner copy locked).
            Suppressed on crisis. Full copy/clipboard lives on /cabinet/invite. */}
        {showMonetization ? (
          <section
            className="soft-card p-5"
            data-testid="client-referral-card"
            style={{ background: "linear-gradient(155deg, var(--soft-apricot) 0%, #F8E6D1 100%)", border: "1px solid transparent" }}
          >
            <p className="soft-eyebrow">подарите разбор — получите баллы</p>
            <h2 className="soft-h3 mt-2" style={{ color: "var(--soft-bordeaux)" }}>Подарите кому-то первый разбор — и пополните свой баланс</h2>
            <p className="mt-2 text-[13px]" style={{ color: "var(--soft-bordeaux)", opacity: 0.85 }}>
              Когда тот, кого вы позвали, попробует разбор, баллы придут вам обоим.
            </p>
            <div className="mt-4 flex gap-6">
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
            <Link href={appUrl("/invite")} className="soft-button soft-button-primary mt-4 shrink-0">
              <Gift className="size-4" aria-hidden="true" /> Пригласить друга
            </Link>
          </section>
        ) : (
          <section className="soft-card p-5" data-testid="client-referral-card-suppressed" style={{ background: "var(--soft-paper-deep)" }}>
            <p className="soft-eyebrow">вы не одни</p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
              Если сейчас непросто, можно написать в поддержку или вернуться к разбору позже.
            </p>
          </section>
        )}
      </div>

      {/* Next meeting + quiet subscription. */}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        {upcomingBooking ? (
          <section className="soft-card p-5" style={{ borderLeft: "3px solid var(--soft-bordeaux)" }} data-testid="client-next-meeting">
            <p className="soft-eyebrow">ближайшая встреча</p>
            <p className="mt-2" style={{ fontSize: 15, fontWeight: 600, color: "var(--soft-ink)" }}>{upcomingBooking.practitioner.user.name}</p>
            <p className="mt-1 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
              {upcomingBooking.slot
                ? `${upcomingBooking.slot.startAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}, ${upcomingBooking.slot.startAt.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} · `
                : ""}
              {upcomingBooking.status === "CONFIRMED" ? "подтверждено" : "ожидает подтверждения"}
            </p>
            <Link href={appUrl("/bookings")} className="soft-button soft-button-ghost mt-4 shrink-0">К записи</Link>
          </section>
        ) : recommendedPractitioner && showMonetization ? (
          <section className="soft-card p-5" data-testid="client-practitioner-suggestion">
            <p className="soft-eyebrow">если хочется живого разговора</p>
            <p className="soft-h3 mt-2" style={{ color: "var(--soft-bordeaux)" }}>
              {currentTheme ? `Тема «${currentTheme}» возвращается — может, обсудить с человеком?` : "Можно обсудить ваш вопрос со специалистом"}
            </p>
            <p className="mt-2 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
              {recommendedPractitioner.name} · {recommendedPractitioner.title} · от {recommendedPractitioner.pricePerSession.toLocaleString("ru-RU")} ₽
            </p>
            <Link href={mainUrl(`/practitioners/${recommendedPractitioner.slug}`)} className="soft-button soft-button-primary mt-4 shrink-0">Записаться</Link>
          </section>
        ) : (
          <section className="soft-card p-5" data-testid="client-support-card">
            <p className="soft-eyebrow">рядом, если нужно</p>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>Живой разговор со специалистом всегда доступен — спокойно, в своём темпе.</p>
            <Link href={mainUrl("/practitioners")} className="soft-button soft-button-ghost mt-4 shrink-0">Посмотреть специалистов</Link>
          </section>
        )}

        {/* Subscription: a quiet offer only when qualified, else the current plan. */}
        <section className="soft-card p-5" data-testid="client-subscription-status">
          {subscriptionQualified ? (
            <>
              <p className="soft-eyebrow">если хотите возвращаться чаще</p>
              <p className="mt-2 text-[13.5px] leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                В подписке — больше баллов каждый месяц и расширенный дневник. Спокойно сравните, без спешки.
              </p>
              <Link href={appUrl("/wallet")} className="mt-3 inline-block text-sm font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
                Сравнить тарифы →
              </Link>
            </>
          ) : (
            <>
              <p className="soft-eyebrow">подписка</p>
              <p className="mt-2" style={{ fontFamily: "var(--font-heading-v4, serif)", fontSize: 22, color: "var(--soft-bordeaux)", fontWeight: 500 }}>{subscriptionLabel}</p>
              <p className="mt-1 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
                {subscriptionStatus}
                {activeSubscription?.currentPeriodEnd
                  ? ` · до ${activeSubscription.currentPeriodEnd.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`
                  : ""}
              </p>
              <Link href={appUrl("/wallet")} className="soft-chip mt-4 inline-block">Управлять →</Link>
            </>
          )}
        </section>
      </div>

      {/* Time-boxed onboarding «первые шаги» — auto-hides once every reward is
          granted; collapsed by default. */}
      {missionChecklist.completedCount < missionChecklist.totalCount && (
        <details className="soft-card mb-4 p-5" data-testid="client-first-steps" open={false}>
          <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="soft-eyebrow">первые шаги</p>
              <h2 className="soft-h3 mt-2">
                {missionChecklist.completedCount} из {missionChecklist.totalCount} — осталось немного
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                Награды начисляются за реальные действия. Всего здесь {missionChecklist.totalRewardCredits} {pointsWord(missionChecklist.totalRewardCredits)}. Блок исчезнет, когда закончите.
              </p>
            </div>
          </summary>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {missionChecklist.items.map((mission) => (
              <Link
                key={mission.key}
                href={missionHref(mission.actionHref)}
                className="rounded-[14px] border border-[var(--soft-paper-edge)] p-4 no-underline"
                data-testid={`client-mission-${mission.key}`}
                style={{ background: mission.completed ? "var(--soft-paper-deep)" : "var(--soft-paper-card)", color: "var(--soft-ink)" }}
              >
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
                <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                  {mission.completed ? "получено" : mission.description}
                </p>
              </Link>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
