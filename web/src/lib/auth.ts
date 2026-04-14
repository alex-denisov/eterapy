import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { usersDb } from "./users-db";
import db from "./db";
import bcrypt from "bcryptjs";
import { logAudit } from "./audit";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  debug: process.env.NODE_ENV !== "production",
  cookies: {
    sessionToken: {
      name: process.env.NODE_ENV === "production" ? "__Secure-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        // Share across subdomains in production; in dev use current domain
        domain: process.env.NODE_ENV === "production" ? ".eterapy.com" : undefined,
      },
    },
  },
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
        impersonateToken: { label: "Impersonate Token", type: "text" },
      },
      // @ts-expect-error NextAuth v5 Credentials authorize type mismatch
      async authorize(credentials, _request: Request) {
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
            select: { id: true, email: true, name: true, role: true, emailVerified: true, blockedAt: true },
          });
          if (!target || target.blockedAt) return null;
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

        const user = await usersDb.get(email);
        if (!user) return null;

        // Blocked users cannot login
        if (user.blockedAt) return null;

        // Support both bcrypt-hashed and plaintext passwords (test accounts)
        const isHashed = user.password.startsWith("$2");
        const valid = isHashed
          ? await bcrypt.compare(password, user.password)
          : user.password === password;
        if (!valid) return null;

        await logAudit(user.id, "LOGIN", undefined, `Email: ${email}`);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
          role: user.role,
        };
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

  pages: {
    signIn: "/login",
  },

  session: { strategy: "jwt" },

  callbacks: {
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
          await logAudit(dbUser.id, "REGISTER", undefined, `OAuth: ${account?.provider}`);
        } else if (dbUser.blockedAt) {
          return false; // Blocked user cannot login via OAuth
        }

        // Обновляем аватар если не задан
        if (!dbUser.avatarUrl && user.image) {
          await db.user.update({ where: { id: dbUser.id }, data: { avatarUrl: user.image } });
        }

        // Сохраняем id для jwt callback
        user.id = dbUser.id;
        const provider = account?.provider ?? "oauth";
        await logAudit(dbUser.id, "LOGIN", undefined, `OAuth: ${provider}`);
      }
      return true;
    },

    async jwt({ token, user, account }) {
      if (user) {
        (token as any).id = user.id;
        (token as any).emailVerified = user.emailVerified ? String(user.emailVerified) : undefined;
        (token as any).role = user.role;
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

    session({ session, token }) {
      if (session.user) {
        session.user.id = (token as any).id as string;
        // @ts-expect-error NextAuth v5 impossible emailVerified type (Date & string)
        session.user.emailVerified = (token as any).emailVerified ? new Date((token as any).emailVerified) : null;
        session.user.role = (token as any).role;
      }
      return session;
    },
  },
});
