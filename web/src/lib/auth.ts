import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

// MVP: in-memory users. Будет заменено на Prisma adapter когда Иван поднимет БД.
const users = new Map<string, { id: string; email: string; name: string; password: string; role: string }>();

// Тестовые аккаунты — доступны сразу без регистрации
const TEST_ACCOUNTS = [
  {
    id: "test-client-001",
    email: "client@test.eterapy.com",
    name: "Тест Клиент",
    password: "test1234",
    role: "client",
  },
  {
    id: "test-practitioner-001",
    email: "practitioner@test.eterapy.com",
    name: "Елена Морозова",
    password: "test1234",
    role: "practitioner",
  },
];

TEST_ACCOUNTS.forEach((u) => users.set(u.email, u));

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
          users.set(email, { id, email, name: name || email, password, role: "client" });
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
