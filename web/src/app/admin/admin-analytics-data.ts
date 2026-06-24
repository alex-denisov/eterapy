import { BookingStatus, TransactionStatus } from "@prisma/client";
import db from "@/lib/db";

export const PRODUCT_NAMES: Record<string, string> = {
  reframe: "Переосмысление",
  "deep-report": "Подробный разбор",
  "chat-analysis": "Анализ переписки",
  compatibility: "Совместимость",
  circle: "Круг ясности",
  pair: "Разобраться вдвоём",
  "daily-practice": "Ежедневная практика",
  "map-upgrade": "Апгрейд карты",
  session: "Сессия с практиком",
  subscription: "Подписка",
};

type SearchParams = Record<string, string | string[] | undefined>;

export type AdminPeriod = {
  start: Date;
  end: Date;
  startInput: string;
  endInput: string;
  days: string[];
};

export function dayKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function inputDate(value: Date) {
  return dayKey(value);
}

function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function endOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate(), 23, 59, 59, 999);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function resolveAdminPeriod(params: SearchParams = {}): AdminPeriod {
  const now = new Date();
  const period = firstParam(params.period);
  let start = new Date(now.getFullYear(), now.getMonth(), 1);
  let end = endOfDay(now);

  if (period === "today") {
    start = startOfDay(now);
  } else if (period === "week") {
    const day = now.getDay() || 7;
    start = startOfDay(now);
    start.setDate(start.getDate() - day + 1);
  } else if (period === "quarter") {
    const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;
    start = new Date(now.getFullYear(), quarterStartMonth, 1);
  }

  const explicitStart = firstParam(params.start);
  const explicitEnd = firstParam(params.end);
  if (explicitStart) {
    const parsed = new Date(`${explicitStart}T00:00:00`);
    if (!Number.isNaN(parsed.getTime())) start = parsed;
  }
  if (explicitEnd) {
    const parsed = new Date(`${explicitEnd}T23:59:59.999`);
    if (!Number.isNaN(parsed.getTime())) end = parsed;
  }
  if (start > end) [start, end] = [startOfDay(end), endOfDay(start)];

  const days: string[] = [];
  const cursor = startOfDay(start);
  const guard = new Date(end);
  let iterations = 0;
  while (cursor <= guard && iterations < 370) {
    days.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
    iterations += 1;
  }

  return { start, end, startInput: inputDate(start), endInput: inputDate(end), days };
}

function rubFromKopecks(value: number) {
  return Math.round(value / 100);
}

function addTo(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function chartFromMap(days: string[], map: Map<string, number>) {
  return days.map((day) => ({ label: day.slice(5), value: map.get(day) ?? 0 }));
}

function stringFromJson(value: unknown, keys: string[]) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const item = record[key];
    if (typeof item === "string" && item.trim()) return item.trim();
    if (typeof item === "number") return String(item);
  }
  return null;
}

export function paymentMethodFromMetadata(provider: string, metadata: unknown) {
  const raw = stringFromJson(metadata, ["paymentMethod", "payment_method", "method", "paymentType", "payment_type"]);
  const value = `${raw ?? provider}`.toLowerCase();
  if (value.includes("sbp") || value.includes("сбп")) return "СБП";
  if (value.includes("card") || value.includes("bank_card") || value.includes("кар")) return "Банковская карта";
  if (value.includes("manual")) return "Вручную";
  if (value.includes("internal")) return "Внутренний";
  return provider || "Не указан";
}

export function cardPartsFromMetadata(metadata: unknown) {
  return {
    first6: stringFromJson(metadata, ["cardFirst6", "first6", "bin", "iin", "card_bin", "cardBin"]),
    last4: stringFromJson(metadata, ["cardLast4", "last4", "card_last4", "cardLastFour"]),
  };
}

export function productLabel(productKey: string | null | undefined) {
  if (!productKey) return "Не указан";
  return PRODUCT_NAMES[productKey] ?? productKey;
}

