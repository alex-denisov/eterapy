/**
 * GET /api/cron/moment-of-need
 *
 * Fast dispatcher only. Inactive-client reactivation runs in the DB-backed
 * worker queue and is capped for fourteen days in the worker.
 */
import { NextRequest } from "next/server";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { enqueueJob } from "@/lib/job-queue";
import { requestContextFromHeaders } from "@/lib/request-context";

function isCronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization");
  if (!secret) return process.env.NODE_ENV !== "production";
  return auth === `Bearer ${secret}`;
}

function momentOfNeedKey(now: Date) {
  return `moment-of-need:${now.toISOString().slice(0, 10)}`;
}

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  if (!isCronAuthorized(req)) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const now = new Date();
  const idempotencyKey = momentOfNeedKey(now);
  const job = await enqueueJob({
    queue: "cron",
    type: "cron.moment-of-need",
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
