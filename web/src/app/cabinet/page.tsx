export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Leaf } from "lucide-react";
import { auth } from "@/lib/auth";
import { DailyPracticeActions } from "@/components/cabinet/daily-practice-actions";
import db from "@/lib/db";
import { getOrCreateDailyCard } from "@/lib/daily-card";
import { getClarityCreditBalance } from "@/lib/clarity-credits";
import { pointsWord } from "@/lib/points";
import { listMissionChecklist } from "@/lib/missions";
import { getPracticeStreakSnapshot, STREAK_REWARDS } from "@/lib/streaks";
import { practiceWeekDays, startOfPracticeWeek, WEEKLY_SUMMARY_PRODUCT_KEY } from "@/lib/weekly-summary";
import { getSubscriptionPlanLabel, getSubscriptionStatusLabel } from "@/lib/billing-labels";
import { dialogueTopicLabelRu, dialogueStatusLabelRu } from "@/lib/dialogue-router";
import { adminUrl, appUrl, loginUrl, mainUrl } from "@/lib/subdomain";
import { log, serializeError } from "@/lib/logger";

// G4: proper Russian pluralisation for "разбор" so the "текущая тема" card
// reads naturally for 1 / 2–4 / 5+ / 11–14 cases (not the naive 2–4 check).
function pluralRazbor(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "разбор";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "разбора";
  return "разборов";
}

type RecommendedPractitioner = {
  slug: string;
  name: string;
  title: string;
  pricePerSession: number;
};

