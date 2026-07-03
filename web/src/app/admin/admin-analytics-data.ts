import { BookingStatus, TransactionStatus } from "@prisma/client";
import db from "@/lib/db";
import { getProductLabel } from "@/lib/billing-labels";

export const PRODUCT_NAMES: Record<string, string> = {
  reframe: "Переосмысление",
  "deep-report": "Подробный разбор",
  "full-question": "Полный разбор вопроса",
  "chat-analysis": "Анализ переписки",
  "chat-analysis-ocr": "Распознавание переписки",
  compatibility: "Совместимость",
  circle: "Круг",
  pair: "Разобраться вдвоём",
  "daily-practice": "Ежедневная практика",
  "map-upgrade": "Апгрейд карты",
  "natal-chart": "Натальная карта",
  "family-scenarios": "Семейные сценарии",
  "human-design": "Дизайн человека",
  "surname-story": "История фамилии",
  perspectives: "Переосмысление",
  "seven-days": "Недельное резюме",
  numerology: "Числовой портрет",
  tarot: "Расклад Таро",
  synastry: "Совместимость по звёздам",
  "weekly-summary": "Недельное резюме",
  "companion-chat-session": "Живой диалог",
  "companion-chat-extension": "Продление живого диалога",
  "companion-chat": "Решить вопрос в чате",
  "dialogue-primary-answer": "Первичный разбор",
  "dialogue-clarifier": "Уточняющие вопросы",
  "dialogue-router": "Маршрутизация диалога",
  "safety-classification": "Проверка безопасности",
  "session-compliance": "Контроль сессий",
  "session-summary": "AI-резюме сессии",
  "session-stt": "Транскрипция сессии",
  symbolic: "Символические продукты",
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
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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
    const parsed = parseInputDate(explicitStart, "start");
    if (!Number.isNaN(parsed.getTime())) start = parsed;
  }
  if (explicitEnd) {
    const parsed = parseInputDate(explicitEnd, "end");
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

function parseInputDate(value: string, edge: "start" | "end") {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return new Date(Number.NaN);
  const [, y, m, d] = match;
  return edge === "start"
    ? new Date(Number(y), Number(m) - 1, Number(d), 0, 0, 0, 0)
    : new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59, 999);
}

function rubFromKopecks(value: number) {
  return Math.round(value / 100);
}

function addTo(map: Map<string, number>, key: string, value: number) {
  map.set(key, (map.get(key) ?? 0) + value);
}

export function chartFromMap(days: string[], map: Map<string, number>) {
  return chartBuckets(days).map((bucket) => ({
    label: bucket.label,
    value: bucket.days.reduce((sum, day) => sum + (map.get(day) ?? 0), 0),
  }));
}

export function chartDayLabel(day: string) {
  return `${day.slice(8, 10)}.${day.slice(5, 7)}`;
}

function chartRangeLabel(bucketDays: string[]) {
  const first = bucketDays[0];
  const last = bucketDays[bucketDays.length - 1];
  if (!first || !last || first === last) return first ? chartDayLabel(first) : "";
  return `${chartDayLabel(first)}-${chartDayLabel(last)}`;
}

export function chartBuckets(days: string[]) {
  if (days.length <= 31) return days.map((day) => ({ label: chartDayLabel(day), days: [day] }));
  const buckets: Array<{ label: string; days: string[] }> = [];
  for (let index = 0; index < days.length; index += 7) {
    const bucketDays = days.slice(index, index + 7);
    buckets.push({ label: chartRangeLabel(bucketDays), days: bucketDays });
  }
  return buckets;
}

function chartPlanBuckets(days: string[], map: Map<string, { free: number; plus: number; premium: number }>) {
  return chartBuckets(days).map((bucket) => {
    const totals = bucket.days.reduce((acc, day) => {
      const row = map.get(day);
      acc.free += row?.free ?? 0;
      acc.plus += row?.plus ?? 0;
      acc.premium += row?.premium ?? 0;
      return acc;
    }, { free: 0, plus: 0, premium: 0 });
    return { label: bucket.label, value: totals.free, secondary: totals.plus, tertiary: totals.premium };
  });
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
  const normalized = productKey
    .trim()
    .replace(/^product[-_\s]+/i, "")
    .replaceAll("_", "-")
    .replace(/\s+/g, "-")
    .toLowerCase();
  return PRODUCT_NAMES[normalized] ?? getProductLabel(normalized);
}

