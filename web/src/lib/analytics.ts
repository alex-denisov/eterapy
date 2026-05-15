import type { PrismaClient, Prisma } from "@prisma/client";

type TrackPayload = {
  event: string;
  surface?: string;
  dialogueId?: string;
  properties?: Record<string, unknown>;
};

export function track(payload: TrackPayload): void {
  fetch("/api/analytics/track", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    keepalive: true,
  }).catch(() => { /* best-effort */ });
}

export function trackServerEvent(
  db: PrismaClient,
  data: Prisma.AnalyticsEventCreateInput
): void {
  db.analyticsEvent.create({ data }).catch(() => { /* non-critical */ });
}
