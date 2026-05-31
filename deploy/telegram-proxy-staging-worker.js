/**
 * Cloudflare Worker: Telegram Bidirectional Proxy — STAGING
 *
 * Mirror of telegram-proxy-worker.js but for the staging contour. Solves the
 * RF-datacenter block on api.telegram.org for the staging bot @eterapy_staging_bot.
 *
 * Routes:
 *   /bot<TOKEN>/*  → https://api.telegram.org/bot<TOKEN>/*           (outbound API proxy)
 *   /webhook       → https://staging.eterapy.com/api/telegram/webhook (inbound relay)
 *
 * Deploy: `npx wrangler deploy -c deploy/telegram-proxy-staging-wrangler.toml`
 * Then on the VPS staging .env.local:
 *   TELEGRAM_API_BASE=https://eterapy-staging-telegram-proxy.890525.workers.dev/bot<TOKEN>
 *   TELEGRAM_WEBHOOK_URL=https://eterapy-staging-telegram-proxy.890525.workers.dev/webhook
 */

const BACKEND_ORIGIN = "https://staging.eterapy.com";

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname + url.search;

    if (path.startsWith("/webhook")) {
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
