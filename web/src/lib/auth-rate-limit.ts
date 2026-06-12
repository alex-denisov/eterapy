import crypto from "node:crypto";
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

type Bucket = {
  count: number;
  resetAt: number;
};

const buckets = new Map<string, Bucket>();

export type AuthRateLimitResult =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

function nowMs() {
  return Date.now();
}

function hashKey(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 24);
}

export function authRateLimitKeyFromRequest(request: NextRequest, scope: string) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwardedFor || request.headers.get("x-real-ip") || "unknown";
  return `auth:${scope}:ip:${hashKey(ip)}`;
}

export function authRateLimitKey(scope: string, value: string) {
  return `auth:${scope}:${hashKey(value.toLowerCase())}`;
}

// `cost` lets a single request consume more than one unit of the budget, so
// endpoints that fan out into N expensive downstream calls (e.g. batch OCR over
// up to 10 screenshots) are bounded by real work, not request count. Defaults to
// 1 so every existing caller keeps its current behaviour.
export function checkAuthRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  cost = 1
): AuthRateLimitResult {
  const now = nowMs();
  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: cost, resetAt: now + windowMs });
    return { allowed: true };
  }

  if (existing.count + cost > limit) {
    return {
      allowed: false,
      retryAfterSeconds: Math.max(1, Math.ceil((existing.resetAt - now) / 1000)),
    };
  }

  existing.count += cost;
  return { allowed: true };
}

export function checkRequestAuthRateLimit(
  request: NextRequest,
  scope: string,
  limit: number,
  windowMs: number,
  cost = 1
) {
  return checkAuthRateLimit(authRateLimitKeyFromRequest(request, scope), limit, windowMs, cost);
}

export function authRateLimitResponse(result: Extract<AuthRateLimitResult, { allowed: false }>) {
  return NextResponse.json(
    { error: "Слишком много попыток. Попробуйте позже.", code: "RATE_LIMITED" },
    {
      status: 429,
      headers: {
        "Retry-After": String(result.retryAfterSeconds),
      },
    }
  );
}

export function resetAuthRateLimitForTests() {
  buckets.clear();
}
