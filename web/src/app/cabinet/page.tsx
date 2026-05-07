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

  const [recentBookings, userData, dialogueCount, recentDialogues, productCount, activeRoutes, dailyCardResult, dailyCardCount] = await Promise.all([
    db.booking.findMany({
      where: { clientId: userId },
      orderBy: { createdAt: "desc" },
      take: 3,
      include: { practitioner: { include: { user: { select: { name: true } } } } },
    }),
    db.user.findUnique({ where: { id: userId }, select: { balance: true } }),
    db.dialogue.count({ where: { userId, deletedAt: null } }),
    db.dialogue.findMany({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { id: true, title: true, status: true, topic: true, updatedAt: true },
    }),
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

  const mapProgress = Math.min(dialogueCount * 14 + productCount * 18 + activeRoutes.length * 12 + 18, 100);
  const nextAction = activeRoutes[0]
    ? { href: mainUrl("/products/seven-days"), label: `Продолжить ${activeRoutes[0].title}`, hint: `${activeRoutes[0].currentDay} день · ${activeRoutes[0].status === "PAUSED" ? "пауза" : "активен"}` }
    : recentDialogues[0]
      ? { href: mainUrl(`/checkin?dialogueId=${recentDialogues[0].id}`), label: "Вернуться к последнему вопросу", hint: recentDialogues[0].status === "ANSWERED" ? "ответ уже готов" : "можно продолжить" }
      : { href: mainUrl("/checkin"), label: "Задать первый вопрос", hint: "начните с бесплатного первичного ответа" };
  const dailyCard = dailyCardResult.card;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="soft-eyebrow">Кабинет клиента</p>
          <h1 className="soft-h1 mt-2">Добрый вечер, {firstName}</h1>
          <p className="mt-2 text-muted-foreground text-sm">{session.user?.email}</p>
        </div>
        <Link href={mainUrl("/checkin")} className="soft-button soft-button-primary w-full sm:w-auto">
          Новый разбор
        </Link>
      </div>

      <div className="grid gap-4 lg:grid-cols-3 mb-8">
        <section className="soft-card soft-form-panel lg:col-span-2" data-testid="client-map-preview">
          <p className="premium-eyebrow">Ваш прогресс</p>
          <h2 className="mt-3 font-heading text-3xl font-medium text-[var(--soft-bordeaux)]">
            Карта собирает повторяющиеся темы
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground">
            После каждого разбора здесь появляются вопросы, инсайты, маршруты и бережные рекомендации.
          </p>
          <div className="mt-6 h-3 overflow-hidden rounded-full bg-[var(--soft-paper-edge)]">
            <div className="h-full rounded-full bg-[var(--soft-terracotta)] transition-all" style={{ width: `${mapProgress}%` }} />
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <span className="soft-chip soft-chip-warm">{dialogueCount} вопросов</span>
            <span className="soft-chip">{productCount} результатов</span>
            <span className="soft-chip">{activeRoutes.length} маршрутов</span>
            <Link href={appUrl("/cabinet/action-history")} className="soft-chip">Открыть карту →</Link>
          </div>
        </section>

        <section className="soft-card soft-form-panel">
          <p className="premium-eyebrow">Баланс</p>
          <p className="mt-4 font-heading text-4xl font-medium tabular-nums text-[var(--soft-bordeaux)]">
            {balanceRub.toLocaleString("ru")} ₽
          </p>
          <Link href={appUrl("/cabinet/billing")} className="soft-button soft-button-ghost mt-5 w-full">
            Пополнить
          </Link>
        </section>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="soft-card p-6" data-testid="client-next-action">
          <p className="soft-eyebrow">Следующий шаг</p>
          <h2 className="soft-h3 mt-3">{nextAction.label}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{nextAction.hint}</p>
          <Link href={nextAction.href} className="soft-button soft-button-primary mt-5">
            Продолжить
          </Link>
        </section>
        <section className="soft-card p-6" data-testid="client-recent-questions">
          <div className="flex items-center justify-between gap-3">
            <p className="soft-eyebrow">Мои вопросы</p>
            <Link href={appUrl("/cabinet/questions")} className="text-sm font-semibold text-[var(--soft-bordeaux)]">
              Все →
            </Link>
          </div>
          <div className="mt-4 space-y-3">
            {recentDialogues.length === 0 ? (
              <p className="text-sm leading-relaxed text-[var(--soft-ink-soft)]">Здесь появятся последние диалоги.</p>
            ) : recentDialogues.map((dialogue) => (
              <Link key={dialogue.id} href={mainUrl(`/checkin?dialogueId=${dialogue.id}`)}
                className="block rounded-2xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.45)] p-3 transition-colors hover:border-[var(--soft-terracotta)]">
                <p className="line-clamp-1 text-sm font-semibold text-[var(--soft-ink)]">{dialogue.title}</p>
                <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">
                  {dialogue.topic ?? "вопрос"} · {dialogue.status.toLowerCase()} · {dialogue.updatedAt.toLocaleDateString("ru-RU")}
                </p>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section className="soft-card soft-form-panel mb-8" data-testid="client-daily-card">
        <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr] lg:items-center">
          <div>
            <p className="soft-eyebrow">Карта дня</p>
            <h2 className="mt-3 font-heading text-3xl font-medium text-[var(--soft-bordeaux)]">{dailyCard.title}</h2>
            <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{dailyCard.body}</p>
          </div>
          <div className="rounded-3xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.5)] p-5">
            <p className="soft-eyebrow">Вопрос для себя</p>
            <p className="mt-3 font-heading text-2xl text-[var(--soft-ink)]">{dailyCard.prompt}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Link href={mainUrl(`/checkin?question=${encodeURIComponent(dailyCard.prompt)}`)}
                className="soft-button soft-button-primary"
                data-analytics-event="daily_card_question_clicked"
                data-analytics-surface="client_dashboard"
                data-analytics-target="daily_card_prompt">
                Разобрать вопрос
              </Link>
              <a href={mainUrl(`/share?from=daily-card&topic=${encodeURIComponent(dailyCard.title)}`)}
                className="soft-button soft-button-ghost"
                data-analytics-event="daily_card_share_clicked"
                data-analytics-surface="client_dashboard"
                data-analytics-target="daily_card_share">
                Поделиться
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="soft-card p-6 mb-8" data-testid="client-gentle-milestones">
        <p className="soft-eyebrow">Мягкий ритм</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.48)] p-4">
            <p className="font-heading text-3xl text-[var(--soft-bordeaux)]">{dailyCardCount}</p>
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">карт дня открыто</p>
          </div>
          <div className="rounded-2xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.48)] p-4">
            <p className="font-heading text-3xl text-[var(--soft-bordeaux)]">{dialogueCount}</p>
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">вопросов сохранено</p>
          </div>
          <div className="rounded-2xl border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.48)] p-4">
            <p className="font-heading text-3xl text-[var(--soft-bordeaux)]">{productCount}</p>
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">результатов в карте</p>
          </div>
        </div>
        <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Здесь нет штрафов, дедлайнов и давления. Ритм нужен только как напоминание,
          что маленькие возвращения к себе тоже считаются.
        </p>
      </section>

      <div className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Ближайшие записи</h2>
          <Link href={appUrl("/cabinet/bookings")} className="text-sm text-primary hover:underline">Все записи →</Link>
        </div>
        {recentBookings.length === 0 ? (
          <div className="soft-card p-6 text-center">
            <p className="text-muted-foreground text-sm">Нет предстоящих записей</p>
            <Link href={appUrl("/cabinet/practitioners")} className="mt-3 inline-block text-sm text-primary hover:underline">
              Найти практика →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {recentBookings.map((b) => (
              <div key={b.id} className="flex items-center justify-between rounded-xl border border-border/30 bg-card/30 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">{b.practitioner.user.name}</p>
                  <p className="text-xs text-muted-foreground">{b.priceRub.toLocaleString("ru")} ₽</p>
                </div>
                <span className={`text-xs ${b.status === "CONFIRMED" ? "text-green-400" : "text-yellow-400"}`}>
                  {b.status === "CONFIRMED" ? "Подтверждено" : "Ожидает"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Направления самопознания */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-heading text-lg font-semibold">Направления</h2>
          <Link href={appUrl("/cabinet/modalities")} className="text-sm text-primary hover:underline">Все →</Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { href: mainUrl("/checkin"), icon: "01", label: "Диалог ясности", desc: "Первичный ответ по вопросу" },
            { href: mainUrl("/products/deep-report"), icon: "02", label: "Глубокий отчет", desc: "Развернутое углубление" },
            { href: mainUrl("/products/seven-days"), icon: "03", label: "7 дней к ясности", desc: "Короткий маршрут на неделю" },
            { href: appUrl("/cabinet/action-history"), icon: "04", label: "Моя карта", desc: "Сохраненные выводы" },
          ].map((item) => (
            <Link key={item.href} href={item.href}
              className="soft-card flex items-center gap-3 p-4 transition-colors hover:border-[var(--soft-terracotta)]">
              <span className="font-heading text-2xl text-primary">{item.icon}</span>
              <div>
                <p className="text-sm font-medium">{item.label}</p>
                <p className="text-xs text-muted-foreground">{item.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
