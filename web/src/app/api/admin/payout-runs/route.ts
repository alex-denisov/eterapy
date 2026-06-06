import { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { enqueueJob } from "@/lib/job-queue";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { payoutRunIdempotencyKey } from "@/lib/payout-runs";
import { previousPayoutDate } from "@/lib/payout-schedule";
import { requestContextFromHeaders } from "@/lib/request-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const bodySchema = z.object({
  scheduledFor: z.string().datetime().optional(),
});

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) {
    return errorWithRequestContext("FORBIDDEN", "Forbidden", 403, context);
  }

  const perms = await getUserPermissions(session.user.id, role);
  if (!perms.includes("practitioners.payout")) {
    return errorWithRequestContext("FORBIDDEN", "Нет полномочия practitioners.payout", 403, context);
  }

  const raw = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return errorWithRequestContext("INVALID_REQUEST", "Некорректная дата payout-run", 400, context);
  }

  const now = new Date();
  const scheduledFor = parsed.data.scheduledFor ? new Date(parsed.data.scheduledFor) : previousPayoutDate(now);
  const idempotencyKey = payoutRunIdempotencyKey(scheduledFor);
  const payoutRun = await db.payoutRun.upsert({
    where: { scheduledFor },
    create: {
      scheduledFor,
      status: "PENDING",
      initiatedBy: session.user.id,
      metadata: { requestedAt: now.toISOString(), requestedBy: "admin" },
    },
    update: {
      initiatedBy: session.user.id,
      metadata: { requestedAt: now.toISOString(), requestedBy: "admin" },
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

  await logAudit(
    session.user.id,
    "PAYOUT_RUN_ENQUEUE",
    payoutRun.id,
    `scheduledFor=${scheduledFor.toISOString()} job=${job.id}`,
  );

  return jsonWithRequestContext({
    ok: true,
    payoutRunId: payoutRun.id,
    jobId: job.id,
    jobStatus: job.status,
    idempotencyKey,
  }, { status: 202 }, context);
}
