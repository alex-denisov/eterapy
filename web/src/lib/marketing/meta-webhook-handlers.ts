/**
 * B618 — общая проводка webhook Threads и Instagram.
 *
 * У площадок один и тот же протокол: GET с `hub.challenge` для подтверждения
 * адреса и POST с подписью `x-hub-signature-256`. Отличаются только имена
 * секретов, поэтому маршруты остаются тонкими, а разбор — один.
 */

import { log, serializeError } from "@/lib/logger";
import { ingestInboundMessage, type InboundPlatform } from "@/lib/marketing/inbound";
import type { MetaMarketingPlatform } from "@/lib/marketing/meta-oauth";
import {
  parseMetaInboundEvents,
  verifyMetaWebhookSignature,
} from "@/lib/marketing/meta-webhooks";
import {
  marketingPlatformValue,
  type MarketingPlatformFieldKey,
} from "@/lib/marketing/platform-settings";

const KEYS: Record<MetaMarketingPlatform, {
  verifyToken: MarketingPlatformFieldKey;
  userId: MarketingPlatformFieldKey;
  platform: InboundPlatform;
}> = {
  Threads: {
    verifyToken: "THREADS_WEBHOOK_VERIFY_TOKEN",
    userId: "THREADS_USER_ID",
    platform: "threads",
  },
  Instagram: {
    verifyToken: "INSTAGRAM_WEBHOOK_VERIFY_TOKEN",
    userId: "INSTAGRAM_USER_ID",
    platform: "instagram",
  },
};

export async function handleMetaWebhookVerification(
  platform: MetaMarketingPlatform,
  request: Request,
): Promise<Response> {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const suppliedToken = url.searchParams.get("hub.verify_token");
  const expectedToken = await marketingPlatformValue(KEYS[platform].verifyToken);
  if (mode !== "subscribe" || !challenge || !expectedToken || suppliedToken !== expectedToken) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function handleMetaWebhookDelivery(
  platform: MetaMarketingPlatform,
  request: Request,
): Promise<Response> {
  const rawBody = await request.text();
  const valid = await verifyMetaWebhookSignature(
    platform,
    rawBody,
    request.headers.get("x-hub-signature-256"),
  ).catch(() => false);
  if (!valid) return new Response("Invalid signature", { status: 403 });

  let ingested = 0;
  try {
    const selfUserId = await marketingPlatformValue(KEYS[platform].userId);
    const events = parseMetaInboundEvents(JSON.parse(rawBody), selfUserId);
    for (const event of events) {
      const result = await ingestInboundMessage({
        platform: KEYS[platform].platform,
        kind: event.kind,
        externalId: event.externalId,
        threadId: event.threadId,
        authorLabel: event.authorLabel,
        text: event.text,
        permalink: event.permalink,
      });
      if (result?.created) ingested += 1;
    }
  } catch (error) {
    // Площадке всё равно отвечаем 200: повторная доставка того же события не
    // исправит наш разбор, а Meta отключает подписку за череду ошибок. След
    // остаётся в журнале, и незамеченным входящее не будет: сторож очереди
    // считает сами сообщения, а не доставки webhook.
    log.error("marketing.meta_webhook_failed", {
      platform,
      error: serializeError(error),
    });
  }
  // A valid webhook is normal traffic, not an incident/action item. Keep only
  // bounded operational telemetry; actionable processing failures are raised
  // by the worker through the usual durable signal path.
  log.info("marketing.meta_webhook_received", {
    platform,
    bytes: Buffer.byteLength(rawBody, "utf8"),
    ingested,
  });
  return new Response("EVENT_RECEIVED", { status: 200 });
}