function analyticsIdentity(event: { userId?: string | null; sessionId?: string | null; dialogueId?: string | null }) {
  return event.userId ?? event.dialogueId ?? event.sessionId ?? null;
}

function activePlanAt(
  subscriptions: Array<{ userId: string; planKey: string; status: string; createdAt: Date; currentPeriodStart: Date | null; currentPeriodEnd: Date | null; cancelledAt: Date | null }>,
  userId: string,
  at: Date,
) {
  const row = subscriptions.find((sub) => {
    if (sub.userId !== userId || !["TRIALING", "ACTIVE", "PAST_DUE", "CANCELLED", "EXPIRED"].includes(sub.status)) return false;
    const start = sub.currentPeriodStart ?? sub.createdAt;
    const end = sub.currentPeriodEnd ?? sub.cancelledAt;
    return start <= at && (!end || end >= at);
  });
  const key = row?.planKey?.toLowerCase();
  if (key?.includes("premium")) return "premium";
  if (key?.includes("plus")) return "plus";
  return "free";
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

export async function getFinanceRows(period: AdminPeriod, page = 1, query = "", take = 20) {
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
    subscriptions,
    sessions,
    referrals,
    inviteVisits,
    creditEntries,
    complaints,
    applications,
    reviews,
  ] = await Promise.all([
    db.analyticsEvent.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { event: true, userId: true, sessionId: true, dialogueId: true, createdAt: true },
    }),
    db.user.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { id: true, role: true, registrationChannel: true, provider: true, createdAt: true, blockedAt: true, deletedAt: true },
    }),
    db.productResult.findMany({
      where: { createdAt: { gte: period.start, lte: period.end } },
      select: { id: true, userId: true, productKey: true, status: true, title: true, createdAt: true, user: { select: { name: true, email: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    }),
    db.userSubscription.findMany({
      where: {
        OR: [
          { createdAt: { lte: period.end } },
          { currentPeriodStart: { lte: period.end } },
        ],
      },
      select: { userId: true, planKey: true, status: true, createdAt: true, currentPeriodStart: true, currentPeriodEnd: true, cancelledAt: true },
      orderBy: { createdAt: "desc" },
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
    db.clarityCreditLedgerEntry.findMany({
      where: { createdAt: { lte: period.end }, status: { in: ["pending", "confirmed"] } },
      select: { amount: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    db.complaint.count({ where: { status: { in: ["OPEN", "REVIEWING"] } } }),
    db.practitionerApplication.count({ where: { status: { in: ["PENDING", "REVIEWING"] } } }),
    db.review.count({ where: { status: { in: ["REVIEW", "HIDDEN"] } } }),
  ]);

  const funnelStages = [
    { key: "dialogue_created", label: "Создан диалог" },
    { key: "primary_answer_viewed", label: "Ответ открыт" },
    { key: "triage_primary_clicked", label: "CTA углубления" },
    { key: "triage_subscription_clicked", label: "Подписка" },
    { key: "credits_spend_clicked", label: "Баллы" },
  ];
  const stageIdentities = new Map<string, Set<string>>();
  for (const stage of funnelStages) stageIdentities.set(stage.key, new Set());
  for (const event of events) {
    const identity = analyticsIdentity(event);
    if (!identity) continue;
    stageIdentities.get(event.event)?.add(identity);
  }
  let previous = new Set<string>();
  const funnel = funnelStages.map((stage, index) => {
    const current = stageIdentities.get(stage.key) ?? new Set<string>();
    const identities = index === 0
      ? current
      : new Set([...current].filter((identity) => previous.has(identity)));
    previous = identities;
    return { label: stage.label, value: identities.size };
  });

  const productByDay = new Map<string, Map<string, number>>();
  const productPlanByDay = new Map<string, Map<string, { free: number; plus: number; premium: number }>>();
  for (const result of results) {
    const day = dayKey(result.createdAt);
    const map = productByDay.get(day) ?? new Map<string, number>();
    addTo(map, result.productKey, 1);
    productByDay.set(day, map);

    const byProduct = productPlanByDay.get(result.productKey) ?? new Map<string, { free: number; plus: number; premium: number }>();
    const bucket = byProduct.get(day) ?? { free: 0, plus: 0, premium: 0 };
    bucket[activePlanAt(subscriptions, result.userId, result.createdAt)] += 1;
    byProduct.set(day, bucket);
    productPlanByDay.set(result.productKey, byProduct);
  }
  const referralDay = new Map<string, number>();
  const referralSubscriptionDay = new Map<string, number>();
  const subscriptionPurchaseDay = new Map<string, { free: number; plus: number; premium: number }>();
  for (const item of referrals) {
    addTo(referralDay, dayKey(item.createdAt), 1);
    if (item.status === "REWARDED") addTo(referralSubscriptionDay, dayKey(item.createdAt), 1);
  }
  for (const item of inviteVisits) addTo(referralDay, dayKey(item.createdAt), 1);
  for (const sub of subscriptions) {
    if (sub.createdAt < period.start || sub.createdAt > period.end) continue;
    const day = dayKey(sub.createdAt);
    const bucket = subscriptionPurchaseDay.get(day) ?? { free: 0, plus: 0, premium: 0 };
    const plan = sub.planKey.toLowerCase();
    if (plan.includes("premium")) bucket.premium += 1;
    else if (plan.includes("plus")) bucket.plus += 1;
    else bucket.free += 1;
    subscriptionPurchaseDay.set(day, bucket);
  }

  const creditDeltaDay = new Map<string, number>();
  let creditBalance = 0;
  for (const entry of creditEntries) {
    if (entry.createdAt < period.start) {
      creditBalance += entry.amount;
    } else if (entry.createdAt <= period.end) {
      addTo(creditDeltaDay, dayKey(entry.createdAt), entry.amount);
    }
  }
  const creditsBalanceByDay = chartBuckets(period.days).map((bucket) => {
    for (const day of bucket.days) creditBalance += creditDeltaDay.get(day) ?? 0;
    return { label: bucket.label, value: Math.max(0, creditBalance) };
  });

  const topReferrers = new Map<string, number>();
  for (const item of referrals) addTo(topReferrers, item.referrer?.name ?? item.referrer?.email ?? "Не указан", 1);
  for (const item of inviteVisits) addTo(topReferrers, item.invite.practitioner.user.name ?? item.invite.practitioner.user.email ?? "Не указан", 1);
  const productKeysByVolume = [...productPlanByDay.entries()]
    .map(([productKey, dayMap]) => ({
      productKey,
      total: [...dayMap.values()].reduce((sum, row) => sum + row.free + row.plus + row.premium, 0),
    }))
    .sort((a, b) => b.total - a.total)
    .map((item) => item.productKey);

  return {
    funnel,
    users,
    results,
    sessions,
    operations: { complaints, applications, reviews },
    charts: {
      referralRegistrations: chartFromMap(period.days, referralDay),
      referralSubscriptions: chartFromMap(period.days, referralSubscriptionDay),
      subscriptionPurchases: chartPlanBuckets(period.days, subscriptionPurchaseDay),
      creditsBalanceByDay,
      topReferrers: [...topReferrers.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, 10),
      productByDay: chartBuckets(period.days).map((bucket) => {
        const topKeys = [...new Set(results.map((result) => result.productKey))].slice(0, 3);
        return {
          label: bucket.label,
          value: bucket.days.reduce((sum, day) => sum + (productByDay.get(day)?.get(topKeys[0] ?? "") ?? 0), 0),
          secondary: bucket.days.reduce((sum, day) => sum + (productByDay.get(day)?.get(topKeys[1] ?? "") ?? 0), 0),
          tertiary: bucket.days.reduce((sum, day) => sum + (productByDay.get(day)?.get(topKeys[2] ?? "") ?? 0), 0),
        };
      }),
      productByDayStacked: chartBuckets(period.days).map((bucket) => {
        return {
          label: bucket.label,
          value: productKeysByVolume.reduce(
            (sum, productKey) => sum + bucket.days.reduce((daySum, day) => daySum + (productByDay.get(day)?.get(productKey) ?? 0), 0),
            0,
          ),
          segments: productKeysByVolume.map((productKey) => ({
            label: productLabel(productKey),
            value: bucket.days.reduce((sum, day) => sum + (productByDay.get(day)?.get(productKey) ?? 0), 0),
          })),
        };
      }),
      productByDayLabels: [...new Set(results.map((result) => result.productKey))].slice(0, 3).map(productLabel) as [string, string?, string?],
      productUsageByProduct: [...productPlanByDay.entries()]
        .map(([productKey, dayMap]) => ({
          productKey,
          label: productLabel(productKey),
          total: [...dayMap.values()].reduce((sum, row) => sum + row.free + row.plus + row.premium, 0),
          chart: chartPlanBuckets(period.days, dayMap),
        }))
        .sort((a, b) => b.total - a.total),
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
