import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

// MVP: in-memory users. Будет заменено на Prisma adapter когда Иван поднимет БД.
const users = new Map<string, { id: string; email: string; name: string; password: string }>();

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "Email",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Пароль", type: "password" },
        name: { label: "Имя", type: "text" },
        action: { type: "hidden" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        const name = credentials?.name as string;
        const action = credentials?.action as string;

        if (!email || !password) return null;

        if (action === "register") {
          if (users.has(email)) return null;
          const id = crypto.randomUUID();
          users.set(email, { id, email, name: name || email, password });
          return { id, email, name: name || email };
        }

        // Login
        const user = users.get(email);
        if (!user || user.password !== password) return null;
        return { id: user.id, email: user.email, name: user.name };
      },
    }),
  ],
  pages: {
    signIn: "/login",
  },
  session: {
    strategy: "jwt",
  },
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
});
