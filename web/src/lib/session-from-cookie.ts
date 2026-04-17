import type { NextRequest } from "next/server";
import { decode } from "next-auth/jwt";

/**
 * NextAuth v5 encrypts the session JWT as a JWE (alg=dir, A256CBC-HS512).
 * The raw cookie value CANNOT be parsed by splitting on "." — the JWE
 * has 5 segments and segment[1] (encrypted key) is empty for alg=dir,
 * and the payload is in segment[3] (ciphertext) which is encrypted.
 *
 * We decrypt using AUTH_SECRET with salt = cookie name (the Auth.js default).
 * This function is edge-safe (uses WebCrypto via `jose`).
 */
export type SessionClaims = { role: string | null; id: string | null };

const COOKIE_NAMES = [
  "__Secure-authjs.session-token",
  "authjs.session-token",
  "next-auth.session-token",
] as const;

export async function getSessionFromCookie(
  request: Pick<NextRequest, "cookies">,
): Promise<SessionClaims> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return { role: null, id: null };

  for (const name of COOKIE_NAMES) {
    const cookie = request.cookies.get(name);
    if (!cookie?.value) continue;

    try {
      const token = await decode({
        token: cookie.value,
        secret,
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
