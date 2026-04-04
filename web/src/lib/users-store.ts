/**
 * MVP in-memory user store.
 * Будет заменён на Prisma+PostgreSQL.
 */

export interface User {
  id: string;
  email: string;
  name: string;
  password: string;
  role: "client" | "practitioner";
  emailVerified: boolean;
  verificationToken: string | null;
  verificationExpires: number | null; // Date.now() + ms
  resetToken: string | null;
  resetExpires: number | null;
  createdAt: number;
}

const store = new Map<string, User>(); // keyed by email

// Тестовые аккаунты — всегда доступны
const TEST: User[] = [
  {
    id: "test-client-001",
    email: "client@test.eterapy.com",
    name: "Тест Клиент",
    password: "test1234",
    role: "client",
    emailVerified: true,
    verificationToken: null,
    verificationExpires: null,
    resetToken: null,
    resetExpires: null,
    createdAt: Date.now(),
  },
  {
    id: "test-practitioner-001",
    email: "practitioner@test.eterapy.com",
    name: "Елена Морозова",
    password: "test1234",
    role: "practitioner",
    emailVerified: true,
    verificationToken: null,
    verificationExpires: null,
    resetToken: null,
    resetExpires: null,
    createdAt: Date.now(),
  },
];
TEST.forEach((u) => store.set(u.email, u));

export const usersStore = {
  get(email: string): User | undefined {
    return store.get(email.toLowerCase());
  },

  getById(id: string): User | undefined {
    for (const u of store.values()) {
      if (u.id === id) return u;
    }
  },

  getByVerificationToken(token: string): User | undefined {
    for (const u of store.values()) {
      if (u.verificationToken === token) return u;
    }
  },

  getByResetToken(token: string): User | undefined {
    for (const u of store.values()) {
      if (u.resetToken === token) return u;
    }
  },

  create(data: { email: string; name: string; password: string }): User {
    const token = crypto.randomUUID().replace(/-/g, "");
    const user: User = {
      id: crypto.randomUUID(),
      email: data.email.toLowerCase(),
      name: data.name,
      password: data.password,
      role: "client",
      emailVerified: false,
      verificationToken: token,
      verificationExpires: Date.now() + 24 * 60 * 60 * 1000, // 24h
      resetToken: null,
      resetExpires: null,
      createdAt: Date.now(),
    };
    store.set(user.email, user);
    return user;
  },

  update(email: string, patch: Partial<User>): User | undefined {
    const user = store.get(email.toLowerCase());
    if (!user) return undefined;
    Object.assign(user, patch);
    return user;
  },

  setResetToken(email: string): string | null {
    const user = store.get(email.toLowerCase());
    if (!user) return null;
    const token = crypto.randomUUID().replace(/-/g, "");
    user.resetToken = token;
    user.resetExpires = Date.now() + 60 * 60 * 1000; // 1h
    return token;
  },
};
