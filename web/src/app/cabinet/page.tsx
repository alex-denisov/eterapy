export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { DailyPracticeActions } from "@/components/cabinet/daily-practice-actions";
import db from "@/lib/db";
import { getOrCreateDailyCard } from "@/lib/daily-card";
import { getClarityCreditBalance } from "@/lib/clarity-credits";
import { getSubscriptionPlanLabel, getSubscriptionStatusLabel } from "@/lib/billing-labels";
import { dialogueTopicLabelRu } from "@/lib/dialogue-router";
import { adminUrl, appUrl, loginUrl, mainUrl } from "@/lib/subdomain";

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

  const [recentDialogues, upcomingBooking, userData, activeSubscription, dialogueCount, productCount, activeRoutes, dailyCardResult, dailyCardCount, clarityCredits] = await Promise.all([
    db.dialogue.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { id: true, title: true, status: true, topic: true, updatedAt: true },
    }),
    // B326: "ближайшая встреча" must be a real future appointment, not
    // any past/cancelled record. Filter on scheduledAt > now AND active
    // statuses; order by the earliest upcoming slot.
    db.booking.findFirst({
      where: {
        clientId: userId,
        status: { in: ["PENDING", "CONFIRMED"] },
        scheduledAt: { gt: new Date() },
      },
      orderBy: { scheduledAt: "asc" },
      include: { practitioner: { include: { user: { select: { name: true } } } } },
    }),
    db.user.findUnique({ where: { id: userId }, select: { balance: true } }),
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
    getClarityCreditBalance(userId),
  ]);

  const balanceRub = Math.floor((userData?.balance ?? 0) / 100);
  const firstName = session.user?.name?.split(" ")[0] ?? "пользователь";
  const subscriptionLabel = getSubscriptionPlanLabel(activeSubscription?.planKey);
  const subscriptionStatus = activeSubscription
    ? activeSubscription.cancelAtPeriodEnd
      ? "Отменяется в конце периода"
      : getSubscriptionStatusLabel(activeSubscription.status)
    : "Базовый доступ";

  const topicCounts: Record<string, number> = {};
  for (const d of recentDialogues) {
    if (d.topic) topicCounts[d.topic] = (topicCounts[d.topic] ?? 0) + 1;
  }
  // B325: resolve the topic enum (English) into a Russian label for the UI.
  const currentTopicKey = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  const currentTheme = currentTopicKey ? dialogueTopicLabelRu(currentTopicKey) : null;

  const nextAction = activeRoutes[0]
    ? { href: appUrl("/products"), label: `Продолжить ${activeRoutes[0].title}`, hint: `${activeRoutes[0].currentDay} день · ${activeRoutes[0].status === "PAUSED" ? "пауза" : "активен"}` }
    : recentDialogues[0]
      ? { href: mainUrl(`/checkin?dialogueId=${recentDialogues[0].id}`), label: "Вернуться к последнему вопросу", hint: recentDialogues[0].status === "ANSWERED" ? "ответ уже готов" : "можно продолжить" }
      : { href: mainUrl("/checkin"), label: "Задать первый вопрос", hint: "начните с бесплатного первичного ответа" };

  const dailyCard = dailyCardResult.card;

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

      {/* v4.2: 3-col stat grid — тема / кредиты / подписка */}
      <div className="mb-4 grid gap-4 md:grid-cols-3">
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
                {dialogueCount} {dialogueCount === 1 ? "разбор" : dialogueCount >= 2 && dialogueCount <= 4 ? "разбора" : "разборов"} за всё время
              </p>
            </>
          ) : (
            <p className="soft-h3 mt-2 font-medium soft-italic" style={{ color: "var(--soft-bordeaux)" }}>
              Начните первый разбор
            </p>
          )}
          <Link href={appUrl("/action-history")} className="soft-chip mt-4 inline-block">
            Открыть карту →
          </Link>
        </div>

        <Link
          href={appUrl("/credits")}
          className="soft-card p-5 block"
          data-testid="client-clarity-credits"
          style={{ background: "linear-gradient(140deg, #F4D9C1, #F8E6D1)", textDecoration: "none" }}
        >
          <div className="flex items-center justify-between">
            <p className="soft-eyebrow">Кредиты ясности</p>
          </div>
          <p style={{ fontFamily: "var(--font-heading, serif)", fontSize: 44, color: "var(--soft-bordeaux)", fontWeight: 600, lineHeight: 1, marginTop: 8 }}>
            {clarityCredits}
          </p>
          <p className="mt-2 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
            потратить на ракурсы и отчёты
          </p>
          <span className="soft-chip mt-4 inline-block">Пополнить →</span>
        </Link>

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
          {balanceRub > 0 && (
            <p className="mt-1 text-[13px]" style={{ color: "var(--soft-ink-soft)" }}>
              Баланс: {balanceRub.toLocaleString("ru")} ₽
            </p>
          )}
          <Link href={appUrl("/billing")} className="soft-chip mt-4 inline-block">
            Управлять →
          </Link>
        </div>
      </div>

      {/* v4.2: upcoming booking — full-width dark bordeaux card, only when booking exists */}
      {upcomingBooking && (
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
      )}

      {/* v4: recent dialogues card — directly below stat grid */}
      <div className="soft-card mb-4 p-5">
        <p className="soft-eyebrow mb-4">недавние разборы</p>
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
                <p style={{ fontSize: 12.5, color: "var(--soft-ink-faint)", marginTop: 2 }}>{d.topic ?? "разбор"} · {d.status.toLowerCase()}</p>
              </div>
            </div>
            <Link href={mainUrl(`/checkin?dialogueId=${d.id}`)} className="soft-chip shrink-0">Открыть →</Link>
          </div>
        ))}
      </div>

      {/* Next action + Recent questions */}
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        <section className="soft-card p-5" data-testid="client-next-action">
          <p className="soft-eyebrow">Следующий шаг</p>
          <h2 className="soft-h3 mt-3">{nextAction.label}</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{nextAction.hint}</p>
          <Link href={nextAction.href} className="soft-button soft-button-primary mt-5">
            Продолжить
          </Link>
        </section>
        <section className="soft-card p-5" data-testid="client-recent-questions">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="soft-eyebrow">История разборов</p>
            <Link href={appUrl("/questions")} className="text-sm font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
              Все →
            </Link>
          </div>
          {recentDialogues.length === 0 ? (
            <p className="text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>Здесь появятся последние диалоги.</p>
          ) : recentDialogues.slice(0, 3).map((dialogue) => (
            <Link key={dialogue.id} href={mainUrl(`/checkin?dialogueId=${dialogue.id}`)}
              className="soft-card-flat mb-2 block p-3 transition-colors hover:border-[var(--soft-terracotta)]">
              <p className="line-clamp-1 text-sm font-semibold" style={{ color: "var(--soft-ink)" }}>{dialogue.title}</p>
              <p className="mt-1 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
                {dialogue.topic ?? "вопрос"} · {dialogue.updatedAt.toLocaleDateString("ru-RU")}
              </p>
            </Link>
          ))}
        </section>
      </div>

      {/* Daily card */}
      <section className="soft-card soft-form-panel mb-4" data-testid="client-daily-card">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="soft-eyebrow">Карта дня</p>
            <h2 className="mt-3 font-heading text-3xl font-medium" style={{ color: "var(--soft-bordeaux)" }}>{dailyCard.title}</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{dailyCard.body}</p>
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

      {/* Gentle milestones */}
      <section className="soft-card mb-4 p-5" data-testid="client-gentle-milestones">
        <p className="soft-eyebrow">Мягкий ритм</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="rounded-[12px] border border-[var(--soft-paper-edge)] p-4" style={{ background: "var(--soft-paper-deep)" }}>
            <p className="font-heading text-3xl" style={{ color: "var(--soft-bordeaux)" }}>{clarityCredits}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>кредитов ясности</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
          Здесь нет штрафов, дедлайнов и давления. Ритм нужен только как напоминание,
          что маленькие возвращения к себе тоже считаются.
        </p>
      </section>

      {/* v4: card-flat "подсказка от карты" */}
      <div className="soft-card-flat p-5">
        <p className="soft-eyebrow mb-3">подсказка от карты</p>
        <p className="soft-h3 mt-2 font-normal soft-italic" style={{ color: "var(--soft-ink-soft)", lineHeight: 1.5 }}>
          {currentTheme
            ? `За последние разборы карта замечает тему «${currentTheme}». Возможно, маршрут «7 дней к ясности» сейчас будет уместен.`
            : "Карта собирает повторяющиеся темы после каждого разбора. Начните первый диалог — и карта начнёт наблюдать."}
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href={appUrl("/products")} className="soft-button soft-button-primary" style={{ fontSize: 13 }}>
            Начать маршрут
          </Link>
          <Link href={mainUrl("/practitioners")} className="soft-button soft-button-ghost" style={{ fontSize: 13 }}>
            Подобрать специалиста
          </Link>
          <Link href={appUrl("/products")} className="soft-chip" style={{ fontSize: 12 }}>
            Глубокий отчёт →
          </Link>
        </div>
      </div>
    </div>
  );
}
