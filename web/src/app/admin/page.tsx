export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingStatus, PractitionerStatus, TransactionStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { AdminActions } from "./admin-actions";
import { DeepMetrics } from "./deep-metrics";

const PRODUCT_PRICES_RUB: Record<string, number> = {
  perspectives: 299,
  "deep-report": 590,
  "chat-analysis": 390,
  compatibility: 590,
  circle: 790,
  pair: 790,
  "seven-days": 990,
  "my-map": 990,
};

const PRODUCT_NAMES: Record<string, string> = {
  perspectives: "4 ракурса",
  "deep-report": "Глубокий отчёт",
  "chat-analysis": "Анализ переписки",
  compatibility: "Совместимость",
  circle: "Круг ясности",
  pair: "Разобраться вдвоём",
  "seven-days": "7 дней к ясности",
  "my-map": "Моя карта",
};

function formatRub(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function formatNumber(value: number) {
  return value.toLocaleString("ru-RU");
}

function conversion(part: number, total: number) {
  if (total <= 0) return "0%";
  return `${Math.round((part / total) * 100)}%`;
}

function statusTone(value: number) {
  if (value <= 0) return "ok";
  if (value < 5) return "warn";
  return "danger";
}

async function getStats(canViewBusiness: boolean) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(now);
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const [
    totalUsers,
    totalClients,
    totalPractitioners,
    activePractitioners,
    pendingPractitioners,
    totalBookings,
    pendingBookings,
    confirmedBookings,
    completedBookings,
    openComplaints,
    heldPayouts,
    complianceSignals,
    recentBookings,
    pendingPractitionersList,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: "CLIENT" } }),
    db.practitioner.count(),
    db.practitioner.count({ where: { status: PractitionerStatus.ACTIVE } }),
    db.practitioner.count({ where: { status: PractitionerStatus.PENDING } }),
    db.booking.count(),
    db.booking.count({ where: { status: BookingStatus.PENDING } }),
    db.booking.count({ where: { status: BookingStatus.CONFIRMED } }),
    db.booking.count({ where: { status: BookingStatus.COMPLETED } }),
    db.complaint.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }),
    db.payout.count({ where: { status: "HELD" } }),
    db.videoSession.count({ where: { complianceRiskScore: { gte: 50 } } }),
    db.booking.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: {
        client: { select: { name: true, email: true } },
        practitioner: { include: { user: { select: { name: true } } } },
      },
    }),
    db.practitioner.findMany({
      where: { status: PractitionerStatus.PENDING },
      include: { user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "asc" },
      take: 8,
    }),
  ]);

  if (!canViewBusiness) {
    return {
      totalUsers,
      totalClients,
      totalPractitioners,
      activePractitioners,
      pendingPractitioners,
      totalBookings,
      pendingBookings,
      confirmedBookings,
      completedBookings,
      openComplaints,
      heldPayouts,
      complianceSignals,
      recentBookings,
      pendingPractitionersList,
      business: null,
    };
  }

  const [
    newClientsToday,
    newClientsMonth,
    bookingRevenue30d,
    bookingRevenueAll,
    totalBalance,
    clarityCreditBalance,
    activeSubscriptions,
    productEntitlements30d,
    productEntitlementsAll,
    dialogues30d,
    answersViewed30d,
    triagePrimaryClicked30d,
    triageSecondaryClicked30d,
    triageSubscriptionClicked30d,
    creditsSpendClicked30d,
  ] = await Promise.all([
    db.user.count({ where: { role: "CLIENT", createdAt: { gte: startOfToday, lt: startOfTomorrow } } }),
    db.user.count({ where: { role: "CLIENT", createdAt: { gte: startOfMonth } } }),
    db.booking.aggregate({
      _sum: { priceRub: true },
      where: { status: BookingStatus.COMPLETED, priceRub: { gt: 0 }, updatedAt: { gte: thirtyDaysAgo } },
    }),
    db.booking.aggregate({
      _sum: { priceRub: true },
      where: { status: BookingStatus.COMPLETED, priceRub: { gt: 0 } },
    }),
    db.user.aggregate({ _sum: { balance: true } }),
    db.clarityCreditLedgerEntry.aggregate({
      _sum: { amount: true },
      where: { status: "confirmed" },
    }),
    db.userSubscription.count({ where: { status: { in: ["TRIALING", "ACTIVE"] } } }),
    db.productEntitlement.groupBy({
      by: ["productKey"],
      where: { source: "purchase", status: "ACTIVE", createdAt: { gte: thirtyDaysAgo } },
      _count: { id: true },
    }),
    db.productEntitlement.count({ where: { source: "purchase", status: "ACTIVE" } }),
    db.analyticsEvent.count({ where: { event: "dialogue_created", createdAt: { gte: thirtyDaysAgo } } }),
    db.analyticsEvent.count({ where: { event: "primary_answer_viewed", createdAt: { gte: thirtyDaysAgo } } }),
    db.analyticsEvent.count({ where: { event: "triage_primary_clicked", createdAt: { gte: thirtyDaysAgo } } }),
    db.analyticsEvent.count({ where: { event: "triage_secondary_clicked", createdAt: { gte: thirtyDaysAgo } } }),
    db.analyticsEvent.count({ where: { event: "triage_subscription_clicked", createdAt: { gte: thirtyDaysAgo } } }),
    db.analyticsEvent.count({ where: { event: "credits_spend_clicked", createdAt: { gte: thirtyDaysAgo } } }),
  ]);

  const transactionLinkedEntitlements = await db.productEntitlement.findMany({
    where: {
      source: "purchase",
      status: "ACTIVE",
      createdAt: { gte: thirtyDaysAgo },
      transactionId: { not: null },
    },
    select: { transactionId: true },
  });
  const transactionIds = [...new Set(transactionLinkedEntitlements.map((item) => item.transactionId).filter(Boolean))] as string[];
  const linkedTransactions = transactionIds.length > 0
    ? await db.transaction.findMany({
      where: { id: { in: transactionIds }, status: TransactionStatus.SUCCEEDED },
      select: { amount: true },
    })
    : [];
  const transactionProductRevenue = linkedTransactions.reduce((sum, tx) => sum + Math.abs(tx.amount), 0) / 100;

  const productRevenue = productEntitlements30d
    .map((row) => ({
      productKey: row.productKey,
      name: PRODUCT_NAMES[row.productKey] ?? row.productKey,
      count: row._count.id,
      estimateRub: (PRODUCT_PRICES_RUB[row.productKey] ?? 0) * row._count.id,
    }))
    .sort((a, b) => b.estimateRub - a.estimateRub);
  const estimatedProductRevenueRub = productRevenue.reduce((sum, row) => sum + row.estimateRub, 0);

  return {
    totalUsers,
    totalClients,
    totalPractitioners,
    activePractitioners,
    pendingPractitioners,
    totalBookings,
    pendingBookings,
    confirmedBookings,
    completedBookings,
    openComplaints,
    heldPayouts,
    complianceSignals,
    recentBookings,
    pendingPractitionersList,
    business: {
      newClientsToday,
      newClientsMonth,
      bookingRevenue30d: bookingRevenue30d._sum.priceRub ?? 0,
      bookingRevenueAll: bookingRevenueAll._sum.priceRub ?? 0,
      totalBalanceRub: Math.round((totalBalance._sum.balance ?? 0) / 100),
      clarityCreditBalance: clarityCreditBalance._sum.amount ?? 0,
      activeSubscriptions,
      productEntitlementsAll,
      productRevenue,
      estimatedProductRevenueRub,
      transactionProductRevenueRub: Math.round(transactionProductRevenue),
      dialogues30d,
      answersViewed30d,
      triagePrimaryClicked30d,
      triageSecondaryClicked30d,
      triageSubscriptionClicked30d,
      creditsSpendClicked30d,
    },
  };
}

