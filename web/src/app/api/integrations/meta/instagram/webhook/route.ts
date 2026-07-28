import { log } from "@/lib/logger";
import { marketingPlatformValue } from "@/lib/marketing/platform-settings";
import { verifyInstagramWebhookSignature } from "@/lib/marketing/meta-webhooks";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const challenge = url.searchParams.get("hub.challenge");
  const suppliedToken = url.searchParams.get("hub.verify_token");
  const expectedToken = await marketingPlatformValue("INSTAGRAM_WEBHOOK_VERIFY_TOKEN");
  if (mode !== "subscribe" || !challenge || !expectedToken || suppliedToken !== expectedToken) {
    return new Response("Forbidden", { status: 403 });
  }
  return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
}

export async function POST(request: Request) {
  const rawBody = await request.text();
  const valid = await verifyInstagramWebhookSignature(
    rawBody,
    request.headers.get("x-hub-signature-256"),
  ).catch(() => false);
  if (!valid) return new Response("Invalid signature", { status: 403 });
  // A valid webhook is normal traffic, not an incident/action item. Keep only
  // bounded operational telemetry; actionable processing failures are raised
  // by the worker through the usual durable signal path.
  log.info("marketing.instagram_webhook_received", {
    bytes: Buffer.byteLength(rawBody, "utf8"),
  });
  return new Response("EVENT_RECEIVED", { status: 200 });
}
