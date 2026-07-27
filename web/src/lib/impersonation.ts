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
import type { NextRequest, NextResponse } from "next/server";
import { SHARED_COOKIE_DOMAIN } from "@/lib/auth.config";

/**
 * Имена куков живут в `impersonation.shared.ts` — их читает и клиентская плашка
 * (INC-080), а серверный модуль в браузерный бандл тащить нельзя.
 *
 * `IMPERSONATION_MARKER_COOKIE` — видимая браузеру метка «идёт имперсонация».
 * Полномочия по-прежнему ТОЛЬКО в подписанном httpOnly-куке: метка ничего не
 * разрешает и ничего не подтверждает. Она нужна ровно для плашки — без неё
 * корневой layout был вынужден звать `auth()`, а одно чтение кук в корне
 * переводит в динамический рендер ВЕСЬ сайт, включая сотни статических страниц
 * библиотеки. Подделка метки даёт ровно одну возможность: показать самому себе
 * жёлтую полоску.
 */
export { IMPERSONATION_COOKIE, IMPERSONATION_MARKER_COOKIE } from "@/lib/impersonation.shared";

import {
  IMPERSONATION_COOKIE,
  IMPERSONATION_MARKER_COOKIE,
} from "@/lib/impersonation.shared";

const TTL_SECONDS = 60 * 60 * 2; // 2 hours

export interface ImpersonationToken {
  targetUserId: string;
  impersonatorId: string;
  // U3: the impersonated user's role is carried in the token so the edge proxy
  // can route the app host correctly (otherwise it reads the superadmin's real
  // session role and bounces the impersonator back to admin.eterapy.com).
  targetRole?: string | null;
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
      targetRole: payload.targetRole ?? null,
      iat: now,
      exp: now + TTL_SECONDS,
    },
    secret: process.env.AUTH_SECRET!,
    salt: IMPERSONATION_COOKIE,
  });
}

function tokenToImpersonation(decoded: Record<string, unknown> | null): ImpersonationToken | null {
  if (!decoded || typeof decoded.sub !== "string") return null;
  if (typeof decoded.impersonatorId !== "string") return null;
  return {
    targetUserId: decoded.sub,
    impersonatorId: decoded.impersonatorId,
    targetRole: typeof decoded.targetRole === "string" ? decoded.targetRole : null,
  };
}

/**
 * Edge-safe variant of readImpersonation: decode the impersonation cookie from a
 * NextRequest (the `cookies()` helper is not available inside the proxy).
 */
export async function getImpersonationFromRequest(
  request: Pick<NextRequest, "cookies">,
): Promise<ImpersonationToken | null> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const raw = request.cookies.get(IMPERSONATION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const decoded = await decode({ token: raw, secret, salt: IMPERSONATION_COOKIE });
    return tokenToImpersonation(decoded as Record<string, unknown> | null);
  } catch {
    return null;
  }
}

export function setImpersonationCookie(res: NextResponse, token: string): void {
  res.cookies.set(IMPERSONATION_COOKIE, token, { ...cookieOptions(), maxAge: TTL_SECONDS });
  // Метка ставится и снимается ВМЕСТЕ с подписанным куком — иначе плашка
  // переживёт выход из имперсонации и будет врать про чужой аккаунт.
  res.cookies.set(IMPERSONATION_MARKER_COOKIE, "1", {
    ...cookieOptions(),
    httpOnly: false,
    maxAge: TTL_SECONDS,
  });
}

export function clearImpersonationCookie(res: NextResponse): void {
  res.cookies.set(IMPERSONATION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
  res.cookies.set(IMPERSONATION_MARKER_COOKIE, "", {
    ...cookieOptions(),
    httpOnly: false,
    maxAge: 0,
  });
}

/** Read + verify the impersonation cookie from the current request. */
export async function readImpersonation(): Promise<ImpersonationToken | null> {
  const store = await cookies();
  const raw = store.get(IMPERSONATION_COOKIE)?.value;
  if (!raw) return null;
  try {
    const decoded = await decode({ token: raw, secret: process.env.AUTH_SECRET!, salt: IMPERSONATION_COOKIE });
    return tokenToImpersonation(decoded as Record<string, unknown> | null);
  } catch {
    return null;
  }
}
