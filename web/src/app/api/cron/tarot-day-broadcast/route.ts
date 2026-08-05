/**
 * GET /api/cron/tarot-day-broadcast
 *
 * B678 — карта дня в Telegram-бот. Только диспетчер: сама рассылка идёт в
 * очереди воркера (`cron.tarot-day-broadcast`), как у остальных суточных работ.
 *
 * Ключ идемпотентности — МСК-дата, а не UTC-дата: рассылка привязана к
 * московскому утру, и на границе суток UTC она иначе разъехалась бы на две
 * корзины.
 */
import { NextRequest } from "next/server";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { enqueueJob } from "@/lib/job-queue";
import { requestContextFromHeaders } from "@/lib/request-context";
import { mskDayKey } from "@/lib/tarot-day";

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
  const idempotencyKey = `tarot-day-broadcast:${mskDayKey(now)}`;
  const job = await enqueueJob({
    queue: "cron",
    type: "cron.tarot-day-broadcast",
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
