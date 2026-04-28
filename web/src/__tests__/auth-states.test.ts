import fs from "node:fs";
import path from "node:path";
import type { NextRequest } from "next/server";
import { usersDb } from "@/lib/users-db";
import { sendVerificationEmail } from "@/lib/email";
import { POST as register } from "@/app/api/auth/register/route";
import { POST as resetPassword } from "@/app/api/auth/reset-password/route";
import { POST as resendVerification } from "@/app/api/auth/resend-verification/route";
import bcrypt from "bcryptjs";

jest.mock("@/lib/users-db", () => ({
  __esModule: true,
  usersDb: {
    get: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    getByResetToken: jest.fn(),
  },
}));

jest.mock("@/lib/email", () => ({
  __esModule: true,
  sendVerificationEmail: jest.fn(),
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  __esModule: true,
  logAudit: jest.fn(),
}));

jest.mock("bcryptjs", () => ({
  __esModule: true,
  default: {
    hash: jest.fn(),
  },
}));

const mockUsersDb = usersDb as jest.Mocked<typeof usersDb>;
const mockSendVerificationEmail = sendVerificationEmail as jest.MockedFunction<typeof sendVerificationEmail>;
const mockBcrypt = bcrypt as jest.Mocked<typeof bcrypt>;

function jsonRequest(pathname: string, body: unknown) {
  return new Request(`https://eterapy.com${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

describe("B052 auth states", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns a duplicate email code so UI can offer login/reset", async () => {
    mockUsersDb.get.mockResolvedValueOnce({ id: "user-1", email: "used@example.com" } as never);

    const response = await register(jsonRequest("/api/auth/register", {
      name: "Мария",
      email: "used@example.com",
      password: "password123",
    }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.code).toBe("DUPLICATE_EMAIL");
  });

  it("requires 8 character passwords during reset", async () => {
    const response = await resetPassword(jsonRequest("/api/auth/reset-password", {
      token: "reset-token",
      password: "short",
    }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toContain("8");
  });

  it("hashes reset passwords before storing them", async () => {
    mockUsersDb.getByResetToken.mockResolvedValueOnce({
      email: "user@example.com",
      resetExpires: new Date(Date.now() + 60_000),
    } as never);
    mockBcrypt.hash.mockResolvedValueOnce("hashed-password" as never);

    const response = await resetPassword(jsonRequest("/api/auth/reset-password", {
      token: "reset-token",
      password: "password123",
    }));

    expect(response.status).toBe(200);
    expect(mockBcrypt.hash).toHaveBeenCalledWith("password123", 10);
    expect(mockUsersDb.update).toHaveBeenCalledWith("user@example.com", expect.objectContaining({
      password: "hashed-password",
      resetToken: null,
      resetExpires: null,
    }));
  });

  it("does not disclose already verified email state from resend endpoint", async () => {
    mockUsersDb.get.mockResolvedValueOnce({
      email: "verified@example.com",
      emailVerified: true,
    } as never);

    const response = await resendVerification(jsonRequest("/api/auth/resend-verification", {
      email: "verified@example.com",
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({ ok: true });
    expect(mockSendVerificationEmail).not.toHaveBeenCalled();
  });

  it("renders duplicate email recovery actions in register UI", () => {
    const registerSource = fs.readFileSync(path.join(process.cwd(), "src/app/(auth)/register/page.tsx"), "utf8");

    expect(registerSource).toContain("duplicate-email-state");
    expect(registerSource).toContain("DUPLICATE_EMAIL");
    expect(registerSource).toContain("/auth/forgot-password?email=");
  });
});
