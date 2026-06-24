import type { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";
import { SESSION_COOKIE_NAME } from "@/lib/auth.config";

/**
 * NextAuth v5 encrypts the session JWT as a JWE (alg=dir, A256CBC-HS512).
 * The raw cookie value CANNOT be parsed by splitting on "." — the JWE
 * has 5 segments and segment[1] (encrypted key) is empty for alg=dir,
 * and the payload is in segment[3] (ciphertext) which is encrypted.
 *
 * We decrypt using AUTH_SECRET with salt = cookie name (the Auth.js default).
 * This function is edge-safe (uses WebCrypto via `jose`).
 *
 * N2: large session JWTs exceed the ~4 KB per-cookie limit, so Auth.js splits
 * them into CHUNKS named `<cookie>.0`, `<cookie>.1`, …. Reading only the plain
 * cookie name then misses the whole session — the edge proxy sees role=null and
 * bounces the user to /login even though they're authenticated, which on the
 * app subdomain manifests as an app↔login redirect loop ("page won't load").
 * We must reassemble the chunks (in numeric order) before decoding, exactly as
 * the full Auth.js handler does.
 */
export type SessionClaims = { role: string | null; id: string | null };

const COOKIE_NAMES = Array.from(new Set([
  SESSION_COOKIE_NAME,
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "next-auth.session-token",
]));

/**
 * Return the full cookie value for `name`, reassembling Auth.js chunk cookies
 * (`name.0`, `name.1`, …) when the plain cookie is absent.
 */
export function readSessionCookieValue(
  cookies: Pick<NextRequest, "cookies">["cookies"],
  name: string,
): string | null {
  const plain = cookies.get(name)?.value;
  if (plain) return plain;

  // Defensive: `RequestCookies` always provides getAll(), but guard for
  // narrowed/partial cookie shapes so we never throw in the edge proxy.
  if (typeof cookies.getAll !== "function") return null;

  const prefix = `${name}.`;
  const chunks = cookies
    .getAll()
    .filter((cookie) => cookie.name.startsWith(prefix))
    .map((cookie) => ({ index: Number(cookie.name.slice(prefix.length)), value: cookie.value }))
    .filter((chunk) => Number.isInteger(chunk.index))
    .sort((a, b) => a.index - b.index);

  if (chunks.length === 0) return null;
  return chunks.map((chunk) => chunk.value).join("");
}

export async function getSessionFromCookie(
  request: Pick<NextRequest, "cookies">,
): Promise<SessionClaims> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return { role: null, id: null };

  for (const name of COOKIE_NAMES) {
    const value = readSessionCookieValue(request.cookies, name);
    if (!value) continue;

    try {
      const token = await decode({
        token: value,
        secret,
        // Salt stays the BASE cookie name even for chunked cookies.
        salt: name,
      });
      if (!token) continue;
      const claims = token as Record<string, unknown>;
      return {
        role: typeof claims.role === "string" ? claims.role : null,
        id: typeof claims.id === "string" ? claims.id : null,
      };
    } catch {
      // Wrong salt/secret or malformed token — try next cookie name.
    }
  }

  return { role: null, id: null };
}
