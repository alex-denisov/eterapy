/**
 * GET /api/cron/subscription-renewal
 *
 * Fast dispatcher only. The 3-day auto-renewal reminder (B348 / Механика 1)
 * runs in the DB-backed worker queue so retries stay idempotent and the HTTP
 * cron call returns immediately.
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

function subscriptionRenewalKey(now: Date) {
  return `subscription-renewal:${now.toISOString().slice(0, 10)}`;
}

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  if (!isCronAuthorized(req)) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const now = new Date();
  const idempotencyKey = subscriptionRenewalKey(now);
  const job = await enqueueJob({
    queue: "cron",
    type: "cron.subscription-renewal",
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
