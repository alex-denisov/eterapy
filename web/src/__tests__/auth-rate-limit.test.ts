import type { NextRequest } from "next/server";
import {
  authRateLimitKey,
  authRateLimitKeyFromRequest,
  checkAuthRateLimit,
  checkRequestAuthRateLimit,
  resetAuthRateLimitForTests,
} from "@/lib/auth-rate-limit";
import { usersDb } from "@/lib/users-db";
import { POST as forgotPassword } from "@/app/api/auth/forgot-password/route";

jest.mock("@/lib/users-db", () => ({
  __esModule: true,
  usersDb: {
    get: jest.fn(),
    setResetToken: jest.fn(),
  },
}));

jest.mock("@/lib/email", () => ({
  __esModule: true,
  sendPasswordResetEmail: jest.fn(),
}));

jest.mock("@/lib/audit", () => ({
  __esModule: true,
  logAudit: jest.fn(),
}));

const mockUsersDb = usersDb as jest.Mocked<typeof usersDb>;

function request(pathname: string, init: RequestInit = {}) {
  return new Request(`https://eterapy.com${pathname}`, {
    ...init,
    headers: {
      "x-forwarded-for": "203.0.113.10",
      ...(init.headers ?? {}),
    },
  }) as NextRequest;
}

describe("B054 auth rate limits", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetAuthRateLimitForTests();
  });

  it("builds stable hashed keys without storing raw identifiers", () => {
    const key = authRateLimitKey("login:email", "User@Example.com");

    expect(key).toMatch(/^auth:login:email:[a-f0-9]{24}$/);
    expect(key).not.toContain("User@Example.com");
    expect(authRateLimitKey("login:email", "user@example.com")).toBe(key);
  });

  it("limits repeated attempts in a fixed window", () => {
    const key = "auth:test";

    expect(checkAuthRateLimit(key, 2, 60_000)).toEqual({ allowed: true });
    expect(checkAuthRateLimit(key, 2, 60_000)).toEqual({ allowed: true });
    expect(checkAuthRateLimit(key, 2, 60_000)).toEqual(expect.objectContaining({ allowed: false }));
  });

  it("derives request keys from forwarded IP", () => {
    const req = request("/api/auth/forgot-password");

    expect(authRateLimitKeyFromRequest(req, "forgot-password")).toMatch(/^auth:forgot-password:ip:[a-f0-9]{24}$/);
    expect(checkRequestAuthRateLimit(req, "forgot-password", 1, 60_000)).toEqual({ allowed: true });
    expect(checkRequestAuthRateLimit(req, "forgot-password", 1, 60_000)).toEqual(expect.objectContaining({ allowed: false }));
  });

  it("returns 429 with Retry-After for auth endpoints when limited", async () => {
    mockUsersDb.get.mockResolvedValue(null);

    for (let i = 0; i < 10; i += 1) {
      await forgotPassword(request("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.25" },
        body: JSON.stringify({ email: `user${i}@example.com` }),
      }));
    }

    const response = await forgotPassword(request("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-forwarded-for": "198.51.100.25" },
      body: JSON.stringify({ email: "last@example.com" }),
    }));
    const body = await response.json();

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toMatch(/^\d+$/);
    expect(body).toEqual({ error: "Слишком много попыток. Попробуйте позже.", code: "RATE_LIMITED" });
  });
});
