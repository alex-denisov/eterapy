import NextAuth from "next-auth";
import type { Session } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { headers } from "next/headers";
import { usersDb } from "./users-db";
import db from "./db";
import bcrypt from "bcryptjs";
import { logAudit } from "./audit";
import { authConfig } from "./auth.config";
import { authRateLimitKey, checkAuthRateLimit } from "./auth-rate-limit";
import { readImpersonation } from "./impersonation";
import { getRequestMeta } from "./request-meta";

/**
 * U5 (antifraud) — record a LOGIN event with the source IP, device label and
 * channel. IP goes in the AuditLog.ip column; device/channel are stored as JSON
 * in details so the admin user card can surface "last session" provenance.
 */
async function logLoginEvent(userId: string, channel: string): Promise<void> {
  const meta = await getRequestMeta();
  const details = JSON.stringify({ method: channel, device: meta.device ?? null, channel });
  await logAudit(userId, "LOGIN", undefined, details, meta.ip ?? undefined);
}

type CredentialsInput = Partial<Record<"email" | "password" | "impersonateToken", unknown>>;

function isBcryptHash(passwordHash: string) {
  return /^\$2[aby]\$\d{2}\$/.test(passwordHash);
}

function allowPlaintextPasswordFallback() {
  return process.env.NODE_ENV !== "production" && process.env.ALLOW_PLAINTEXT_PASSWORDS === "true";
}

export async function authorize(credentials: CredentialsInput | undefined) {
  // ── Impersonation path: SUPERADMIN one-time token ─────────────────────
  const impToken = credentials?.impersonateToken as string | undefined;
  if (impToken) {
    const record = await db.telegramLinkToken.findUnique({
      where: { token: `imp:${impToken}` },
    });
    if (!record || record.expiresAt < new Date()) return null;
    // Delete immediately — one-time use
    await db.telegramLinkToken.delete({ where: { token: `imp:${impToken}` } });
    const target = await db.user.findUnique({
      where: { id: record.userId },
      select: { id: true, email: true, name: true, role: true, emailVerified: true, blockedAt: true, deletedAt: true },
    });
    if (!target || target.blockedAt || target.deletedAt) return null;
    return {
      id: target.id,
      email: target.email,
      name: target.name,
      emailVerified: target.emailVerified,
      role: target.role,
    };
  }

  // ── Normal email/password path ─────────────────────────────────────────
  const email = credentials?.email as string;
  const password = credentials?.password as string;
  if (!email || !password) return null;
  const loginLimit = checkAuthRateLimit(authRateLimitKey("login:email", email), 10, 15 * 60_000);
  if (!loginLimit.allowed) return null;

  const user = await usersDb.get(email);
  if (!user) return null;

  // Blocked users cannot login
  if (user.blockedAt || user.deletedAt) return null;

  const isHashed = isBcryptHash(user.password);
  if (!isHashed && !allowPlaintextPasswordFallback()) return null;

  const valid = isHashed ? await bcrypt.compare(password, user.password) : user.password === password;
  if (!valid) return null;

  await logLoginEvent(user.id, "email");

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    role: user.role,
  };
}

export const { handlers, signIn, signOut, auth: rawAuth } = NextAuth({
  ...authConfig,
  debug: process.env.NODE_ENV !== "production",
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
        impersonateToken: { label: "Impersonate Token", type: "text" },
      },
      // @ts-expect-error NextAuth v5 Credentials authorize type mismatch
      async authorize(credentials) {
        return authorize(credentials);
      },
    }),

    // Google OAuth — только если GOOGLE_CLIENT_ID задан
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET ? [
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    ] : []),
  ],

  callbacks: {
    // Merge: session callback from authConfig + signIn/jwt callbacks here
    ...authConfig.callbacks,

    async signIn({ user, account }) {
      // Обработка OAuth входа (Google)
      if (account?.provider === "google" && user.email) {
        // Ищем или создаём пользователя
        let dbUser = await db.user.findUnique({ where: { email: user.email } });

        if (!dbUser) {
          // Регистрируем нового пользователя через Google
          dbUser = await db.user.create({
            data: {
              email: user.email,
              name: user.name ?? user.email.split("@")[0],
              password: `oauth:${account?.provider}:${Date.now()}`, // non-loginable password
              role: "CLIENT",
              emailVerified: true, // Google верифицирует email
              avatarUrl: user.image ?? null,
            },
          });
          const meta = await getRequestMeta();
          const details = JSON.stringify({ method: `OAuth: ${account?.provider}`, device: meta.device ?? null });
          await logAudit(dbUser.id, "REGISTER", undefined, details, meta.ip ?? undefined);
        } else if (dbUser.blockedAt || dbUser.deletedAt) {
          return false; // Blocked user cannot login via OAuth
        }

        // Обновляем аватар если не задан
        if (!dbUser.avatarUrl && user.image) {
          await db.user.update({ where: { id: dbUser.id }, data: { avatarUrl: user.image } });
        }

        // Сохраняем id для jwt callback
        user.id = dbUser.id;
        const provider = account?.provider ?? "oauth";
        await logLoginEvent(dbUser.id, provider);
      }
      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        (token as Record<string, unknown>).id = user.id;
        (token as Record<string, unknown>).emailVerified = user.emailVerified ? String(user.emailVerified) : undefined;
        (token as Record<string, unknown>).role = user.role;
      }

      // При OAuth входе загружаем данные из БД
      if (account?.provider === "google" && token.id) {
        const dbUser = await db.user.findUnique({
          where: { id: token.id as string },
          select: { role: true, emailVerified: true },
        });
        if (dbUser) {
          (token as Record<string, unknown>).role = dbUser.role;
          (token as Record<string, unknown>).emailVerified = dbUser.emailVerified;
        }
      }

      return token;
    },

  },
});

/**
 * B1: impersonation-aware `auth()`. Every call site imports this single export,
 * so wrapping it here makes impersonation work platform-wide with zero
 * call-site changes — and keeps the real session cookie untouched.
 *
 * Rules:
 * - Admin host (admin.eterapy.com) ALWAYS returns the real session, so a
 *   superadmin is never demoted to the impersonated user while in the admin
 *   panel (this was the source of the redirect loops).
 * - On the cabinet host, an impersonation cookie is honored only when the real
 *   session belongs to its issuer and that issuer is an admin/superadmin.
 */
export async function auth(): Promise<Session | null> {
  const session = await rawAuth();
  if (!session?.user) return session;

  let host = "";
  try {
    const h = await headers();
    host = (h.get("x-forwarded-host") ?? h.get("host") ?? "").toLowerCase();
  } catch {
    host = "";
  }
  if (host.startsWith("admin.")) return session;

  try {
    const imp = await readImpersonation();
    if (!imp) return session;
    if (!["ADMIN", "SUPERADMIN"].includes(session.user.role ?? "")) return session;
    if (session.user.id !== imp.impersonatorId) return session;

    const target = await db.user.findUnique({
      where: { id: imp.targetUserId },
      select: { id: true, name: true, email: true, role: true, blockedAt: true, deletedAt: true },
    });
    if (!target || target.blockedAt || target.deletedAt) return session;

    return {
      ...session,
      user: {
        ...session.user,
        id: target.id,
        name: target.name ?? session.user.name,
        email: target.email ?? session.user.email,
        role: target.role,
        impersonatedBy: imp.impersonatorId,
      },
    };
  } catch {
    // Impersonation resolution must never break a normal auth() call.
    return session;
  }
}