export async function getDashboardAnalytics(period: AdminPeriod) {
  const [
    usersTotal,
    clientsTotal,
    practitionersTotal,
    activePractitioners,
    transactions,
    bookings,
    aiRequests,
    productResults,
    entitlements,
    subscriptions,
    credits,
    complaintsOpen,
    applicationsPending,
    jobsFailed,
    reviewsPending,
  ] = await Promise.all([
    db.user.count(),
    db.user.count({ where: { role: "CLIENT" } }),
    db.practitioner.count(),
    db.practitioner.count({ where: { status: "ACTIVE" } }),
    db.transaction.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { amount: true, status: true, provider: true, metadata: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.booking.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { id: true, status: true, priceRub: true, createdAt: true, startedAt: true, endedAt: true, riskScore: true, practitionerId: true },
      orderBy: { createdAt: "asc" },
    }),
    db.aIRequest.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { feature: true, status: true, totalTokens: true, estimatedCostMicros: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.productResult.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { productKey: true, status: true, createdAt: true },
    }),
    db.productEntitlement.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { productKey: true, source: true, status: true, createdAt: true },
    }),
    db.userSubscription.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { planKey: true, status: true, createdAt: true },
    }),
    db.clarityCreditLedgerEntry.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { amount: true, type: true, source: true, status: true, createdAt: true },
    }),
    db.complaint.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }),
    db.practitionerApplication.count({ where: { status: { in: ["PENDING", "REVIEWING"] } } }),
    db.job.count({ where: { status: { in: ["FAILED", "DEAD"] } } }),
    db.review.count({ where: { status: { in: ["REVIEW", "HIDDEN"] } } }),
  ]);

  const revenueByDay = new Map<string, number>();
  const refundsByDay = new Map<string, number>();
  const bookingsByDay = new Map<string, number>();
  const aiCostByDay = new Map<string, number>();
  const aiTokensByDay = new Map<string, number>();
  const creditsByDay = new Map<string, number>();

  for (const tx of transactions) {
    const day = dayKey(tx.createdAt);
    if (tx.status === TransactionStatus.SUCCEEDED && tx.amount > 0) addTo(revenueByDay, day, rubFromKopecks(tx.amount));
    if (tx.status === TransactionStatus.REFUNDED || tx.amount < 0) addTo(refundsByDay, day, rubFromKopecks(Math.abs(tx.amount)));
  }
  for (const booking of bookings) addTo(bookingsByDay, dayKey(booking.createdAt), 1);
  for (const request of aiRequests) {
    const day = dayKey(request.createdAt);
    addTo(aiCostByDay, day, request.estimatedCostMicros);
    addTo(aiTokensByDay, day, request.totalTokens);
  }
  for (const credit of credits) addTo(creditsByDay, dayKey(credit.createdAt), credit.amount);

  const revenueRub = transactions
    .filter((tx) => tx.status === TransactionStatus.SUCCEEDED && tx.amount > 0)
    .reduce((sum, tx) => sum + rubFromKopecks(tx.amount), 0);
  const refundsRub = transactions
    .filter((tx) => tx.status === TransactionStatus.REFUNDED || tx.amount < 0)
    .reduce((sum, tx) => sum + rubFromKopecks(Math.abs(tx.amount)), 0);
  const completedBookingsRevenue = bookings
    .filter((booking) => booking.status === BookingStatus.COMPLETED)
    .reduce((sum, booking) => sum + booking.priceRub, 0);
  const aiCostMicros = aiRequests.reduce((sum, request) => sum + request.estimatedCostMicros, 0);

  const productCounts = new Map<string, number>();
  for (const result of productResults) addTo(productCounts, result.productKey, 1);
  for (const entitlement of entitlements) addTo(productCounts, entitlement.productKey, 1);

  const paymentMix = new Map<string, number>();
  for (const tx of transactions.filter((item) => item.status === TransactionStatus.SUCCEEDED && item.amount > 0)) {
    addTo(paymentMix, paymentMethodFromMetadata(tx.provider, tx.metadata), rubFromKopecks(tx.amount));
  }

  const activeSubscriptions = subscriptions.filter((sub) => ["TRIALING", "ACTIVE"].includes(sub.status)).length;
  const manualCredits = credits.filter((credit) => credit.source === "admin").reduce((sum, credit) => sum + credit.amount, 0);
  const purchasedCredits = credits.filter((credit) => credit.source === "purchase").reduce((sum, credit) => sum + credit.amount, 0);

  return {
    totals: {
      usersTotal,
      clientsTotal,
      practitionersTotal,
      activePractitioners,
      revenueRub,
      refundsRub,
      completedBookingsRevenue,
      aiCostMicros,
      aiTokens: aiRequests.reduce((sum, request) => sum + request.totalTokens, 0),
      bookings: bookings.length,
      completedBookings: bookings.filter((booking) => booking.status === BookingStatus.COMPLETED).length,
      activeSubscriptions,
      creditsBalanceDelta: credits.reduce((sum, credit) => sum + credit.amount, 0),
      manualCredits,
      purchasedCredits,
      complaintsOpen,
      applicationsPending,
      jobsFailed,
      reviewsPending,
    },
    charts: {
      revenueByDay: chartFromMap(period.days, revenueByDay),
      refundsByDay: chartFromMap(period.days, refundsByDay),
      bookingsByDay: chartFromMap(period.days, bookingsByDay),
      aiCostByDay: chartFromMap(period.days, aiCostByDay),
      aiTokensByDay: chartFromMap(period.days, aiTokensByDay),
      creditsByDay: chartFromMap(period.days, creditsByDay),
      productUsage: [...productCounts.entries()].map(([key, value]) => ({ label: productLabel(key), value })).sort((a, b) => b.value - a.value),
      paymentMix: [...paymentMix.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
    },
  };
}

