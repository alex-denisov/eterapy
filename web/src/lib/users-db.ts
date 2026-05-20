/**
 * User operations через Prisma.
 * Замена in-memory users-store.ts.
 */

import db from "./db";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";

export type { User };

export const usersDb = {
  async get(email: string): Promise<User | null> {
    return db.user.findUnique({ where: { email: email.toLowerCase() } });
  },

  async getById(id: string): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  },

  async getByVerificationToken(token: string): Promise<User | null> {
    return db.user.findFirst({ where: { verificationToken: token } });
  },

  async getByResetToken(token: string): Promise<User | null> {
    return db.user.findFirst({ where: { resetToken: token } });
  },

  async create(data: { email: string; name: string; password: string }): Promise<User> {
    const token = crypto.randomUUID().replace(/-/g, "");
    const hashedPassword = await bcrypt.hash(data.password, 10);
    return db.user.create({
      data: {
        email: data.email.toLowerCase(),
        name: data.name,
        password: hashedPassword,
        emailVerified: false,
        verificationToken: token,
        verificationExpires: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
  },

  async update(email: string, patch: Partial<User>): Promise<User | null> {
    return db.user.update({
      where: { email: email.toLowerCase() },
      data: patch,
    }).catch(() => null);
  },

  async setResetToken(email: string): Promise<string | null> {
    const token = crypto.randomUUID().replace(/-/g, "");
    const user = await db.user.update({
      where: { email: email.toLowerCase() },
      data: {
        resetToken: token,
        resetExpires: new Date(Date.now() + 60 * 60 * 1000),
      },
    }).catch(() => null);
    return user ? token : null;
  },

  /** Seed тест-аккаунтов при старте (идемпотентно) */
  async seedTestAccounts() {
    const bcrypt = await import("bcryptjs");
    const testUsers = [
      {
        id: "test-client-001",
        email: "client@test.eterapy.com",
        name: "Тест Клиент",
        password: process.env.TEST_USER_PASSWORD ?? "test1234",
        role: "CLIENT" as const,
        emailVerified: true,
      },
      {
        id: "test-practitioner-001",
        email: "practitioner@test.eterapy.com",
        name: "Елена Морозова",
        password: process.env.TEST_USER_PASSWORD ?? "test1234",
        role: "PRACTITIONER" as const,
        emailVerified: true,
      },
    ];

    for (const u of testUsers) {
      const hashed = await bcrypt.hash(u.password, 10);
      await db.user.upsert({
        where: { email: u.email },
        create: {
          id: u.id,
          email: u.email,
          name: u.name,
          password: hashed,
          role: u.role,
          emailVerified: u.emailVerified,
          provider: "web",
        },
        update: {
          name: u.name,
          role: u.role,
          emailVerified: u.emailVerified,
          password: hashed,
        },
      });
    }
  },
};
