import type { JobStatus, Prisma } from "@prisma/client";
import db from "@/lib/db";
import { NOTIFICATION_DELIVERY_JOB_TYPE } from "@/lib/notification-delivery";

type DeliveryPayload = {
  userId?: string;
  event?: string;
  channel?: string;
  requestId?: string;
};

function payloadSummary(payload: Prisma.JsonValue | null): DeliveryPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  const value = payload as Record<string, unknown>;
  return {
    userId: typeof value.userId === "string" ? value.userId : undefined,
    event: typeof value.event === "string" ? value.event : undefined,
    channel: typeof value.channel === "string" ? value.channel : undefined,
    requestId: typeof value.requestId === "string" ? value.requestId : undefined,
  };
}

export async function getAdminNotificationDiagnostics() {
  const [grouped, recent] = await Promise.all([
    db.job.groupBy({
      by: ["status"],
      where: { type: NOTIFICATION_DELIVERY_JOB_TYPE },
      _count: { _all: true },
    }),
    db.job.findMany({
      where: { type: NOTIFICATION_DELIVERY_JOB_TYPE },
      orderBy: { createdAt: "desc" },
      take: 25,
      select: {
        id: true,
        status: true,
        attempts: true,
        maxAttempts: true,
        runAfter: true,
        error: true,
        payload: true,
        createdAt: true,
        updatedAt: true,
      },
    }),
  ]);

  const stats: Record<JobStatus, number> = {
    PENDING: 0,
    RUNNING: 0,
    SUCCEEDED: 0,
    FAILED: 0,
    DEAD: 0,
  };

  for (const row of grouped) stats[row.status] = row._count._all;

  return {
    jobType: NOTIFICATION_DELIVERY_JOB_TYPE,
    stats,
    recent: recent.map((job) => ({
      id: job.id,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      runAfter: job.runAfter.toISOString(),
      error: job.error,
      payload: payloadSummary(job.payload),
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    })),
  };
}
