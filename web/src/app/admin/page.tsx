export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { BookingStatus, PractitionerStatus, TransactionStatus } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { getBookingStatus } from "@/lib/booking-status";
import { getBillingTransactionMetadata } from "@/lib/entitlements";
import { AdminActions } from "./admin-actions";
import { DeepMetrics } from "./deep-metrics";

const PRODUCT_PRICES_RUB: Record<string, number> = {
  perspectives: 299,
  "deep-report": 590,
  "chat-analysis": 390,
  compatibility: 590,
  circle: 790,
  pair: 790,
};

const PRODUCT_NAMES: Record<string, string> = {
  perspectives: "Полная картина",
  "deep-report": "Подробный разбор",
  "chat-analysis": "Анализ переписки",
  compatibility: "Совместимость",
  circle: "Круг",
  pair: "Разобраться вдвоём",
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
    financeBookings,
    financeTransactions,
    payoutStatusSums,
    disputedComplaints,
    refundedBookings,
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
    db.booking.findMany({
      where: { status: BookingStatus.COMPLETED, priceRub: { gt: 0 } },
      select: {
        priceRub: true,
        updatedAt: true,
        commissionPercentApplied: true,
        practitioner: { select: { commissionPercent: true } },
      },
    }),
    db.transaction.findMany({
      where: { status: TransactionStatus.SUCCEEDED },
      select: { amount: true, provider: true, metadata: true, createdAt: true },
    }),
    db.payout.groupBy({
      by: ["status"],
      _sum: { amountKopecks: true },
    }),
    db.complaint.findMany({
      where: { status: { in: ["OPEN", "REVIEWING"] } },
      select: { booking: { select: { priceRub: true } } },
    }),
    db.booking.aggregate({
      _sum: { priceRub: true },
      where: { status: BookingStatus.REFUNDED, priceRub: { gt: 0 } },
    }),
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
  const sessionGrossAllRub = financeBookings.reduce((sum, booking) => sum + booking.priceRub, 0);
  const sessionPlatformFeeAllRub = financeBookings.reduce((sum, booking) => {
    const commissionPercent = booking.commissionPercentApplied ?? booking.practitioner.commissionPercent ?? 35;
    return sum + Math.round((booking.priceRub * commissionPercent) / 100);
  }, 0);
  const sessionGross30dRub = financeBookings
    .filter((booking) => booking.updatedAt >= thirtyDaysAgo)
    .reduce((sum, booking) => sum + booking.priceRub, 0);
  const sessionPlatformFee30dRub = financeBookings
    .filter((booking) => booking.updatedAt >= thirtyDaysAgo)
    .reduce((sum, booking) => {
      const commissionPercent = booking.commissionPercentApplied ?? booking.practitioner.commissionPercent ?? 35;
      return sum + Math.round((booking.priceRub * commissionPercent) / 100);
    }, 0);
  const payoutAmountByStatus = new Map(
    payoutStatusSums.map((row) => [row.status, Math.round((row._sum.amountKopecks ?? 0) / 100)]),
  );
  const finance = financeTransactions.reduce((acc, tx) => {
    const metadata = getBillingTransactionMetadata(tx);
    const rub = Math.round(Math.abs(tx.amount) / 100);
    // Z1-Ф1: the client ₽ balance rail is removed — digital products are paid
    // by credits or card. Count every product transaction by magnitude.
    if (metadata.purchaseKind === "product") {
      acc.digitalProductRevenueRub += rub;
    }
    if (tx.amount > 0 && metadata.purchaseKind === "subscription") {
      if (metadata.planKey?.startsWith("practitioner_pro")) {
        acc.practitionerSubscriptionRevenueRub += rub;
      } else {
        acc.clientSubscriptionRevenueRub += rub;
      }
    }
    return acc;
  }, {
    digitalProductRevenueRub: 0,
    clientSubscriptionRevenueRub: 0,
    practitionerSubscriptionRevenueRub: 0,
  });

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
      sessionGrossAllRub,
      sessionGross30dRub,
      sessionPlatformFeeAllRub,
      sessionPlatformFee30dRub,
      practitionerNetAccruedRub: sessionGrossAllRub - sessionPlatformFeeAllRub,
      heldPayoutAmountRub: payoutAmountByStatus.get("HELD") ?? 0,
      pendingPayoutAmountRub: (payoutAmountByStatus.get("PENDING") ?? 0) + (payoutAmountByStatus.get("PROCESSING") ?? 0),
      paidPayoutAmountRub: payoutAmountByStatus.get("DONE") ?? 0,
      failedPayoutAmountRub: payoutAmountByStatus.get("FAILED") ?? 0,
      disputedPotentialRefundsRub: disputedComplaints.reduce((sum, complaint) => sum + complaint.booking.priceRub, 0),
      refundedBookingsRub: refundedBookings._sum.priceRub ?? 0,
      ...finance,
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
    { label: "Баллы", value: business.creditsSpendClicked30d, rate: conversion(business.creditsSpendClicked30d, business.answersViewed30d) },
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
                <p className="text-xs text-[var(--soft-ink-faint)]">Основной сигнал по CTA после разбора и paid-углублениям — one primary CTA.</p>
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

          <div className="mb-6 grid gap-4">
            {/* V5: the owner financial loop rendered as grouped metric cards
                (revenue / payouts / refunds / balances / clients) instead of a
                dense 19-row table, so the full picture is scannable at a glance. */}
            <section className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 shadow-[var(--soft-shadow-sm)]" data-testid="admin-owner-finance">
              <h2 className="mb-1 font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">Финансовые метрики</h2>
              <p className="mb-4 text-xs text-[var(--soft-ink-faint)]">Полная финансовая картина платформы — выручка, выплаты практикам, возвраты и обязательства.</p>

              {/* X3: «Итог» — чистая прибыль и долг практикам одним взглядом,
                  выведены из уже посчитанных показателей. */}
              <div className="mb-4 grid gap-3 sm:grid-cols-2" data-testid="admin-finance-headline">
                <div className="rounded-lg bg-[var(--soft-surface)] p-3">
                  <p className="text-xs text-[var(--soft-ink-faint)]">Чистая прибыль (оценка)</p>
                  <p className="font-heading text-2xl font-semibold text-[var(--soft-bordeaux)] tabular-nums">
                    {formatRub(
                      business.sessionPlatformFeeAllRub
                      + (business.digitalProductRevenueRub || 0)
                      + business.clientSubscriptionRevenueRub
                      + business.practitionerSubscriptionRevenueRub
                      - business.refundedBookingsRub,
                    )}
                  </p>
                  <p className="text-[11px] text-[var(--soft-ink-faint)]">комиссия + продукты + подписки − возвраты (до расходов на AI и эквайринг)</p>
                </div>
                <div className="rounded-lg bg-[var(--soft-surface)] p-3">
                  <p className="text-xs text-[var(--soft-ink-faint)]">Должны практикам (нетто)</p>
                  <p className="font-heading text-2xl font-semibold text-[var(--soft-bordeaux)] tabular-nums">
                    {formatRub(business.practitionerNetAccruedRub - business.paidPayoutAmountRub)}
                  </p>
                  <p className="text-[11px] text-[var(--soft-ink-faint)]">начислено − уже выплачено (вкл. hold и ожидающие)</p>
                </div>
              </div>
              {[
                {
                  title: "Выручка",
                  items: [
                    { label: "Оборот сессий · 30 дней", value: formatRub(business.sessionGross30dRub), hint: "COMPLETED бронирования" },
                    { label: "Комиссия платформы · 30 дней", value: formatRub(business.sessionPlatformFee30dRub), hint: "доля ETerapy в сессиях" },
                    { label: "Оборот сессий · всё время", value: formatRub(business.sessionGrossAllRub), hint: "принесено практиками" },
                    { label: "Цифровые продукты", value: formatRub(business.digitalProductRevenueRub || business.transactionProductRevenueRub || business.estimatedProductRevenueRub), hint: "услуги и углубления" },
                    { label: "Клиентские подписки", value: formatRub(business.clientSubscriptionRevenueRub), hint: "Plus / Premium" },
                    { label: "Подписки практиков", value: formatRub(business.practitionerSubscriptionRevenueRub), hint: "Practitioner Pro / Pro+" },
                  ],
                },
                {
                  title: "Выплаты практикам",
                  items: [
                    { label: "Начислено практикам", value: formatRub(business.practitionerNetAccruedRub), hint: "после комиссии платформы" },
                    { label: "Hold / escrow", value: formatRub(business.heldPayoutAmountRub), hint: "HELD из-за жалоб и risk-сигналов" },
                    { label: "Ожидает выплаты", value: formatRub(business.pendingPayoutAmountRub), hint: "PENDING + PROCESSING" },
                    { label: "Уже выплачено", value: formatRub(business.paidPayoutAmountRub), hint: "DONE выплаты" },
                  ],
                },
                {
                  title: "Возвраты и риски",
                  items: [
                    { label: "Потенциальные возвраты", value: formatRub(business.disputedPotentialRefundsRub), hint: "OPEN/REVIEWING жалобы" },
                    { label: "Фактические возвраты", value: formatRub(business.refundedBookingsRub), hint: "REFUNDED бронирования" },
                  ],
                },
                {
                  title: "Баллы",
                  items: [
                    { label: "Баллы", value: formatNumber(business.clarityCreditBalance), hint: "confirmed ledger net" },
                  ],
                },
                {
                  title: "Клиенты и подписки",
                  items: [
                    { label: "Новых клиентов сегодня", value: formatNumber(business.newClientsToday), hint: "CLIENT за сутки" },
                    { label: "Новых клиентов в месяце", value: formatNumber(business.newClientsMonth), hint: "CLIENT с начала месяца" },
                    { label: "Активные подписки", value: formatNumber(business.activeSubscriptions), hint: "TRIALING + ACTIVE" },
                  ],
                },
              ].map((group) => (
                <div key={group.title} className="mb-4 last:mb-0">
                  <p className="mb-2 text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-[var(--soft-ink-faint)]">{group.title}</p>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {group.items.map((item) => (
                      <div key={item.label} className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3">
                        <p className="text-[0.66rem] font-semibold uppercase tracking-wide text-[var(--soft-ink-faint)]">{item.label}</p>
                        <p className="mt-1 font-heading text-xl font-semibold text-[var(--soft-bordeaux)] tabular-nums">{item.value}</p>
                        <p className="mt-0.5 text-[11px] text-[var(--soft-ink-faint)]">{item.hint}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
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
                      <td><span className="soft-admin-status-pill" data-tone={booking.status === "COMPLETED" ? "ok" : booking.status === "CANCELLED" ? "danger" : "warn"}>{getBookingStatus(booking.status).label}</span></td>
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