export async function getFinanceRows(period: AdminPeriod, page = 1, query = "") {
  const whereQuery = query.trim();
  const where = {
    createdAt: { gte: period.start, lte: period.end },
    ...(whereQuery ? {
      OR: [
        { providerPaymentId: { contains: whereQuery, mode: "insensitive" as const } },
        { description: { contains: whereQuery, mode: "insensitive" as const } },
        { user: { email: { contains: whereQuery, mode: "insensitive" as const } } },
        { user: { name: { contains: whereQuery, mode: "insensitive" as const } } },
      ],
    } : {}),
  };
  const take = 20;
  const [transactions, total] = await Promise.all([
    db.transaction.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (Math.max(1, page) - 1) * take,
      take,
      include: { user: { select: { name: true, email: true } } },
    }),
    db.transaction.count({ where }),
  ]);
  return { transactions, total, take };
}

export async function getProductCenterData(period: AdminPeriod) {
  const [
    events,
    users,
    results,
    sessions,
    referrals,
    inviteVisits,
    complaints,
    applications,
    reviews,
  ] = await Promise.all([
    db.analyticsEvent.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { event: true, createdAt: true },
    }),
    db.user.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { id: true, role: true, registrationChannel: true, provider: true, createdAt: true, blockedAt: true, deletedAt: true },
    }),
    db.productResult.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { id: true, productKey: true, status: true, title: true, createdAt: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.videoSession.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: {
        id: true, status: true, roomName: true, transcriptText: true, summaryText: true, startedAt: true, endedAt: true, createdAt: true,
        booking: {
          select: {
            id: true, priceRub: true, status: true,
            client: { select: { name: true, email: true } },
            practitioner: { select: { user: { select: { name: true } } } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.referralAttribution.findMany({ where: { createdAt: { gte: period.start, lte: period.end } }, select: { status: true, createdAt: true, referrer: { select: { name: true, email: true } } } }),
    db.practitionerInviteVisit.findMany({ where: { createdAt: { gte: period.start, lte: period.end } }, select: { status: true, createdAt: true, invite: { select: { practitioner: { select: { user: { select: { name: true, email: true } } } } } } } }),
    db.complaint.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }),
    db.practitionerApplication.count({ where: { status: { in: ["PENDING", "REVIEWING"] } } }),
    db.review.count({ where: { status: { in: ["REVIEW", "HIDDEN"] } } }),
  ]);

  const eventCounts = new Map<string, number>();
  for (const event of events) addTo(eventCounts, event.event, 1);
  const productByDay = new Map<string, Map<string, number>>();
  for (const result of results) {
    const day = dayKey(result.createdAt);
    const map = productByDay.get(day) ?? new Map<string, number>();
    addTo(map, result.productKey, 1);
    productByDay.set(day, map);
  }
  const referralDay = new Map<string, number>();
  const referralSubscriptionDay = new Map<string, number>();
  for (const item of referrals) {
    addTo(referralDay, dayKey(item.createdAt), 1);
    if (item.status === "REWARDED") addTo(referralSubscriptionDay, dayKey(item.createdAt), 1);
  }
  for (const item of inviteVisits) addTo(referralDay, dayKey(item.createdAt), 1);

  const topReferrers = new Map<string, number>();
  for (const item of referrals) addTo(topReferrers, item.referrer?.name ?? item.referrer?.email ?? "Не указан", 1);
  for (const item of inviteVisits) addTo(topReferrers, item.invite.practitioner.user.name ?? item.invite.practitioner.user.email ?? "Не указан", 1);

  return {
    funnel: [
      { label: "Создан диалог", value: eventCounts.get("dialogue_created") ?? 0 },
      { label: "Ответ открыт", value: eventCounts.get("primary_answer_viewed") ?? 0 },
      { label: "CTA углубления", value: eventCounts.get("triage_primary_clicked") ?? 0 },
      { label: "Подписка", value: eventCounts.get("triage_subscription_clicked") ?? 0 },
      { label: "Баллы", value: eventCounts.get("credits_spend_clicked") ?? 0 },
    ],
    users,
    results,
    sessions,
    operations: { complaints, applications, reviews },
    charts: {
      referralRegistrations: chartFromMap(period.days, referralDay),
      referralSubscriptions: chartFromMap(period.days, referralSubscriptionDay),
      topReferrers: [...topReferrers.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10),
      productByDay: period.days.map((day) => {
        const map = productByDay.get(day);
        return {
          label: day.slice(5),
          value: map?.get("reframe") ?? 0,
          secondary: map?.get("deep-report") ?? 0,
          tertiary: map?.get("chat-analysis") ?? 0,
        };
      }),
    },
  };
}

