/**
 * GET /api/cron/reminders
 *
 * Fast dispatcher only. Reminder/session maintenance work runs in the
 * DB-backed worker queue.
 */
import { NextRequest } from "next/server";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { enqueueJob } from "@/lib/job-queue";
import { requestContextFromHeaders } from "@/lib/request-context";

const BUCKET_MS = 15 * 60 * 1000;

function isCronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization");
  return !secret || auth === `Bearer ${secret}`;
}

function reminderKey(now: Date) {
  const bucket = new Date(Math.floor(now.getTime() / BUCKET_MS) * BUCKET_MS);
  return `booking-reminders:${bucket.toISOString()}`;
}

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  if (!isCronAuthorized(req)) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const now = new Date();
  const idempotencyKey = reminderKey(now);
  const job = await enqueueJob({
    queue: "cron",
    type: "cron.booking-reminders",
    payload: { requestedAt: now.toISOString() },
    idempotencyKey,
    requestId: context.requestId,
  });

  return jsonWithRequestContext({
    ok: true,
    enqueued: true,
    jobId: job.id,
    jobStatus: job.status,
    type: job.type,
    idempotencyKey,
  }, { status: 202 }, context);
}
