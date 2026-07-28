import type { Job } from "@prisma/client";
import db from "@/lib/db";
import { notify } from "@/lib/notifications";
import type { JobHandlers, JobHandler } from "@/lib/job-worker";
import type { JobResult } from "@/lib/job-queue";
import { log, serializeError } from "@/lib/logger";
import { runPayoutRun } from "@/lib/payout-runs";
import { syncPractitionerCommissions } from "@/lib/practitioner-commission";
import { recheckVerifiedTaxStatuses } from "@/lib/practitioner-tax-recheck";
import {
  runCreditsExpiringJob,
  runMomentOfNeedJob,
  runStreakAtRiskJob,
} from "@/lib/reactivation-cron";
import { cleanupRetentionData } from "@/lib/data-retention";
import { cleanupExpiredSessionAiData } from "@/lib/server-stt";
import { cancelSessionHold, captureGraceExpiredSessions } from "@/lib/session-payment";
import { completeBookingAtSessionEnd } from "@/lib/session-complete";
import { V5_SUBSCRIPTION_PLANS } from "@/lib/entitlements";
import { cleanupExpiredMiniAppAuthGrants } from "@/lib/miniapp/telegram/auth";
import { reconcileRobokassaBacklog } from "@/lib/payments/reconcile-robokassa";
import { runIpObligationReminders } from "@/lib/ip-obligation-reminders";
import { generateMarketingDrafts } from "@/lib/marketing/publication-queue";
import { publishScheduledMarketing } from "@/lib/marketing/publish";
import { marketingAgentEnabled } from "@/lib/marketing/agent";
import { cleanupExpiredVideoChats } from "@/lib/video-chat-retention";
import { runMarketingTriggers } from "@/lib/marketing/triggers";

const REMINDER_WINDOW_MS = 15 * 60 * 1000;
// B348: send the auto-renewal reminder when the period ends in ~3 days. A 1-day
// window absorbs the daily cron cadence so a renewal is never missed nor doubled.
const RENEWAL_REMINDER_LEAD_DAYS = 3;
const RENEWAL_WINDOW_DAYS = 1;

function jobNow(job: Job) {
  const payload = job.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload) && "requestedAt" in payload) {
    const requestedAt = payload.requestedAt;
    if (typeof requestedAt === "string") return new Date(requestedAt);
  }
  return new Date();
}

function fmtSlotCron(slot: { startAt: Date; endAt: Date } | null): string {
  if (!slot) return "—";
  return new Date(slot.startAt).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function runCleanupUsersJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const sessionAiCleanup = await cleanupExpiredSessionAiData({ now });
  const retentionCleanup = await cleanupRetentionData({ now });
  const miniAppGrantCleanup = await cleanupExpiredMiniAppAuthGrants(now);

  log.info("cron-cleanup-users-completed", {
    jobId: job.id,
    usersAnonymized: retentionCleanup.usersAnonymized,
    guestRoutingLogsDeleted: retentionCleanup.guestRoutingLogsDeleted,
    securityAuditLogsDeleted: retentionCleanup.securityAuditLogsDeleted,
    sessionAiCleanup,
    retentionCleanup,
    miniAppAuthGrantsDeleted: miniAppGrantCleanup.count,
  });

  return {
    ok: true,
    deletedCount: retentionCleanup.usersAnonymized,
    usersAnonymized: retentionCleanup.usersAnonymized,
    sessionAiCleanup,
    retentionCleanup,
    miniAppAuthGrantsDeleted: miniAppGrantCleanup.count,
    timestamp: now.toISOString(),
  };
}

