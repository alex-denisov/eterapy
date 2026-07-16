/**
 * B484 — метрика надёжности практика и её последствия.
 *
 * Политика (тикет B484, активирована owner-распоряжением «выполняй» 2026-07-16;
 * юридическая база — legal-pack Документ 12: «Платформа вправе учитывать отмены
 * специалиста в рейтинге, модерации и доступе к заказам»):
 *   • окно метрики — скользящие 30 дней;
 *   • «поздняя отмена» = отмена практиком <24ч до начала (Booking.lateCancel);
 *   • «неявка» = жалоба PRACTITIONER_NO_SHOW, подтверждённая модератором
 *     (status=RESOLVED);
 *   • пороги: 3+ поздних отмены ИЛИ 2+ подтверждённых неявки за 30 дней →
 *     временная деприоритизация в каталоге + предупреждение практику +
 *     COMPLIANCE_ALERT на ручной ревью;
 *   • гудвилл-компенсация клиенту за счёт платформы: поздняя отмена — 1 балл,
 *     подтверждённая неявка — 3 балла (env-переопределяемо);
 *   • пряник: бейдж надёжности в публичном профиле («проводит N% сессий»)
 *     при ≥10 завершённых сессиях и ≥95% доведённых.
 */
import db from "./db";
import { log } from "./logger";
import { notify } from "./notifications";
import { grantClarityCredits } from "./clarity-credits";
import { logAudit } from "./audit";

export const RELIABILITY_WINDOW_DAYS = 30;
export const LATE_CANCEL_DEPRIORITIZE_THRESHOLD = 3;
export const NO_SHOW_DEPRIORITIZE_THRESHOLD = 2;

export const RELIABILITY_BADGE_MIN_COMPLETED = 10;
export const RELIABILITY_BADGE_MIN_RATE = 0.95;

const DEFAULT_LATE_CANCEL_GOODWILL_CREDITS = 1;
const DEFAULT_NO_SHOW_COMPENSATION_CREDITS = 3;

function positiveIntEnv(raw: string | undefined, fallback: number): number {
  const value = Number(raw);
  if (Number.isInteger(value) && value >= 0) return value;
  return fallback;
}

/** Баллы клиенту при поздней отмене практиком (за счёт платформы). */
export function lateCancelGoodwillCredits(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntEnv(env.PRACTITIONER_LATE_CANCEL_GOODWILL_CREDITS, DEFAULT_LATE_CANCEL_GOODWILL_CREDITS);
}

/** Баллы клиенту при подтверждённой неявке практика (обязательная компенсация). */
export function noShowCompensationCredits(env: NodeJS.ProcessEnv = process.env): number {
  return positiveIntEnv(env.PRACTITIONER_NO_SHOW_COMPENSATION_CREDITS, DEFAULT_NO_SHOW_COMPENSATION_CREDITS);
}

export interface ReliabilityCounts {
  lateCancels30d: number;
  noShows30d: number;
}

/** Чистое правило порогов — юнит-тестируемо. */
export function isDeprioritized(counts: ReliabilityCounts): boolean {
  return (
    counts.lateCancels30d >= LATE_CANCEL_DEPRIORITIZE_THRESHOLD ||
    counts.noShows30d >= NO_SHOW_DEPRIORITIZE_THRESHOLD
  );
}

export interface ReliabilitySnapshot extends ReliabilityCounts {
  practitionerId: string;
  completedTotal: number;
  practitionerCancelsTotal: number;
  completionRate: number | null;
  deprioritized: boolean;
}

export function reliabilityWindowStart(now: Date = new Date()): Date {
  return new Date(now.getTime() - RELIABILITY_WINDOW_DAYS * 24 * 60 * 60 * 1000);
}

/** Полный снимок надёжности одного практика. */
export async function getReliabilitySnapshot(
  practitionerId: string,
  now: Date = new Date(),
): Promise<ReliabilitySnapshot> {
  const windowStart = reliabilityWindowStart(now);
  const [lateCancels30d, noShows30d, completedTotal, practitionerCancelsTotal] = await Promise.all([
    db.booking.count({
      where: {
        practitionerId,
        cancelledBy: "PRACTITIONER",
        lateCancel: true,
        cancelledAt: { gte: windowStart },
      },
    }),
    db.complaint.count({
      where: {
        reason: "PRACTITIONER_NO_SHOW",
        status: "RESOLVED",
        resolvedAt: { gte: windowStart },
        booking: { practitionerId },
      },
    }),
    db.booking.count({ where: { practitionerId, status: "COMPLETED" } }),
    db.booking.count({ where: { practitionerId, cancelledBy: "PRACTITIONER" } }),
  ]);

  const denominator = completedTotal + practitionerCancelsTotal;
  return {
    practitionerId,
    lateCancels30d,
    noShows30d,
    completedTotal,
    practitionerCancelsTotal,
    completionRate: denominator > 0 ? completedTotal / denominator : null,
    deprioritized: isDeprioritized({ lateCancels30d, noShows30d }),
  };
}

