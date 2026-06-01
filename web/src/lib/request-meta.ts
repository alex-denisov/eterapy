/**
 * U5 (antifraud) — extract the client IP + a human-readable device label from
 * the current request headers, for login-event logging and the admin user card.
 *
 * Works in any server context where next/headers `headers()` is available
 * (route handlers, server actions, the Credentials authorize callback).
 */
import { headers } from "next/headers";

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
  device: string | null;
}

/** Parse a User-Agent string into a short "Browser · OS" label. */
export function parseDevice(userAgent: string | null | undefined): string | null {
  if (!userAgent) return null;
  const ua = userAgent;

  let browser = "Браузер";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/OPR\/|Opera/.test(ua)) browser = "Opera";
  else if (/YaBrowser/.test(ua)) browser = "Yandex";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Safari\//.test(ua)) browser = "Safari";

  let os = "";
  if (/iPhone|iPad|iPod/.test(ua)) os = "iOS";
  else if (/Android/.test(ua)) os = "Android";
  else if (/Windows NT/.test(ua)) os = "Windows";
  else if (/Mac OS X/.test(ua)) os = "macOS";
  else if (/Linux/.test(ua)) os = "Linux";

  return os ? `${browser} · ${os}` : browser;
}

/** First public IP from x-forwarded-for, falling back to x-real-ip. */
export function ipFromHeaders(get: (name: string) => string | null): string | null {
  const forwarded = get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return get("x-real-ip") ?? get("cf-connecting-ip") ?? null;
}

export async function getRequestMeta(): Promise<RequestMeta> {
  try {
    const h = await headers();
    const userAgent = h.get("user-agent");
    return {
      ip: ipFromHeaders((name) => h.get(name)),
      userAgent,
      device: parseDevice(userAgent),
    };
  } catch {
    return { ip: null, userAgent: null, device: null };
  }
}
