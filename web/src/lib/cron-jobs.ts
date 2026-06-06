import type { Job } from "@prisma/client";
import db from "@/lib/db";
import { notify } from "@/lib/notifications";
import type { JobHandlers, JobHandler } from "@/lib/job-worker";
import type { JobResult } from "@/lib/job-queue";
import { log, serializeError } from "@/lib/logger";
import { syncPractitionerCommissions } from "@/lib/practitioner-commission";

const REMINDER_WINDOW_MS = 15 * 60 * 1000;
const CLEANUP_GRACE_DAYS = 10;

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
  const cutoffDate = new Date(now.getTime() - CLEANUP_GRACE_DAYS * 24 * 60 * 60 * 1000);

  const usersToDelete = await db.user.findMany({
    where: {
      deletedAt: {
        lte: cutoffDate,
      },
    },
    select: { id: true, email: true, deletedAt: true },
  });

  let deletedCount = 0;
  for (const user of usersToDelete) {
    await db.user.delete({ where: { id: user.id } });
    deletedCount++;
  }

  log.info("cron-cleanup-users-completed", {
    jobId: job.id,
    deletedCount,
    cutoffDate: cutoffDate.toISOString(),
  });

  return {
    ok: true,
    deletedCount,
    cutoffDate: cutoffDate.toISOString(),
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
    await db.$transaction([
      db.booking.update({ where: { id: booking.id }, data: { status: "COMPLETED" } }),
      db.practitioner.update({
        where: { id: booking.practitioner.id },
        data: { sessionCount: { increment: 1 } },
      }),
    ]);
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
  log.info("cron-practitioner-commission-sync-complete", {
    jobId: job.id,
    synced: result.synced,
  });
  return { ok: true, synced: result.synced };
}

export const CRON_JOB_HANDLERS: JobHandlers = {
  "cron.cleanup-users": runCleanupUsersJob as JobHandler,
  "cron.booking-reminders": runBookingRemindersJob as JobHandler,
  "cron.practitioner-sync": runPractitionerCommissionSyncJob as JobHandler,
};
