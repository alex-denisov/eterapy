/**
 * GET /api/cron/payouts
 *
 * Fast dispatcher only. The payout run itself is processed by the DB-backed
 * worker queue so retries are idempotent and do not block the HTTP cron call.
 */
import { NextRequest } from "next/server";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { enqueueJob } from "@/lib/job-queue";
import { payoutRunIdempotencyKey } from "@/lib/payout-runs";
import { previousPayoutDate } from "@/lib/payout-schedule";
import { requestContextFromHeaders } from "@/lib/request-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function isCronAuthorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const auth = req.headers.get("authorization");
  if (!secret) return process.env.NODE_ENV !== "production";
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  if (!isCronAuthorized(req)) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const now = new Date();
  const scheduledFor = previousPayoutDate(now);
  const idempotencyKey = payoutRunIdempotencyKey(scheduledFor);
  const payoutRun = await db.payoutRun.upsert({
    where: { scheduledFor },
    create: {
      scheduledFor,
      status: "PENDING",
      initiatedBy: "cron",
      metadata: { requestedAt: now.toISOString() },
    },
    update: {
      metadata: { requestedAt: now.toISOString() },
    },
  });

  const job = await enqueueJob({
    queue: "cron",
    type: "cron.payout-run",
    payload: {
      requestedAt: now.toISOString(),
      scheduledFor: scheduledFor.toISOString(),
      payoutRunId: payoutRun.id,
    },
    idempotencyKey,
    requestId: context.requestId,
  });

  return jsonWithRequestContext({
    ok: true,
    enqueued: true,
    jobId: job.id,
    jobStatus: job.status,
    type: job.type,
    payoutRunId: payoutRun.id,
    scheduledFor: scheduledFor.toISOString(),
    idempotencyKey,
  }, { status: 202 }, context);
}