export async function runBookingRemindersJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const in24h = new Date(now.getTime() + 24 * 3600 * 1000);
  const in1h = new Date(now.getTime() + 1 * 3600 * 1000);

  const bookings24h = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminder24hSent: false,
      startedAt: {
        gte: new Date(in24h.getTime() - REMINDER_WINDOW_MS),
        lte: new Date(in24h.getTime() + REMINDER_WINDOW_MS),
      },
    },
    include: {
      client: { select: { id: true, name: true, email: true } },
      practitioner: { select: { id: true, userId: true, user: { select: { name: true } } } },
    },
  });

  const bookings1h = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      reminder1hSent: false,
      startedAt: {
        gte: new Date(in1h.getTime() - REMINDER_WINDOW_MS),
        lte: new Date(in1h.getTime() + REMINDER_WINDOW_MS),
      },
    },
    include: {
      client: { select: { id: true, name: true, email: true } },
      practitioner: { select: { id: true, userId: true, user: { select: { name: true } } } },
    },
  });

  let remindersSent = 0;
  let autoCompleted = 0;

  for (const booking of bookings24h) {
    const startDate = booking.startedAt ? new Date(booking.startedAt).toLocaleDateString("ru-RU") : "—";
    const startTime = booking.startedAt ? new Date(booking.startedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";

    await notify({
      userId: booking.clientId,
      event: "BOOKING_REMINDER",
      data: {
        bookingId: booking.id,
        withName: booking.practitioner.user.name,
        date: startDate,
        time: startTime,
        in: "24 часа",
      },
    });

    await notify({
      userId: booking.practitioner.userId,
      event: "BOOKING_REMINDER",
      data: {
        bookingId: booking.id,
        withName: booking.client.name,
        date: startDate,
        time: startTime,
        in: "24 часа",
      },
    });

    await db.booking.update({ where: { id: booking.id }, data: { reminder24hSent: true } });
    remindersSent++;
  }

  for (const booking of bookings1h) {
    const startDate = booking.startedAt ? new Date(booking.startedAt).toLocaleDateString("ru-RU") : "—";
    const startTime = booking.startedAt ? new Date(booking.startedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : "—";

    await notify({
      userId: booking.clientId,
      event: "BOOKING_REMINDER",
      data: {
        bookingId: booking.id,
        withName: booking.practitioner.user.name,
        date: startDate,
        time: startTime,
        in: "1 час",
      },
    });

    await notify({
      userId: booking.practitioner.userId,
      event: "BOOKING_REMINDER",
      data: {
        bookingId: booking.id,
        withName: booking.client.name,
        date: startDate,
        time: startTime,
        in: "1 час",
      },
    });

    await db.booking.update({ where: { id: booking.id }, data: { reminder1hSent: true } });
    remindersSent++;
  }

  const completedBookings = await db.booking.findMany({
    where: {
      status: "IN_PROGRESS",
      slot: {
        endAt: { lte: now },
      },
    },
    include: {
      slot: true,
      practitioner: { select: { id: true } },
      client: { select: { id: true, name: true, email: true } },
    },
  });

  for (const booking of completedBookings) {
    const completion = await completeBookingAtSessionEnd(booking.id, {
      userId: "system:cron.booking-reminders",
      isPractitioner: false,
    });
    if (completion.status !== "completed" && completion.status !== "already_completed") {
      log.warn("cron-booking-auto-complete-skipped", {
        jobId: job.id,
        bookingId: booking.id,
        completion,
      });
      continue;
    }
    const { sendReviewRequestClient } = await import("@/lib/email");
    sendReviewRequestClient({
      bookingId: booking.id,
      clientName: booking.client.name,
      clientEmail: booking.client.email,
      practitionerName: "",
      practitionerEmail: "",
      practitionerId: booking.practitioner.id,
      slotStr: fmtSlotCron(booking.slot),
      priceRub: 0,
      durationMin: 60,
    }).catch((err) => {
      log.error("cron-review-request-email-failed", {
        jobId: job.id,
        bookingId: booking.id,
        error: serializeError(err),
      });
    });
    autoCompleted++;
  }

  const fifteenMin = 15 * 60 * 1000;
  const expiredCutoff = new Date(now.getTime() - fifteenMin);
  const expiredBookings = await db.booking.findMany({
    where: {
      status: "CONFIRMED",
      slot: {
        endAt: { lte: expiredCutoff },
      },
    },
    include: {
      slot: true,
      practitioner: { select: { id: true } },
      client: { select: { id: true, name: true } },
    },
  });

  for (const booking of expiredBookings) {
    await db.booking.update({ where: { id: booking.id }, data: { status: "EXPIRED" } });
    await cancelSessionHold(booking.id).catch((err) => {
      log.error("cron-expired-booking-hold-cancel-failed", {
        jobId: job.id,
        bookingId: booking.id,
        error: serializeError(err),
      });
    });
    if (booking.slotId) {
      await db.timeSlot.update({ where: { id: booking.slotId }, data: { available: true } }).catch((err) => {
        log.error("cron-expired-slot-release-failed", {
          jobId: job.id,
          bookingId: booking.id,
          slotId: booking.slotId,
          error: serializeError(err),
        });
      });
    }
    autoCompleted++;
  }

  const result = {
    ok: true,
    remindersSent,
    autoCompleted,
    autoExpired: expiredBookings.length,
    processed24h: bookings24h.length,
    processed1h: bookings1h.length,
    processedCompleted: completedBookings.length,
    processedExpired: expiredBookings.length,
    timestamp: now.toISOString(),
  };

  log.info("cron-booking-reminders-completed", {
    jobId: job.id,
    ...result,
  });

  return result;
}

export async function runPractitionerCommissionSyncJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const result = await syncPractitionerCommissions(db, now);
  // B483: плановая перепроверка налогового статуса едет в том же
  // practitioner-maintenance проходе (батч мал, провайдер rate-guarded).
  const taxRecheck = await recheckVerifiedTaxStatuses(now).catch((err) => {
    log.warn("cron-tax-recheck-failed", { jobId: job.id, err });
    return null;
  });
  const taxRecheckJson = taxRecheck ? { ...taxRecheck } : null;
  log.info("cron-practitioner-commission-sync-complete", {
    jobId: job.id,
    synced: result.synced,
    taxRecheck: taxRecheckJson,
  });
  return { ok: true, synced: result.synced, taxRecheck: taxRecheckJson };
}

