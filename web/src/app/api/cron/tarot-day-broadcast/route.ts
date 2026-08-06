/**
 * GET /api/cron/tarot-day-broadcast
 *
 * B678 — карта дня в Telegram-бот. Только диспетчер: сама рассылка идёт в
 * очереди воркера (`cron.tarot-day-broadcast`), как у остальных суточных работ.
 *
 * Ключ идемпотентности — СУТКИ КАРТЫ (`tarotDayKey`, B684), а не UTC- и даже не
 * календарная МСК-дата. С календарной датой единственная работа за сутки
 * заводилась бы уже в 00:01 МСК, отрабатывала вхолостую (в тот час карта ещё
 * вчерашняя и вчера уже разослана) и съедала бы ключ до 7 утра — то есть
 * маршрут-подстраховка молча переставал бы страховать.
 */
import { NextRequest } from "next/server";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { enqueueJob } from "@/lib/job-queue";
import { requestContextFromHeaders } from "@/lib/request-context";
import { tarotDayKey } from "@/lib/tarot-day";

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
  const idempotencyKey = `tarot-day-broadcast:${tarotDayKey(now)}`;
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