export async function getOpsCenterData(period: AdminPeriod) {
  const [jobs, webhooks, audits, aiRequests, providers, credentials, files] = await Promise.all([
    db.job.groupBy({ by: ["status"], _count: { id: true } }),
    db.webhookEvent.groupBy({ by: ["status"], _count: { id: true } }),
    db.auditLog.count({ where: { createdAt: { gte: period.start, lte: period.end } } }),
    db.aIRequest.findMany({ where: { createdAt: { gte: period.start, lte: period.end } }, select: { feature: true, providerGroup: true, totalTokens: true, estimatedCostMicros: true, status: true, createdAt: true } }),
    db.aIProviderConfig.count({ where: { enabled: true } }),
    db.aIProviderCredential.count({ where: { enabled: true, consecutiveFailures: { gt: 0 } } }),
    db.storedFile.count(),
  ]);
  const jobCounts = new Map(jobs.map((row) => [row.status, row._count.id]));
  const webhookCounts = new Map(webhooks.map((row) => [row.status, row._count.id]));
  const byFeature = new Map<string, number>();
  const byProvider = new Map<string, number>();
  const costByDay = new Map<string, number>();
  for (const request of aiRequests) {
    addTo(byFeature, request.feature, request.estimatedCostMicros);
    addTo(byProvider, request.providerGroup ?? "Не указан", request.estimatedCostMicros);
    addTo(costByDay, dayKey(request.createdAt), request.estimatedCostMicros);
  }
  return {
    metrics: {
      pendingJobs: jobCounts.get("PENDING") ?? 0,
      runningJobs: jobCounts.get("RUNNING") ?? 0,
      failedJobs: (jobCounts.get("FAILED") ?? 0) + (jobCounts.get("DEAD") ?? 0),
      failedWebhooks: webhookCounts.get("FAILED") ?? 0,
      auditEvents: audits,
      aiCostMicros: aiRequests.reduce((sum, item) => sum + item.estimatedCostMicros, 0),
      aiTokens: aiRequests.reduce((sum, item) => sum + item.totalTokens, 0),
      enabledProviders: providers,
      credentialWarnings: credentials,
      files,
    },
    charts: {
      costByDay: chartFromMap(period.days, costByDay),
      byFeature: [...byFeature.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10),
      byProvider: [...byProvider.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10),
    },
  };
}

export async function getUnitEconomicsData(period: AdminPeriod) {
  const aiRequests = await db.aIRequest.findMany({
    where: { createdAt: { gte: period.start, lte: period.end } },
    select: { feature: true, estimatedCostMicros: true, totalTokens: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const byFeatureDay = new Map<string, Map<string, number>>();
  for (const request of aiRequests) {
    const feature = request.feature || "Не указан";
    const map = byFeatureDay.get(feature) ?? new Map<string, number>();
    addTo(map, dayKey(request.createdAt), request.estimatedCostMicros);
    byFeatureDay.set(feature, map);
  }
  return [...byFeatureDay.entries()]
    .map(([feature, map]) => ({
      feature,
      totalMicros: [...map.values()].reduce((sum, value) => sum + value, 0),
      chart: chartFromMap(period.days, map),
    }))
    .sort((a, b) => b.totalMicros - a.totalMicros);
}