export async function runPayoutRunJob(job: Job): Promise<JobResult> {
  const payload = job.payload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Invalid payout-run payload");
  }

  const scheduledForRaw = "scheduledFor" in payload ? payload.scheduledFor : null;
  const payoutRunIdRaw = "payoutRunId" in payload ? payload.payoutRunId : null;
  if (typeof scheduledForRaw !== "string" || typeof payoutRunIdRaw !== "string") {
    throw new Error("Invalid payout-run scheduledFor/payoutRunId");
  }

  const result = await runPayoutRun({
    payoutRunId: payoutRunIdRaw,
    scheduledFor: new Date(scheduledForRaw),
    now: jobNow(job),
    initiatedBy: "cron",
  });

  log.info("cron-payout-run-completed", {
    jobId: job.id,
    payoutRunId: result.payoutRunId,
    candidateCount: result.candidateCount,
    processingCount: result.processingCount,
    heldCount: result.heldCount,
  });

  return result;
}

/**
 * B348 / Механика 1 — 3-day subscription auto-renewal reminder.
 *
 * Finds active (non-cancelling) subscriptions whose current period ends in ~3
 * days and that have not yet been reminded THIS period, then notifies the owner
 * (email forced via DEFAULT_EMAIL_EVENTS; other channels per prefs) and stamps
 * `renewalReminderAt` so the next daily run skips them. Reminding is deduped
 * per period by comparing against `currentPeriodStart`.
 */
export async function runSubscriptionRenewalRemindersJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const windowStart = new Date(now.getTime() + (RENEWAL_REMINDER_LEAD_DAYS - RENEWAL_WINDOW_DAYS / 2) * 24 * 3600 * 1000);
  const windowEnd = new Date(now.getTime() + (RENEWAL_REMINDER_LEAD_DAYS + RENEWAL_WINDOW_DAYS / 2) * 24 * 3600 * 1000);

  const subscriptions = await db.userSubscription.findMany({
    where: {
      status: { in: ["ACTIVE", "TRIALING"] },
      // A subscription set to cancel at period end will NOT auto-renew — no
      // reminder, otherwise the message would be misleading.
      cancelAtPeriodEnd: false,
      currentPeriodEnd: { gte: windowStart, lt: windowEnd },
    },
    select: {
      id: true,
      userId: true,
      planKey: true,
      currentPeriodStart: true,
      currentPeriodEnd: true,
      renewalReminderAt: true,
    },
    take: 5000,
  });

  let remindersSent = 0;
  let skipped = 0;
  for (const sub of subscriptions) {
    // Dedupe per period: skip if already reminded after this period started.
    const periodStart = sub.currentPeriodStart;
    if (sub.renewalReminderAt && (!periodStart || sub.renewalReminderAt >= periodStart)) {
      skipped++;
      continue;
    }

    const plan = V5_SUBSCRIPTION_PLANS[sub.planKey];
    const renewsOn = sub.currentPeriodEnd
      ? new Date(sub.currentPeriodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })
      : "скоро";

    await notify({
      userId: sub.userId,
      event: "SUBSCRIPTION_RENEWAL",
      data: {
        planKey: sub.planKey,
        planLabel: plan?.name ?? sub.planKey,
        renewsOn,
        amountRub: plan ? String(Math.round(plan.amountKopecks / 100)) : "",
      },
    });

    await db.userSubscription.update({
      where: { id: sub.id },
      data: { renewalReminderAt: now },
    });
    remindersSent++;
  }

  const result = {
    ok: true,
    remindersSent,
    skipped,
    processed: subscriptions.length,
    timestamp: now.toISOString(),
  };

  log.info("cron-subscription-renewal-reminders-completed", { jobId: job.id, ...result });
  return result;
}

/**
 * B351 / Баг 16 — 24h-grace session escrow capture. Captures still-held
 * CONFIRMED bookings whose session ended >24h ago and were never captured at
 * start (no video room opened), so the authorized hold doesn't expire unpaid.
 */
export async function runSessionEscrowCaptureJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const { scanned, captured } = await captureGraceExpiredSessions(now);
  const result = { ok: true, scanned, captured, timestamp: now.toISOString() };
  log.info("cron-session-escrow-capture-completed", { jobId: job.id, ...result });
  return result;
}