// G5: when the client has no upcoming booking we still want the "ближайшая
// встреча" slot filled — with a gentle recommendation to talk to a real
// specialist. We surface the single best-ranked ACTIVE + verified
// practitioner (founding → reviewCount → ratingSum), and never let a DB
// hiccup crash the cabinet: on any failure we just render nothing.
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

  const [recentDialogues, upcomingBooking, activeSubscription, dialogueCount, productCount, activeRoutes, dailyCardResult, dailyCardCount, weekCards, weeklySummary, clarityCredits, topicGroups, recommendedPractitioner, missionChecklist, practiceStreak] = await Promise.all([
    db.dialogue.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { id: true, title: true, status: true, topic: true, updatedAt: true },
    }),
    // B326: "ближайшая встреча" must be a real future appointment, not
    // any past/cancelled record. The booking time lives on its TimeSlot —
    // filter slot.startAt > now AND active statuses; order by the earliest
    // upcoming slot.
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
    db.dailyCard.count({ where: { userId } }),
    // B375: прогресс пн–вс и готовый «итог недели» для блока «Ежедневный вопрос».
    db.dailyCard.findMany({
      where: { userId, completedAt: { not: null }, cardDate: { gte: startOfPracticeWeek() } },
      select: { cardDate: true },
    }),
    db.productResult.findFirst({
      where: { userId, productKey: WEEKLY_SUMMARY_PRODUCT_KEY, createdAt: { gte: startOfPracticeWeek() }, status: "READY" },
      select: { id: true },
    }),
    getClarityCreditBalance(userId),
    // G4: count dialogues per topic across ALL history (not just the last 4),
    // so the "текущая тема" card can show "N разборов на эту тему" instead of
    // the misleading total "разборов за всё время".
    db.dialogue.groupBy({
      by: ["topic"],
      where: { userId, deletedAt: null, topic: { not: null } },
      _count: { _all: true },
    }),
    loadRecommendedPractitioner(),
    listMissionChecklist(userId),
    getPracticeStreakSnapshot(userId),
  ]);

  const firstName = session.user?.name?.split(" ")[0] ?? "пользователь";
  const subscriptionLabel = getSubscriptionPlanLabel(activeSubscription?.planKey);
  const subscriptionStatus = activeSubscription
    ? activeSubscription.cancelAtPeriodEnd
      ? "Отменяется в конце периода"
      : getSubscriptionStatusLabel(activeSubscription.status)
    : "Базовый доступ";

  // G4: the dominant theme is the topic with the most dialogues across the
  // whole history, and `currentThemeCount` is that topic's own count — so the
  // card no longer mixes "тема X" with the grand total of all разборы.
  const sortedTopics = [...topicGroups].sort((a, b) => b._count._all - a._count._all);
  const currentTopicKey = sortedTopics[0]?.topic ?? null;
  const currentThemeCount = sortedTopics[0]?._count._all ?? 0;
  // B325: resolve the topic enum (English) into a Russian label for the UI.
  const currentTheme = currentTopicKey ? dialogueTopicLabelRu(currentTopicKey) : null;

  const nextAction = activeRoutes[0]
    ? { href: appUrl("/wallet"), label: `Продолжить ${activeRoutes[0].title}`, hint: `${activeRoutes[0].currentDay} день · ${activeRoutes[0].status === "PAUSED" ? "пауза" : "активен"}` }
    : recentDialogues[0]
      ? { href: mainUrl(`/checkin?dialogueId=${recentDialogues[0].id}`), label: "Вернуться к последнему вопросу", hint: recentDialogues[0].status === "ANSWERED" ? "ответ уже готов" : "можно продолжить" }
      : { href: mainUrl("/checkin"), label: "Задать первый вопрос", hint: "начните с бесплатного первичного ответа" };

  const dailyCard = dailyCardResult.card;
  const missionHref = (href: string) => (
    href.startsWith("/cabinet") ? appUrl(href.replace(/^\/cabinet/, "")) : mainUrl(href)
  );

  return (
    <div className="max-w-6xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }}>
      {/* v4: eyebrow "мой кабинет" + h1. B313: removed in-page "Новый разбор"
          CTA — it duplicated the header CTA and visually crowded the H1 row. */}
      <div className="mb-6">
        <p className="soft-eyebrow">мой кабинет</p>
        <h1 className="soft-h1 mt-2">
          С возвращением, <span className="soft-italic">{firstName}</span>
        </h1>
      </div>

      <section className="soft-card mb-4 p-5" data-testid="client-primary-action">
        <p className="soft-eyebrow">Следующий шаг</p>
        <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="soft-h3">{nextAction.label}</h2>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{nextAction.hint}</p>
          </div>
          <Link href={nextAction.href} className="soft-button soft-button-primary shrink-0">
            Продолжить
          </Link>
        </div>
      </section>

      <div
        className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] border border-[var(--soft-paper-edge)] px-4 py-3 text-sm"
        style={{ background: "var(--soft-paper-deep)" }}
        data-testid="client-dashboard-balance"
      >
        <span className="font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
          Баланс: {clarityCredits} {pointsWord(clarityCredits)}
        </span>
        <Link href={appUrl("/wallet")} className="soft-chip">
          Открыть кошелёк →
        </Link>
      </div>

      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <div
          className="soft-card p-5"
          data-testid="client-map-preview"
          style={{ background: "linear-gradient(140deg, #E8C4B8, #F4D5C8)" }}
        >
          <p className="soft-eyebrow">текущая тема</p>
          {currentTheme ? (
            <>
              <p className="soft-h3 mt-2 font-medium" style={{ color: "var(--soft-bordeaux)" }}>
                {currentTheme}
              </p>
              <p className="mt-2 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
                {currentThemeCount} {pluralRazbor(currentThemeCount)} на эту тему
              </p>
            </>
          ) : (
            <p className="soft-h3 mt-2 font-medium soft-italic" style={{ color: "var(--soft-bordeaux)" }}>
              Начните первый разбор
            </p>
          )}
          <Link href={appUrl("/diary")} className="soft-chip mt-4 inline-block">
            Открыть дневник →
          </Link>
        </div>

        <div className="soft-card p-5" data-testid="client-subscription-status">
          <p className="soft-eyebrow">подписка</p>
          <p
            style={{
              fontFamily: "var(--font-heading, serif)",
              fontSize: 24,
              color: "var(--soft-bordeaux)",
              fontWeight: 500,
              marginTop: 8,
            }}
          >
            {subscriptionLabel}
          </p>
          <p className="mt-1 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
            {subscriptionStatus}
            {activeSubscription?.currentPeriodEnd
              ? ` · до ${activeSubscription.currentPeriodEnd.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}`
              : ""}
          </p>
          <Link href={appUrl("/billing")} className="soft-chip mt-4 inline-block">
            Управлять →
          </Link>
        </div>
      </div>

      {/* v4.2: "ближайшая встреча" slot. B326: a real future appointment renders
          as the dark bordeaux card. G5: when there is NO upcoming booking we
          keep the slot alive with a softer recommendation card — nudging the
          client toward a real specialist, themed around their dominant topic. */}
      {upcomingBooking ? (
        <div className="mb-4 rounded-[var(--soft-radius-xl)] p-5" style={{ background: "var(--soft-bordeaux)", color: "#FBF0E1" }}>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "#F4D9C1", opacity: 0.7 }}>ближайшая встреча</p>
              <p style={{ fontFamily: "var(--font-heading, serif)", fontSize: 22, color: "#FBF0E1", fontWeight: 500, marginTop: 6 }}>
                {upcomingBooking.practitioner.user.name}
              </p>
              <p className="mt-1 text-[13px]" style={{ color: "#E8C4B8" }}>
                {upcomingBooking.priceRub.toLocaleString("ru")} ₽ · {upcomingBooking.status === "CONFIRMED" ? "подтверждено" : "ожидает подтверждения"}
              </p>
            </div>
            <Link href={appUrl("/bookings")} className="soft-chip shrink-0" style={{ background: "#F4D9C1", color: "var(--soft-bordeaux)" }}>
              Все записи →
            </Link>
          </div>
        </div>
      ) : recommendedPractitioner ? (
        <div
          className="mb-4 rounded-[var(--soft-radius-xl)] border border-[var(--soft-paper-edge)] p-5"
          style={{ background: "var(--soft-paper-deep)" }}
          data-testid="client-practitioner-suggestion"
        >
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="soft-eyebrow">если хочется живого разговора</p>
              <p className="soft-h3 mt-2" style={{ color: "var(--soft-bordeaux)" }}>
                {currentTheme
                  ? `Тема «${currentTheme}» возвращается — может, обсудить её с человеком?`
                  : "Можно обсудить ваш вопрос с живым специалистом"}
              </p>
              <p className="mt-2 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
                {recommendedPractitioner.name} · {recommendedPractitioner.title} · от{" "}
                {recommendedPractitioner.pricePerSession.toLocaleString("ru-RU")} ₽
              </p>
            </div>
            <Link
              href={mainUrl(`/practitioners/${recommendedPractitioner.slug}`)}
              className="soft-button soft-button-primary shrink-0"
            >
              Записаться
            </Link>
          </div>
        </div>
      ) : null}

      {/* #5: onboarding «первые шаги» lives high on the first screen, and
          disappears once every mission reward has been granted. */}
      {missionChecklist.completedCount < missionChecklist.totalCount && (
        <details className="soft-card mb-4 p-5" data-testid="client-first-steps" open={false}>
          <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="soft-eyebrow">первые шаги</p>
              <h2 className="soft-h3 mt-2">
                {missionChecklist.completedCount} из {missionChecklist.totalCount} миссий пройдено
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                Награды начисляются только за реальные действия. Всего здесь {missionChecklist.totalRewardCredits} {pointsWord(missionChecklist.totalRewardCredits)},
                которые можно потратить на цифровые форматы.
              </p>
            </div>
            <div
              className="inline-flex items-center gap-2 rounded-[14px] border border-[var(--soft-paper-edge)] px-3 py-2 text-sm font-semibold"
              data-testid="client-streak-badge"
              style={{ background: "var(--soft-paper-deep)", color: "var(--soft-bordeaux)" }}
            >
              <Leaf className="size-4" aria-hidden="true" />
              {practiceStreak.count} {practiceStreak.count === 1 ? "день" : practiceStreak.count >= 2 && practiceStreak.count <= 4 ? "дня" : "дней"} подряд
            </div>
          </summary>
          <div className="mt-4 grid gap-3 md:grid-cols-5">
            {missionChecklist.items.map((mission) => (
              <Link
                key={mission.key}
                href={missionHref(mission.actionHref)}
                className="rounded-[14px] border border-[var(--soft-paper-edge)] p-4 no-underline"
                data-testid={`client-mission-${mission.key}`}
                style={{
                  background: mission.completed ? "var(--soft-paper-deep)" : "var(--soft-paper-card)",
                  color: "var(--soft-ink)",
                }}
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

      {/* v4: recent dialogues card — directly below stat grid. T16: показываем
          последние 4 разбора с русскими ярлыками темы и статуса, плюс кнопка
          «Все разборы» → история. Дублирующий блок со старым заголовком убран. */}
      <div className="soft-card mb-4 p-5" data-testid="client-recent-questions">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="soft-eyebrow">недавние разборы</p>
          {recentDialogues.length > 0 && (
            <Link href={appUrl("/questions")} className="text-sm font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
              Все разборы →
            </Link>
          )}
        </div>
        {recentDialogues.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--soft-ink-soft)" }}>Здесь появятся последние диалоги.</p>
        ) : recentDialogues.map((d, i) => (
          <div
            key={d.id}
            className="flex items-center justify-between gap-4"
            style={{ padding: "12px 0", borderTop: i > 0 ? "1px solid var(--soft-paper-edge)" : "none" }}
          >
            <div className="flex items-start gap-4">
              <span className="shrink-0" style={{ fontSize: 12, color: "var(--soft-ink-faint)", width: 110, paddingTop: 2 }}>
                {d.updatedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "short" })}
              </span>
              <div>
                <p style={{ fontWeight: 500 }}>{d.title}</p>
                <p style={{ fontSize: 12.5, color: "var(--soft-ink-faint)", marginTop: 2 }}>
                  {dialogueTopicLabelRu(d.topic)} · {dialogueStatusLabelRu(d.status)}
                </p>
              </div>
            </div>
            <Link href={mainUrl(`/checkin?dialogueId=${d.id}`)} className="soft-chip shrink-0">Открыть →</Link>
          </div>
        ))}
      </div>

      {/* B375: «Ежедневный вопрос» — бесплатный блок дашборда с недельным
          прогрессом пн–вс и наградами по вехам (3/7/14/30 дней). */}
      <section className="soft-card soft-form-panel mb-4" data-testid="client-daily-card">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="soft-eyebrow">Ежедневный вопрос</p>
            <h2 className="mt-3 font-heading text-3xl font-medium" style={{ color: "var(--soft-bordeaux)" }}>{dailyCard.title}</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{dailyCard.body}</p>
            <div className="mt-5 flex items-center gap-2" data-testid="practice-week-progress" aria-label="Прогресс недели">
              {practiceWeekDays(weekCards.map((card) => card.cardDate)).map((day) => (
                <span key={day.label} className="flex flex-col items-center gap-1">
                  <span
                    className="grid size-7 place-items-center rounded-full text-[11px] font-semibold"
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
            <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--soft-ink-faint)" }} data-testid="practice-milestones-hint">
              {practiceStreak.count > 0 ? `Серия: ${practiceStreak.count} дн. · ` : ""}
              Награды по вехам: {Object.entries(STREAK_REWARDS).map(([d, r]) => `${d} дн. +${r.creditAmount}`).join(" · ")} баллов.
            </p>
            {weeklySummary && (
              <Link
                href={appUrl("/diary")}
                className="soft-chip mt-3 inline-flex items-center gap-2"
                data-testid="weekly-summary-link"
              >
                <CheckCircle2 className="size-3.5" aria-hidden="true" />
                Итог недели готов — открыть в Дневнике
              </Link>
            )}
          </div>
          <div className="rounded-[16px] border border-[var(--soft-paper-edge)] p-5" style={{ background: "var(--soft-paper-deep)" }}>
            <p className="soft-eyebrow">Вопрос для себя</p>
            <p className="mt-3 font-heading text-2xl" style={{ color: "var(--soft-ink)" }}>{dailyCard.prompt}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link
                href={mainUrl(`/checkin?question=${encodeURIComponent(dailyCard.prompt)}`)}
                className="soft-button soft-button-primary"
                data-analytics-event="daily_card_question_clicked"
                data-analytics-surface="client_dashboard"
                data-analytics-target="daily_card_prompt"
              >
                Разобрать вопрос
              </Link>
              <a
                href={mainUrl(`/share?from=daily-card&topic=${encodeURIComponent(dailyCard.title)}`)}
                className="soft-button soft-button-ghost"
                data-analytics-event="daily_card_share_clicked"
                data-analytics-surface="client_dashboard"
                data-analytics-target="daily_card_share"
              >
                Поделиться
              </a>
            </div>
            <DailyPracticeActions completed={Boolean(dailyCard.completedAt)} />
          </div>
        </div>
      </section>

      <details className="soft-card mb-4 p-5" data-testid="client-gentle-milestones" open={false}>
        <summary className="cursor-pointer list-none">
          <p className="soft-eyebrow">Мягкий ритм</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
            Статистика свернута, чтобы главная кабинета начиналась с действия и вопроса дня.
          </p>
        </summary>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[12px] border border-[var(--soft-paper-edge)] p-4" style={{ background: "var(--soft-paper-deep)" }}>
            <p className="font-heading text-3xl" style={{ color: "var(--soft-bordeaux)" }}>{dailyCardCount}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>карт дня открыто</p>
          </div>
          <div className="rounded-[12px] border border-[var(--soft-paper-edge)] p-4" style={{ background: "var(--soft-paper-deep)" }}>
            <p className="font-heading text-3xl" style={{ color: "var(--soft-bordeaux)" }}>{dialogueCount}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>вопросов сохранено</p>
          </div>
          <div className="rounded-[12px] border border-[var(--soft-paper-edge)] p-4" style={{ background: "var(--soft-paper-deep)" }}>
            <p className="font-heading text-3xl" style={{ color: "var(--soft-bordeaux)" }}>{productCount}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>результатов в карте</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
          Здесь нет штрафов, дедлайнов и давления. Ритм нужен только как напоминание,
          что маленькие возвращения к себе тоже считаются.
        </p>
      </details>

      {/* v4: card-flat "подсказка от карты" */}
      <div className="soft-card-flat p-5">
        <p className="soft-eyebrow mb-3">подсказка от карты</p>
        <p className="soft-h3 mt-2 font-normal soft-italic" style={{ color: "var(--soft-ink-soft)", lineHeight: 1.5 }}>
          {currentTheme
            ? `За последние разборы дневник замечает тему «${currentTheme}». Можно вернуться к ней в подробном разборе или обсудить со специалистом.`
            : "Дневник собирает повторяющиеся темы после каждого разбора. Начните первый диалог — и дневник начнёт наблюдать."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={appUrl("/wallet")} className="soft-button soft-button-primary" style={{ fontSize: 13 }}>
            Подобрать разбор
          </Link>
          <Link href={mainUrl("/practitioners")} className="soft-button soft-button-ghost" style={{ fontSize: 13 }}>
            Подобрать специалиста
          </Link>
          <Link href={`${appUrl("/wallet")}#credits-products`} className="soft-chip" style={{ fontSize: 12 }}>
            Подробный разбор →
          </Link>
        </div>
      </div>
    </div>
  );
}