/**
 * Batch для каталога: id практиков, которых временно опускаем в выдаче.
 * Один groupBy по броням + один по жалобам вместо N запросов.
 */
export async function getDeprioritizedPractitionerIds(
  practitionerIds: string[],
  now: Date = new Date(),
): Promise<Set<string>> {
  if (practitionerIds.length === 0) return new Set();
  const windowStart = reliabilityWindowStart(now);

  const [lateCancelGroups, noShowComplaints] = await Promise.all([
    db.booking.groupBy({
      by: ["practitionerId"],
      where: {
        practitionerId: { in: practitionerIds },
        cancelledBy: "PRACTITIONER",
        lateCancel: true,
        cancelledAt: { gte: windowStart },
      },
      _count: { _all: true },
    }),
    db.complaint.findMany({
      where: {
        reason: "PRACTITIONER_NO_SHOW",
        status: "RESOLVED",
        resolvedAt: { gte: windowStart },
        booking: { practitionerId: { in: practitionerIds } },
      },
      select: { booking: { select: { practitionerId: true } } },
    }),
  ]);

  const counts = new Map<string, ReliabilityCounts>();
  const countsFor = (id: string): ReliabilityCounts => {
    const existing = counts.get(id);
    if (existing) return existing;
    const created: ReliabilityCounts = { lateCancels30d: 0, noShows30d: 0 };
    counts.set(id, created);
    return created;
  };
  for (const group of lateCancelGroups) {
    countsFor(group.practitionerId).lateCancels30d = group._count._all;
  }
  for (const complaint of noShowComplaints) {
    countsFor(complaint.booking.practitionerId).noShows30d += 1;
  }

  const result = new Set<string>();
  for (const [id, value] of counts) {
    if (isDeprioritized(value)) result.add(id);
  }
  return result;
}

/**
 * Стабильная сортировка каталога: надёжные — в исходном порядке, временно
 * деприоритизированные — в конец (внутри группы порядок сохранён).
 */
export function partitionByReliability<T extends { id: string }>(
  items: T[],
  deprioritizedIds: Set<string>,
): T[] {
  if (deprioritizedIds.size === 0) return items;
  const normal: T[] = [];
  const deprioritized: T[] = [];
  for (const item of items) {
    (deprioritizedIds.has(item.id) ? deprioritized : normal).push(item);
  }
  return [...normal, ...deprioritized];
}

export interface ReliabilityBadge {
  label: string;
  completionPercent: number;
}

/** Бейдж надёжности для публичного профиля («пряник» из политики B484). */
export function reliabilityBadge(snapshot: {
  completedTotal: number;
  completionRate: number | null;
  deprioritized: boolean;
}): ReliabilityBadge | null {
  if (snapshot.deprioritized) return null;
  if (snapshot.completedTotal < RELIABILITY_BADGE_MIN_COMPLETED) return null;
  if (snapshot.completionRate === null || snapshot.completionRate < RELIABILITY_BADGE_MIN_RATE) return null;
  const completionPercent = Math.round(snapshot.completionRate * 100);
  return {
    label: completionPercent >= 100 ? "Проводит все сессии" : `Проводит ${completionPercent}% сессий`,
    completionPercent,
  };
}

/** Идемпотентный гудвилл-грант баллов клиенту за счёт платформы. */
async function grantGoodwillOnce(input: {
  clientId: string;
  amount: number;
  sourceEventId: string;
  reason: string;
}): Promise<boolean> {
  if (input.amount <= 0) return false;
  const existing = await db.clarityCreditLedgerEntry.findFirst({
    where: { userId: input.clientId, source: "admin", sourceEventId: input.sourceEventId },
    select: { id: true },
  });
  if (existing) return false;
  await grantClarityCredits({
    userId: input.clientId,
    amount: input.amount,
    source: "admin",
    sourceEventId: input.sourceEventId,
    metadata: { reason: input.reason, program: "b484_reliability" },
  });
  notify({
    userId: input.clientId,
    event: "GOODWILL_CREDITS",
    data: { amount: String(input.amount), reason: input.reason },
    dedupeKey: `goodwill:${input.sourceEventId}`,
  }).catch((e: unknown) => log.warn("reliability.goodwill_notify_failed", { sourceEventId: input.sourceEventId, err: e }));
  return true;
}