export default async function AdminPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  const canViewBusiness = role === "SUPERADMIN" || permissions.includes("analytics.view");
  const stats = await getStats(canViewBusiness);
  const business = stats.business;

  const operations = [
    { label: "Пользователи", value: stats.totalUsers, href: "/admin/users", hint: `${formatNumber(stats.totalClients)} клиентов` },
    { label: "Практики", value: stats.activePractitioners, href: "/admin/users?role=PRACTITIONER", hint: `${formatNumber(stats.pendingPractitioners)} на проверке` },
    { label: "Бронирования", value: stats.totalBookings, href: "/admin/bookings", hint: `${formatNumber(stats.pendingBookings)} ожидают` },
    { label: "Завершено", value: stats.completedBookings, href: "/admin/bookings?status=COMPLETED", hint: conversion(stats.completedBookings, stats.totalBookings) },
  ];

  const urgentTasks = [
    { label: "Жалобы ждут решения", value: stats.openComplaints, href: "/admin/complaints", tone: statusTone(stats.openComplaints) },
    { label: "Выплаты в hold", value: stats.heldPayouts, href: "/admin/payments", tone: statusTone(stats.heldPayouts) },
    { label: "Комплаенс-сессии", value: stats.complianceSignals, href: "/admin/logs", tone: statusTone(stats.complianceSignals) },
  ];

  const funnel = business ? [
    { label: "Диалоги", value: business.dialogues30d, rate: "старт" },
    { label: "Ответ открыт", value: business.answersViewed30d, rate: conversion(business.answersViewed30d, business.dialogues30d) },
    { label: "Главный paid CTA", value: business.triagePrimaryClicked30d, rate: conversion(business.triagePrimaryClicked30d, business.answersViewed30d) },
    { label: "Другие углубления", value: business.triageSecondaryClicked30d, rate: conversion(business.triageSecondaryClicked30d, business.answersViewed30d) },
    { label: "Подписка", value: business.triageSubscriptionClicked30d, rate: conversion(business.triageSubscriptionClicked30d, business.answersViewed30d) },
    { label: "Кредиты", value: business.creditsSpendClicked30d, rate: conversion(business.creditsSpendClicked30d, business.answersViewed30d) },
  ] : [];

  return (
    <div className="premium-page mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-v41-overview">
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="premium-eyebrow">админ · бизнес-центр</p>
          <h1 className="premium-title mt-2 text-3xl md:text-5xl">Обзор платформы</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            ETerapy · продажи, операции, кризисные и комплаенс-сигналы в одном месте
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-[var(--soft-ink-soft)]">
          <span className="soft-admin-status-pill" data-tone={canViewBusiness ? "ok" : "warn"}>
            {canViewBusiness ? "business metrics" : "операционный доступ"}
          </span>
          <Link className="soft-admin-action" href="/admin/system">система</Link>
        </div>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {operations.map((item) => (
          <Link key={item.label} href={item.href} className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)] transition-colors hover:border-[var(--soft-terracotta)]">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--soft-ink-faint)]">{item.label}</p>
            <p className="mt-2 font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">{formatNumber(item.value)}</p>
            <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">{item.hint}</p>
          </Link>
        ))}
      </div>

      <div className="mb-6 grid gap-3 lg:grid-cols-3" data-testid="admin-urgent-tasks">
        {urgentTasks.map((task) => (
          <Link key={task.label} href={task.href} className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)] transition-colors hover:border-[var(--soft-terracotta)]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--soft-ink-faint)]">{task.label}</p>
                <p className="mt-2 font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">{formatNumber(task.value)}</p>
              </div>
              <span className="soft-admin-status-pill" data-tone={task.tone}>открыть</span>
            </div>
          </Link>
        ))}
      </div>

      {business ? (
        <>
          <section className="mb-6 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]" data-testid="admin-cta-monetization-funnel">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Воронка бесплатное → платное за 30 дней</h2>
                <p className="text-xs text-[var(--soft-ink-faint)]">Основной сигнал по CTA после Диалога ясности и paid-углублениям — one primary CTA.</p>
              </div>
              <span className="soft-admin-status-pill" data-tone="ok">AnalyticsEvent</span>
            </div>
            <div className="grid gap-2 lg:grid-cols-6">
              {funnel.map((step) => (
                <div key={step.label} className="rounded-md border border-[var(--soft-paper-edge)] bg-white/55 p-3">
                  <p className="text-[0.68rem] font-semibold uppercase tracking-wide text-[var(--soft-ink-faint)]">{step.label}</p>
                  <p className="mt-1 font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">{formatNumber(step.value)}</p>
                  <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">{step.rate}</p>
                </div>
              ))}
            </div>
          </section>

          <div className="mb-6 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
              <h2 className="mb-3 font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Деньги и покупки</h2>
              <div className="overflow-x-auto">
                <table className="soft-admin-data-table">
                  <thead>
                    <tr>
                      <th>Метрика</th>
                      <th>Значение</th>
                      <th>Пояснение</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr><td>Новых клиентов сегодня</td><td>{formatNumber(business.newClientsToday)}</td><td>CLIENT за текущие сутки</td></tr>
                    <tr><td>Новых клиентов в месяце</td><td>{formatNumber(business.newClientsMonth)}</td><td>CLIENT с начала месяца</td></tr>
                    <tr><td>Выручка сессий 30 дней</td><td>{formatRub(business.bookingRevenue30d)}</td><td>COMPLETED бронирования</td></tr>
                    <tr><td>Выручка цифровых продуктов 30 дней</td><td>{formatRub(business.transactionProductRevenueRub || business.estimatedProductRevenueRub)}</td><td>{business.transactionProductRevenueRub ? "по транзакциям" : "оценка по ProductEntitlement"}</td></tr>
                    <tr><td>Активные подписки</td><td>{formatNumber(business.activeSubscriptions)}</td><td>TRIALING + ACTIVE</td></tr>
                    <tr><td>Баланс клиентов</td><td>{formatRub(business.totalBalanceRub)}</td><td>денежный баланс в кабинетах</td></tr>
                    <tr><td>Баланс кредитов ясности</td><td>{formatNumber(business.clarityCreditBalance)}</td><td>confirmed ledger net</td></tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
              <h2 className="mb-3 font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Продукты за 30 дней</h2>
              <div className="overflow-x-auto">
                <table className="soft-admin-data-table">
                  <thead>
                    <tr>
                      <th>Продукт</th>
                      <th>Покупки</th>
                      <th>Оценка</th>
                    </tr>
                  </thead>
                  <tbody>
                    {business.productRevenue.length === 0 ? (
                      <tr><td colSpan={3}>Покупок пока нет</td></tr>
                    ) : business.productRevenue.map((row) => (
                      <tr key={row.productKey}>
                        <td>{row.name}</td>
                        <td>{formatNumber(row.count)}</td>
                        <td>{formatRub(row.estimateRub)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td>Всего ProductEntitlement</td>
                      <td>{formatNumber(business.productEntitlementsAll)}</td>
                      <td>за весь период</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          </div>

          {/* T3: deep product metrics migrated from the standalone /admin/metrics
              page so Обзор is the single business-monitoring center. */}
          <section className="mb-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Продуктовые метрики</h2>
              <span className="soft-admin-status-pill" data-tone="ok">DAU · MAU · churn · воронка</span>
            </div>
            <DeepMetrics />
          </section>
        </>
      ) : (
        <section className="mb-6 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 text-sm text-[var(--soft-ink-soft)] shadow-[var(--soft-shadow-sm)]">
          Финансовая и продуктовая аналитика скрыта: требуется роль SUPERADMIN или permission <code>analytics.view</code>.
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Практики на проверке</h2>
            <span className="soft-admin-status-pill" data-tone={statusTone(stats.pendingPractitioners)}>{stats.pendingPractitioners}</span>
          </div>
          {stats.pendingPractitionersList.length === 0 ? (
            <p className="text-sm text-[var(--soft-ink-faint)]">Нет заявок на проверке</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="soft-admin-data-table">
                <thead><tr><th>Кандидат</th><th>Email</th><th>Направление</th><th>Действия</th></tr></thead>
                <tbody>
                  {stats.pendingPractitionersList.map((p) => (
                    <tr key={p.id}>
                      <td>{p.user.name}</td>
                      <td>{p.user.email}</td>
                      <td>{p.title}</td>
                      <td><AdminActions practitionerId={p.id} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Последние бронирования</h2>
            <span className="soft-admin-status-pill" data-tone={statusTone(stats.pendingBookings)}>{stats.confirmedBookings} подтверждено</span>
          </div>
          {stats.recentBookings.length === 0 ? (
            <p className="text-sm text-[var(--soft-ink-faint)]">Нет бронирований</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="soft-admin-data-table">
                <thead><tr><th>Клиент</th><th>Практик</th><th>Сумма</th><th>Статус</th><th>Создано</th></tr></thead>
                <tbody>
                  {stats.recentBookings.map((booking) => (
                    <tr key={booking.id}>
                      <td>{booking.client.name}</td>
                      <td>{booking.practitioner.user.name}</td>
                      <td>{formatRub(booking.priceRub)}</td>
                      <td><span className="soft-admin-status-pill" data-tone={booking.status === "COMPLETED" ? "ok" : booking.status === "CANCELLED" ? "danger" : "warn"}>{booking.status}</span></td>
                      <td>{new Date(booking.createdAt).toLocaleDateString("ru-RU")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
