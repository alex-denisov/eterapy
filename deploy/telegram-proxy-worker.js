/**
 * Cloudflare Worker: Telegram Bidirectional Proxy
 *
 * Solves two problems on RF-hosted servers:
 *   1. Outbound: server → api.telegram.org blocked
 *      → server calls worker.dev/bot<TOKEN>/method → worker forwards to api.telegram.org
 *   2. Inbound:  Telegram → server webhook times out
 *      → Telegram webhook targets worker.dev/webhook → worker forwards to eterapy.com
 *
 * Routes:
 *   /bot<TOKEN>/*    → https://api.telegram.org/bot<TOKEN>/*           (API proxy)
 *   /webhook         → https://eterapy.com/api/telegram/webhook         (notif-bot relay)
 *   /support-webhook → https://eterapy.com/api/telegram/support-webhook (support-bot relay)
 *
 * The relay matters because Telegram's delivery IPs are blocked by the
 * Cloudflare edge in front of eterapy.com (the support bot showed a permanent
 * "Connection timed out"), so staff replies never reached the cabinet chat.
 * Telegram CAN reach this Worker; the Worker fetches the origin as an internal
 * subrequest, which is not subject to the same edge bot-protection.
 *
 * Setup:
 *   1. Deploy: `npx wrangler deploy -c deploy/telegram-proxy-wrangler.toml`
 *   2. Set env on VPS: TELEGRAM_API_BASE=https://<worker>.workers.dev/bot<TOKEN>
 *   3. Register webhook URLs at https://<worker>.workers.dev/webhook and
 *      https://<worker>.workers.dev/support-webhook
 */

const BACKEND_ORIGIN = "https://eterapy.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname + url.search;

    if (path.startsWith("/webhook") || path.startsWith("/support-webhook")) {
      return this.relayWebhook(request, path);
    }

    if (path.startsWith("/bot")) {
      return this.proxyApi(request, path);
    }

    return new Response(JSON.stringify({ ok: false, error: "Unknown route" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  },

  async relayWebhook(request, path) {
    const targetUrl = `${BACKEND_ORIGIN}/api/telegram${path}`;

    try {
      const headers = new Headers(request.headers);
      headers.set("Host", new URL(BACKEND_ORIGIN).host);

      const response = await fetch(targetUrl, {
        method: request.method,
        headers,
        body: request.method !== "GET" ? request.body : undefined,
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type":
            response.headers.get("Content-Type") || "application/json",
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: `Webhook relay error: ${error.message}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
  },

  async proxyApi(request, path) {
    const telegramUrl = `https://api.telegram.org${path}`;

    try {
      const response = await fetch(telegramUrl, {
        method: request.method,
        headers: {
          "Content-Type":
            request.headers.get("Content-Type") || "application/json",
        },
        body: request.method !== "GET" ? request.body : undefined,
      });

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          "Content-Type":
            response.headers.get("Content-Type") || "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ ok: false, error: `API proxy error: ${error.message}` }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