/**
 * INC-081 — досверка зависших платежей.
 *
 * ResultURL — единственный путь зачисления, и у него ровно четыре попытки за
 * четыре минуты. Если в эти четыре минуты наш ответ был неверным или нода была
 * недоступна, деньги остаются списанными, а транзакция — PENDING навсегда: без
 * этого джоба к ней не возвращается никто. Ровно так и вышло с первой боевой
 * оплатой платформы.
 *
 * Джоб НЕ помечен `financial`: он не двигает деньги, а лишь дочитывает у
 * провайдера то, что уже произошло. Гейт финансовых крон-джобов защищает от
 * автоматических списаний и выплат — здесь его действие означало бы, что
 * страховка выключена ровно там, где она нужна.
 */
export async function runBillingReconcilePendingJob(job: Job): Promise<JobResult> {
  const changed = await reconcileRobokassaBacklog();
  const result = {
    ok: true,
    changed: changed.length,
    outcomes: changed.map((item) => `${item.invoiceId}:${item.outcome}`),
    timestamp: jobNow(job).toISOString(),
  };
  log.info("cron-billing-reconcile-pending-completed", { jobId: job.id, ...result });
  return result;
}

/**
 * B591 фаза 4 — сроки ИП за 10 и за 3 дня.
 *
 * Календарь на экране закрывает вопрос «когда», но не вопрос «вспомнить».
 * Отправка идёт суперадминам со связанным Telegram; отсутствие получателей —
 * это НЕ успех, а `ok: false`: «напоминания работают» при нулевой доставке
 * было бы ровно тем сюрпризом, который контур убирает.
 */
export async function runIpObligationRemindersJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const result = await runIpObligationReminders(now);
  log.info("cron-ip-obligation-reminders-completed", { jobId: job.id, ...result });
  return { ...result, timestamp: now.toISOString() };
}

/**
 * B589 фаза 1. Джоб ТОЛЬКО пополняет очередь черновиков; наружу не уходит
 * ничего, адаптеры каналов — фаза 2. Это не осторожность ради осторожности:
 * публикация необратима, и первые две недели черновик обязан посмотреть
 * человек в `/admin/marketing/publications`.
 */
export async function runMarketingGenerateJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const result = await generateMarketingDrafts({ now });
  log.info("cron-marketing-generate-completed", { jobId: job.id, ...result });
  return { ...result, timestamp: now.toISOString() };
}

/** B589 фаза 2: выпускает только утверждённые записи и только при флаге. */
export async function runMarketingPublishJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  if (!await marketingAgentEnabled()) {
    return { enabled: false, due: 0, published: 0, failed: 0, timestamp: now.toISOString() };
  }
  const result = await publishScheduledMarketing({ now });
  log.info("cron-marketing-publish-completed", { jobId: job.id, ...result });
  return { ...result, timestamp: now.toISOString() };
}

export async function runVideoChatRetentionJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const result = await cleanupExpiredVideoChats(now);
  log.info("cron-video-chat-retention-completed", { jobId: job.id, ...result });
  return { ok: result.fileFailures === 0, ...result, timestamp: now.toISOString() };
}

export async function runMarketingTriggersJob(job: Job): Promise<JobResult> {
  const now = jobNow(job);
  const result = await runMarketingTriggers(now);
  log.info("cron-marketing-triggers-completed", { jobId: job.id, ...result });
  return { ok: result.failed === 0, ...result, timestamp: now.toISOString() };
}

export const CRON_JOB_HANDLERS: JobHandlers = {
  "cron.billing-reconcile-pending": runBillingReconcilePendingJob as JobHandler,
  "cron.cleanup-users": runCleanupUsersJob as JobHandler,
  "cron.booking-reminders": runBookingRemindersJob as JobHandler,
  "cron.practitioner-sync": runPractitionerCommissionSyncJob as JobHandler,
  "cron.payout-run": runPayoutRunJob as JobHandler,
  "cron.credits-expiring": runCreditsExpiringJob as JobHandler,
  "cron.streak-at-risk": runStreakAtRiskJob as JobHandler,
  "cron.moment-of-need": runMomentOfNeedJob as JobHandler,
  "cron.subscription-renewal": runSubscriptionRenewalRemindersJob as JobHandler,
  "cron.session-escrow-capture": runSessionEscrowCaptureJob as JobHandler,
  "cron.ip-obligation-reminders": runIpObligationRemindersJob as JobHandler,
  "cron.marketing-generate": runMarketingGenerateJob as JobHandler,
  "cron.marketing-publish": runMarketingPublishJob as JobHandler,
  "cron.marketing-triggers": runMarketingTriggersJob as JobHandler,
  "cron.video-chat-retention": runVideoChatRetentionJob as JobHandler,
};