/** Порог перейдён → предупреждение практику + сигнал админам на ручной ревью. */
async function escalateIfThresholdCrossed(input: {
  practitionerId: string;
  practitionerUserId: string;
  practitionerName: string | null;
  trigger: "late_cancel" | "no_show";
}): Promise<void> {
  const snapshot = await getReliabilitySnapshot(input.practitionerId);
  if (!snapshot.deprioritized) return;

  notify({
    userId: input.practitionerUserId,
    event: "RELIABILITY_WARNING",
    data: {
      lateCancels: String(snapshot.lateCancels30d),
      noShows: String(snapshot.noShows30d),
    },
    dedupeKey: `reliability-warning:${input.practitionerId}:${new Date().toISOString().slice(0, 10)}`,
  }).catch((e: unknown) => log.warn("reliability.warning_notify_failed", { practitionerId: input.practitionerId, err: e }));

  const reviewers = await db.user.findMany({
    where: { role: { in: ["ADMIN", "SUPERADMIN"] } },
    select: { id: true },
  });
  await Promise.all(reviewers.map((reviewer) =>
    notify({
      userId: reviewer.id,
      event: "COMPLIANCE_ALERT",
      data: {
        summary: `Надёжность практика ${input.practitionerName ?? input.practitionerId}: `
          + `${snapshot.lateCancels30d} поздн. отмен / ${snapshot.noShows30d} неявок за 30 дней — деприоритизирован, нужен ревью`,
        reviewUrl: "/admin/product/quality",
      },
      dedupeKey: `reliability-review:${input.practitionerId}:${new Date().toISOString().slice(0, 10)}`,
    }).catch((e: unknown) => log.warn("reliability.review_notify_failed", { practitionerId: input.practitionerId, err: e })),
  ));
}

/**
 * B484: пост-обработка отмены сессии практиком. Вызывать ПОСЛЕ фиксации
 * cancelledBy/lateCancel на Booking. Ошибки не пробрасываются — отмена/возврат
 * клиенту уже совершены и важнее побочных эффектов.
 */
export async function handlePractitionerCancellation(input: {
  bookingId: string;
  practitionerId: string;
  practitionerUserId: string;
  practitionerName: string | null;
  clientId: string;
  lateCancel: boolean;
}): Promise<void> {
  try {
    if (input.lateCancel) {
      await grantGoodwillOnce({
        clientId: input.clientId,
        amount: lateCancelGoodwillCredits(),
        sourceEventId: `late-cancel:${input.bookingId}`,
        reason: "Специалист поздно отменил сессию — небольшая компенсация от платформы",
      });
      await logAudit(
        input.practitionerUserId,
        "PRACTITIONER_LATE_CANCEL",
        input.bookingId,
        "Поздняя отмена практиком (<24ч) — учтена в метрике надёжности",
      );
    }
    await escalateIfThresholdCrossed({
      practitionerId: input.practitionerId,
      practitionerUserId: input.practitionerUserId,
      practitionerName: input.practitionerName,
      trigger: "late_cancel",
    });
  } catch (e) {
    log.error("reliability.practitioner_cancel_postprocess_failed", { bookingId: input.bookingId, err: e });
  }
}

/**
 * B484: подтверждённая модератором неявка практика (жалоба
 * PRACTITIONER_NO_SHOW → RESOLVED) — обязательная компенсация клиенту +
 * эскалация порогов.
 */
export async function handleConfirmedNoShow(input: {
  complaintId: string;
  bookingId: string;
  clientId: string;
}): Promise<void> {
  try {
    const booking = await db.booking.findUnique({
      where: { id: input.bookingId },
      select: {
        practitioner: { select: { id: true, userId: true, user: { select: { name: true } } } },
      },
    });
    if (!booking) return;

    await grantGoodwillOnce({
      clientId: input.clientId,
      amount: noShowCompensationCredits(),
      sourceEventId: `no-show:${input.complaintId}`,
      reason: "Специалист не пришёл на сессию — компенсация от платформы",
    });
    await logAudit(
      booking.practitioner.userId,
      "PRACTITIONER_NO_SHOW_CONFIRMED",
      input.bookingId,
      `Жалоба ${input.complaintId} подтверждена — учтена в метрике надёжности`,
    );
    await escalateIfThresholdCrossed({
      practitionerId: booking.practitioner.id,
      practitionerUserId: booking.practitioner.userId,
      practitionerName: booking.practitioner.user.name,
      trigger: "no_show",
    });
  } catch (e) {
    log.error("reliability.no_show_postprocess_failed", { complaintId: input.complaintId, err: e });
  }
}
