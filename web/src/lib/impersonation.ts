/**
 * Impersonation (B1 fix) — "act as user" without touching the real session.
 *
 * The whole platform shares ONE session cookie across eterapy.com /
 * app.eterapy.com / admin.eterapy.com. The previous implementation made the
 * superadmin "become" the target user by OVERWRITING that shared cookie, which
 * also replaced the superadmin's own session on admin.eterapy.com — stranding
 * them as a lower-privilege user with redirect loops and no way back.
 *
 * Instead we keep the real session untouched and carry impersonation in a
 * SEPARATE signed cookie. The `auth()` wrapper (lib/auth.ts) resolves the
 * target user from it, but ONLY on the cabinet host and ONLY when the real
 * session belongs to an admin/superadmin. The superadmin always stays a
 * superadmin on admin.eterapy.com.
 */
import { cookies } from "next/headers";
import { encode, decode } from "next-auth/jwt";
import type { NextResponse } from "next/server";
import { SHARED_COOKIE_DOMAIN } from "@/lib/auth.config";

export const IMPERSONATION_COOKIE = "eterapy-imp";
const TTL_SECONDS = 60 * 60 * 2; // 2 hours

export interface ImpersonationToken {
  targetUserId: string;
  impersonatorId: string;
}

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    domain: SHARED_COOKIE_DOMAIN,
  };
}

export async function encodeImpersonationToken(payload: ImpersonationToken): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return encode({
    token: {
      sub: payload.targetUserId,
      impersonatorId: payload.impersonatorId,
      iat: now,
      exp: now + TTL_SECONDS,
    },
    secret: process.env.AUTH_SECRET!,
    salt: IMPERSONATION_COOKIE,
  });
}

export function setImpersonationCookie(res: NextResponse, token: string): void {
  res.cookies.set(IMPERSONATION_COOKIE, token, { ...cookieOptions(), maxAge: TTL_SECONDS });
}

export function clearImpersonationCookie(res: NextResponse): void {
  res.cookies.set(IMPERSONATION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

/** Read + verify the impersonation cookie from the current request. */
export async function readImpersonation(): Promise<ImpersonationToken | null> {
  const store = await cookies();
  const raw = store.get(IMPERSONATION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const decoded = await decode({ token: raw, secret: process.env.AUTH_SECRET!, salt: IMPERSONATION_COOKIE });
    if (!decoded?.sub) return null;
    const impersonatorId = (decoded as Record<string, unknown>).impersonatorId;
    if (typeof impersonatorId !== "string") return null;
    return { targetUserId: decoded.sub, impersonatorId };
  } catch {
    return null;
  }
}
