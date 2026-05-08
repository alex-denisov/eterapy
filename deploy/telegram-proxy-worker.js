/**
 * Cloudflare Worker: Telegram Bot API Proxy
 * 
 * Problem: Server in RF cannot reach api.telegram.org directly.
 * Solution: Worker runs on Cloudflare edge (not blocked) and forwards requests.
 *
 * Setup:
 * 1. Create worker: `npx wrangler init telegram-proxy --type=javascript`
 * 2. Deploy: `npx wrangler deploy`
 * 3. Set env var in eterapy: TELEGRAM_API_BASE=https://<worker-name>.<account>.workers.dev/bot<TOKEN>
 *
 * The worker forwards all requests to api.telegram.org and returns responses.
 */

export default {
  async fetch(request) {
    const url = new URL(request.url);
    
    // Reconstruct the full path including the bot token part
    // Expected format: https://worker.workers.dev/bot<TOKEN>/method
    const path = url.pathname + url.search;
    
    // Forward to Telegram API
    const telegramUrl = `https://api.telegram.org${path}`;
    
    try {
      const response = await fetch(telegramUrl, {
        method: request.method,
        headers: {
          'Content-Type': request.headers.get('Content-Type') || 'application/json',
        },
        body: request.method !== 'GET' ? request.body : undefined,
      });
      
      // Return the response as-is
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'Content-Type': response.headers.get('Content-Type') || 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: `Worker proxy error: ${error.message}` 
        }),
        { 
          status: 502, 
          headers: { 'Content-Type': 'application/json' } 
        }
      );
    }
  }
};
