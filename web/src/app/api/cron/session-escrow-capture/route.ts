/**
 * GET /api/cron/session-escrow-capture
 *
 * Fast dispatcher only. The 24h-grace escrow capture (B351 / Баг 16) runs in
 * the DB-backed worker queue so retries stay idempotent.
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

function escrowCaptureKey(now: Date) {
  // Hourly bucket — grace capture is time-sensitive but cheap; run often.
  return `session-escrow-capture:${now.toISOString().slice(0, 13)}`;
}

export async function GET(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  if (!isCronAuthorized(req)) {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const now = new Date();
  const idempotencyKey = escrowCaptureKey(now);
  const job = await enqueueJob({
    queue: "cron",
    type: "cron.session-escrow-capture",
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
