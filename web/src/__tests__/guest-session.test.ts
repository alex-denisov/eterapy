import type { NextRequest } from "next/server";
import {
  createGuestSessionCookieValue,
  GUEST_SESSION_COOKIE,
  readGuestSessionIdFromCookieValue,
} from "@/lib/guest-session";
import { GET as getGuestSession } from "@/app/api/guest/session/route";

function request(path: string, init: RequestInit = {}) {
  return new Request(`https://eterapy.com${path}`, init) as NextRequest;
}

describe("guest session identity", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("creates and validates a signed guest cookie value", () => {
    const value = createGuestSessionCookieValue("gst_00000000-0000-4000-8000-000000000000");

    expect(readGuestSessionIdFromCookieValue(value)).toBe("gst_00000000-0000-4000-8000-000000000000");
    expect(readGuestSessionIdFromCookieValue(value.replace("gst_", "bad_"))).toBeNull();
    expect(readGuestSessionIdFromCookieValue(`${value}tampered`)).toBeNull();
  });

  it("exposes an endpoint that creates the anonymous identity cookie", async () => {
    const response = await getGuestSession(request("/api/guest/session"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.guestSessionId).toBeUndefined();
    expect(body.created).toBe(true);
    expect(response.headers.get("set-cookie")).toContain(GUEST_SESSION_COOKIE);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  });

  it("creates anonymous identity for the v5 dialogue flow", async () => {
    const response = await getGuestSession(request("/api/guest/session"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.created).toBe(true);
    expect(response.headers.get("set-cookie")).toContain(GUEST_SESSION_COOKIE);
  });

  it("reuses an existing valid guest cookie instead of rotating identity", async () => {
    const cookieValue = createGuestSessionCookieValue("gst_11111111-1111-4111-8111-111111111111");
    const response = await getGuestSession(request("/api/guest/session", {
      headers: {
        cookie: `${GUEST_SESSION_COOKIE}=${encodeURIComponent(cookieValue)}`,
      },
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.created).toBe(false);
    expect(response.headers.get("set-cookie")).toBeNull();
  });
});
