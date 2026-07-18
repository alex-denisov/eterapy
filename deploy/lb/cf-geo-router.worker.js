/**
 * B540 — Cloudflare Worker geo-router (FREE tier; no paid CF Load Balancing).
 *
 * Sits on the proxied apex/app hostnames and steers each request to the right
 * CONTOUR's HAProxy origin by visitor country, honouring 152-ФЗ: RF visitors
 * → RU contour (data stays in RF); everyone else → Foreign contour.
 *
 * Session affinity: a first-party cookie pins the chosen contour so a user is
 * never bounced mid-session. BUT contour choice is authoritative by law for RF
 * — an RF-country request is always sent to RU regardless of a stale cookie,
 * and once a user is known-RF the app keeps them there (home-contour claim).
 *
 * Node affinity WITHIN a contour is handled by HAProxy's SRVID cookie, not
 * here. This Worker only decides RU-vs-Foreign.
 *
 * Deploy: wrangler publish; route the app/apex hostnames to this Worker.
 * Note the free-tier limit (100k req/day) — if traffic outgrows it, move to a
 * paid Workers plan (still far cheaper than CF Load Balancing) or split into
 * two proxied hostnames with an app-side redirect.
 */

// Origins = each contour's public HAProxy. Use hostnames that are CF-proxied
// (orange cloud) and resolve to the LB VMs.
const RU_ORIGIN = "https://ru-lb.eterapy.com";       // eterapy-1 HAProxy
const FOREIGN_ORIGIN = "https://intl-lb.eterapy.com"; // eterapy-4 HAProxy

// Countries served by the RU contour. RU only by default; add CIS members here
// only if counsel confirms their data may share the RF contour.
const RU_COUNTRIES = new Set(["RU"]);

const COOKIE = "eterapy_contour"; // "ru" | "foreign"

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const country = request.cf?.country || "XX";
    const cookieContour = readCookie(request, COOKIE);

    // Law first: RF-country traffic is always RU, cookie or not.
    let contour;
    if (RU_COUNTRIES.has(country)) {
      contour = "ru";
    } else if (cookieContour === "ru" || cookieContour === "foreign") {
      contour = cookieContour; // honour affinity for non-RF visitors
    } else {
      contour = "foreign";
    }

    const origin = contour === "ru" ? RU_ORIGIN : FOREIGN_ORIGIN;
    const target = new URL(url.pathname + url.search, origin);

    const resp = await fetch(new Request(target, request), {
      cf: { resolveOverride: new URL(origin).hostname },
    });

    // Refresh the affinity cookie (SameSite=Lax, 30d).
    const out = new Response(resp.body, resp);
    if (cookieContour !== contour) {
      out.headers.append(
        "Set-Cookie",
        `${COOKIE}=${contour}; Path=/; Max-Age=2592000; Secure; HttpOnly; SameSite=Lax`,
      );
    }
    return out;
  },
};

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, v] = part.trim().split("=");
    if (k === name) return v;
  }
  return null;
}
