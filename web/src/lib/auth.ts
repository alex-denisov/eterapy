import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { usersDb } from "./users-db";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
      },
      async authorize(credentials) {
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

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: user.emailVerified,
          role: user.role,
        };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        // @ts-expect-error custom fields
        token.emailVerified = user.emailVerified;
        // @ts-expect-error custom fields
        token.role = user.role;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        // @ts-expect-error custom fields
        session.user.emailVerified = token.emailVerified;
        // @ts-expect-error custom fields
        session.user.role = token.role;
      }
      return session;
    },
  },
});
