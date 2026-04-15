/**
 * Edge-safe NextAuth configuration.
 * This file must NOT import any Node.js-only modules (Prisma, bcrypt, etc.)
 * It is used in middleware (Edge runtime) and as the base for the full auth config.
 */
import type { NextAuthConfig } from "next-auth";
import { MAIN_DOMAIN, USE_SUBDOMAINS } from "@/lib/subdomain";

export const SESSION_COOKIE_NAME =
  process.env.NODE_ENV === "production"
    ? "__Secure-authjs.session-token"
    : "authjs.session-token";

export const SHARED_COOKIE_DOMAIN = USE_SUBDOMAINS ? `.${MAIN_DOMAIN}` : undefined;

export const authConfig = {
  trustHost: true,

  pages: {
    signIn: "/login",
  },

  cookies: {
    sessionToken: {
      name: SESSION_COOKIE_NAME,
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
        // Share one session across eterapy.com, app.eterapy.com, admin.eterapy.com.
        domain: SHARED_COOKIE_DOMAIN,
      },
    },
  },

  session: { strategy: "jwt" as const },

  callbacks: {
    // Populate session fields from the JWT token.
    // This runs in both Edge middleware and Node.js server — no DB calls here.
    session({ session, token }) {
      if (session.user) {
        session.user.id = (token as Record<string, unknown>).id as string;
        // @ts-expect-error NextAuth v5 impossible emailVerified type (Date & string)
        session.user.emailVerified = (token as Record<string, unknown>).emailVerified
          ? new Date((token as Record<string, unknown>).emailVerified as string)
          : null;
        session.user.role = (token as Record<string, unknown>).role as string | undefined;
      }
      return session;
    },
  },

  providers: [],
} satisfies NextAuthConfig;
