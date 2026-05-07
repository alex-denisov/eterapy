export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getOrCreateDailyCard } from "@/lib/daily-card";
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

  const [recentDialogues, upcomingBooking, userData, dialogueCount, productCount, activeRoutes, dailyCardResult, dailyCardCount] = await Promise.all([
    db.dialogue.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 4,
      select: { id: true, title: true, status: true, topic: true, updatedAt: true },
    }),
    db.booking.findFirst({
      where: { clientId: userId, status: { in: ["PENDING", "CONFIRMED"] } },
      orderBy: { createdAt: "desc" },
      include: { practitioner: { include: { user: { select: { name: true } } } } },
    }),
    db.user.findUnique({ where: { id: userId }, select: { balance: true } }),
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
  ]);

  const balanceRub = Math.floor((userData?.balance ?? 0) / 100);
  const firstName = session.user?.name?.split(" ")[0] ?? "пользователь";

  const topicCounts: Record<string, number> = {};
  for (const d of recentDialogues) {
    if (d.topic) topicCounts[d.topic] = (topicCounts[d.topic] ?? 0) + 1;
  }
  const currentTheme = Object.entries(topicCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const nextAction = activeRoutes[0]
    ? { href: mainUrl("/products/seven-days"), label: `Продолжить ${activeRoutes[0].title}`, hint: `${activeRoutes[0].currentDay} день · ${activeRoutes[0].status === "PAUSED" ? "пауза" : "активен"}` }
    : recentDialogues[0]
      ? { href: mainUrl(`/checkin?dialogueId=${recentDialogues[0].id}`), label: "Вернуться к последнему вопросу", hint: recentDialogues[0].status === "ANSWERED" ? "ответ уже готов" : "можно продолжить" }
      : { href: mainUrl("/checkin"), label: "Задать первый вопрос", hint: "начните с бесплатного первичного ответа" };

  const dailyCard = dailyCardResult.card;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }}>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
        <div>
          <p className="soft-eyebrow">мой кабинет</p>
          <h1 className="soft-h1 mt-2">
            С возвращением, <span className="soft-italic">{firstName}</span>
          </h1>
        </div>
        <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary">
          Новый разбор
        </Link>
      </div>

      {/* v4 3-column stat grid */}
      <div className="grid gap-4 md:grid-cols-3 mb-6">
        {/* Current theme */}
        <div
          className="soft-card"
          data-testid="client-map-preview"
          style={{ background: "linear-gradient(140deg, #E8C4B8, #F4D5C8)", padding: 22 }}
        >
          <p className="soft-eyebrow">текущая тема</p>
          {currentTheme ? (
            <>
              <p
                style={{
                  fontFamily: "var(--font-heading, serif)",
                  fontSize: 22,
                  color: "var(--soft-bordeaux)",
                  fontWeight: 500,
                  lineHeight: 1.3,
                  marginTop: 8,
                }}
              >
                {currentTheme}
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
                {dialogueCount} {dialogueCount === 1 ? "разбор" : dialogueCount >= 2 && dialogueCount <= 4 ? "разбора" : "разборов"} за всё время
              </p>
            </>
          ) : (
            <p
              style={{
                fontFamily: "var(--font-heading, serif)",
                fontSize: 18,
                color: "var(--soft-bordeaux)",
                fontWeight: 500,
                lineHeight: 1.3,
                marginTop: 8,
                fontStyle: "italic",
              }}
            >
              Начните первый разбор
            </p>
          )}
          <Link href={appUrl("/cabinet/action-history")} className="soft-chip inline-block" style={{ marginTop: 16 }}>
            Открыть карту →
          </Link>
        </div>

        {/* Subscription / balance */}
        <div className="soft-card" style={{ padding: 22 }}>
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
            Базовая
          </p>
          {balanceRub > 0 && (
            <p className="mt-2 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
              Баланс: {balanceRub.toLocaleString("ru")} ₽
            </p>
          )}
          <Link href={appUrl("/cabinet/billing")} className="soft-chip inline-block" style={{ marginTop: 16 }}>
            Управлять →
          </Link>
        </div>

        {/* Upcoming meeting */}
        <div className="soft-card" style={{ padding: 22 }}>
          <p className="soft-eyebrow">ближайшая встреча</p>
          {upcomingBooking ? (
            <>
              <p
                style={{
                  fontFamily: "var(--font-heading, serif)",
                  fontSize: 20,
                  color: "var(--soft-bordeaux)",
                  fontWeight: 500,
                  marginTop: 8,
                }}
              >
                {upcomingBooking.practitioner.user.name}
              </p>
              <p className="mt-2 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
                {upcomingBooking.priceRub.toLocaleString("ru")} ₽ · {upcomingBooking.status === "CONFIRMED" ? "подтверждено" : "ожидает"}
              </p>
            </>
          ) : (
            <p
              style={{
                fontFamily: "var(--font-heading, serif)",
                fontSize: 17,
                color: "var(--soft-ink-soft)",
                fontStyle: "italic",
                lineHeight: 1.4,
                marginTop: 8,
              }}
            >
              Нет предстоящих записей
            </p>
          )}
          <Link href={appUrl("/cabinet/bookings")} className="soft-chip inline-block" style={{ marginTop: 16 }}>
            Все записи →
          </Link>
        </div>
      </div>

      {/* Next action + Recent questions */}
      <div className="grid gap-4 md:grid-cols-2 mb-6">
        <section className="soft-card p-6" data-testid="client-next-action">
          <p className="soft-eyebrow">Следующий шаг</p>
          <h2 className="soft-h3 mt-3">{nextAction.label}</h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{nextAction.hint}</p>
          <Link href={nextAction.href} className="soft-button soft-button-primary mt-5">
            Продолжить
          </Link>
        </section>
        <section className="soft-card p-6" data-testid="client-recent-questions">
          <div className="flex items-center justify-between gap-3 mb-4">
            <p className="soft-eyebrow">Мои вопросы</p>
            <Link href={appUrl("/cabinet/questions")} className="text-sm font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
              Все →
            </Link>
          </div>
          {recentDialogues.length === 0 ? (
            <p className="text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>Здесь появятся последние диалоги.</p>
          ) : recentDialogues.slice(0, 3).map((dialogue) => (
            <Link key={dialogue.id} href={mainUrl(`/checkin?dialogueId=${dialogue.id}`)}
              className="block rounded-2xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.45)] p-3 mb-2 transition-colors hover:border-[var(--soft-terracotta)]">
              <p className="line-clamp-1 text-sm font-semibold" style={{ color: "var(--soft-ink)" }}>{dialogue.title}</p>
              <p className="mt-1 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
                {dialogue.topic ?? "вопрос"} · {dialogue.updatedAt.toLocaleDateString("ru-RU")}
              </p>
            </Link>
          ))}
        </section>
      </div>

      {/* Recent dialogues list (v4 style) */}
      <div className="soft-card mb-6" style={{ padding: 22 }}>
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
              <span className="shrink-0" style={{ fontSize: 12, color: "var(--soft-ink-faint)", width: 90, paddingTop: 2 }}>
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

      {/* Daily card */}
      <section className="soft-card soft-form-panel mb-6" data-testid="client-daily-card">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="soft-eyebrow">Карта дня</p>
            <h2 className="mt-3 font-heading text-3xl font-medium" style={{ color: "var(--soft-bordeaux)" }}>{dailyCard.title}</h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{dailyCard.body}</p>
          </div>
          <div className="rounded-3xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.5)] p-5">
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
          </div>
        </div>
      </section>

      {/* Gentle milestones */}
      <section className="soft-card p-6 mb-6" data-testid="client-gentle-milestones">
        <p className="soft-eyebrow">Мягкий ритм</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.48)] p-4">
            <p className="font-heading text-3xl" style={{ color: "var(--soft-bordeaux)" }}>{dailyCardCount}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>карт дня открыто</p>
          </div>
          <div className="rounded-2xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.48)] p-4">
            <p className="font-heading text-3xl" style={{ color: "var(--soft-bordeaux)" }}>{dialogueCount}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>вопросов сохранено</p>
          </div>
          <div className="rounded-2xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.48)] p-4">
            <p className="font-heading text-3xl" style={{ color: "var(--soft-bordeaux)" }}>{productCount}</p>
            <p className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>результатов в карте</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
          Здесь нет штрафов, дедлайнов и давления. Ритм нужен только как напоминание,
          что маленькие возвращения к себе тоже считаются.
        </p>
      </section>

      {/* Map hint card-flat (v4) */}
      <div className="soft-card-flat" style={{ padding: 22 }}>
        <p className="soft-eyebrow mb-3">подсказка от карты</p>
        <p
          style={{
            fontFamily: "var(--font-heading, serif)",
            fontStyle: "italic",
            fontSize: 19,
            color: "var(--soft-ink-soft)",
            lineHeight: 1.5,
          }}
        >
          {currentTheme
            ? `За последние разборы карта замечает тему «${currentTheme}». Возможно, маршрут «7 дней к ясности» сейчас будет уместен.`
            : "Карта собирает повторяющиеся темы после каждого разбора. Начните первый диалог — и карта начнёт наблюдать."}
        </p>
        <div className="flex flex-wrap gap-3 mt-4">
          <Link href={mainUrl("/products/seven-days")} className="soft-button soft-button-primary" style={{ fontSize: 13 }}>
            Начать маршрут
          </Link>
          <Link href={mainUrl("/products/deep-report")} className="soft-button soft-button-ghost" style={{ fontSize: 13 }}>
            Глубокий отчёт
          </Link>
        </div>
      </div>
    </div>
  );
}
