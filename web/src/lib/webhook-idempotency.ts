import { Prisma, type WebhookEvent } from "@prisma/client";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";

export type WebhookProvider = "robokassa" | "yookassa" | "telegram";
export type WebhookPayload = Prisma.InputJsonValue;
export type WebhookResult = Prisma.InputJsonValue;

interface ClaimWebhookEventInput {
  provider: WebhookProvider;
  eventId: string;
  eventType: string;
  resourceId?: string | null;
  payload?: WebhookPayload;
  requestId?: string;
}

export interface ClaimWebhookEventResult {
  claimed: boolean;
  event?: WebhookEvent;
}

function isUniqueConstraintError(err: unknown) {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002";
}

export async function claimWebhookEvent(input: ClaimWebhookEventInput): Promise<ClaimWebhookEventResult> {
  try {
    const event = await db.webhookEvent.create({
      data: {
        provider: input.provider,
        eventId: input.eventId,
        eventType: input.eventType,
        resourceId: input.resourceId ?? null,
        payload: input.payload,
        requestId: input.requestId,
        status: "PROCESSING",
      },
    });
    return { claimed: true, event };
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      const existing = await db.webhookEvent.findUnique({
        where: {
          provider_eventId: {
            provider: input.provider,
            eventId: input.eventId,
          },
        },
      });
      if (existing?.status === "FAILED") {
        const event = await db.webhookEvent.update({
          where: { id: existing.id },
          data: {
            status: "PROCESSING",
            eventType: input.eventType,
            resourceId: input.resourceId ?? existing.resourceId,
            payload: input.payload,
            error: null,
            result: Prisma.DbNull,
            requestId: input.requestId,
            processedAt: null,
          },
        });
        log.info("webhook-reclaimed-failed", {
          requestId: input.requestId,
          provider: input.provider,
          eventId: input.eventId,
          eventType: input.eventType,
          resourceId: input.resourceId,
        });
        return { claimed: true, event };
      }

      log.info("webhook-deduplicated", {
        requestId: input.requestId,
        provider: input.provider,
        eventId: input.eventId,
        eventType: input.eventType,
        resourceId: input.resourceId,
      });
      return { claimed: false };
    }

    log.error("webhook-claim-failed", {
      requestId: input.requestId,
      provider: input.provider,
      eventId: input.eventId,
      eventType: input.eventType,
      resourceId: input.resourceId,
      error: serializeError(err),
    });
    throw err;
  }
}

export async function completeWebhookEvent(id: string, result: WebhookResult) {
  await db.webhookEvent.update({
    where: { id },
    data: {
      status: "PROCESSED",
      result,
      processedAt: new Date(),
    },
  });
}

export async function failWebhookEvent(id: string, err: unknown) {
  const error = serializeError(err);
  await db.webhookEvent.update({
    where: { id },
    data: {
      status: "FAILED",
      error: JSON.stringify(error),
      processedAt: new Date(),
    },
  });
}
