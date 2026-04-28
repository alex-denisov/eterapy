import crypto from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

export const GUEST_SESSION_COOKIE = "eterapy_guest_session";
export const GUEST_SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;

const GUEST_ID_PATTERN = /^gst_[0-9a-f-]{36}$/;

function guestSecret() {
  const configuredSecret = process.env.AUTH_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (configuredSecret) return configuredSecret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("Guest session secret is not configured");
  }
  return "development-guest-session-secret";
}

function signGuestId(id: string) {
  return crypto
    .createHmac("sha256", guestSecret())
    .update(id)
    .digest("base64url");
}

export function createGuestSessionId() {
  return `gst_${crypto.randomUUID()}`;
}

export function createGuestSessionCookieValue(id = createGuestSessionId()) {
  return `${id}.${signGuestId(id)}`;
}

export function readGuestSessionIdFromCookieValue(value: string | undefined | null) {
  if (!value) return null;
  const [id, signature] = value.split(".");
  if (!id || !signature || !GUEST_ID_PATTERN.test(id)) return null;

  const expected = signGuestId(id);
  const expectedBytes = Buffer.from(expected);
  const actualBytes = Buffer.from(signature);
  if (expectedBytes.length !== actualBytes.length) return null;
  return crypto.timingSafeEqual(expectedBytes, actualBytes) ? id : null;
}

function readCookieHeader(request: NextRequest, name: string) {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (rawName === name) {
      try {
        return decodeURIComponent(rawValue.join("="));
      } catch {
        return undefined;
      }
    }
  }

  return undefined;
}

export function readGuestSessionId(request: NextRequest) {
  const value = request.cookies?.get(GUEST_SESSION_COOKIE)?.value ?? readCookieHeader(request, GUEST_SESSION_COOKIE);
  return readGuestSessionIdFromCookieValue(value);
}

export function ensureGuestSession(request: NextRequest, response: NextResponse) {
  const existingId = readGuestSessionId(request);
  if (existingId) return { id: existingId, created: false };

  const id = createGuestSessionId();
  response.cookies.set(GUEST_SESSION_COOKIE, createGuestSessionCookieValue(id), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: GUEST_SESSION_MAX_AGE_SECONDS,
  });

  return { id, created: true };
}
