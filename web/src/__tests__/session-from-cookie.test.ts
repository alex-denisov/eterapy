/**
 * @jest-environment node
 *
 * Reproduces the prod bug where the proxy split a NextAuth v5 JWE cookie
 * on "." and read the (empty) second segment, so role was always null.
 * The fix decrypts the JWE with AUTH_SECRET using salt = cookie name.
 */
import { encode } from "next-auth/jwt";
import { getSessionFromCookie } from "../lib/session-from-cookie";

const SECRET = "test-secret-abcdefghijklmnopqrstuvwxyz-012345";
const COOKIE_NAME = "__Secure-authjs.session-token";

function makeRequest(cookies: Record<string, string>) {
  return {
    cookies: {
      get: (name: string) =>
        cookies[name] !== undefined ? { name, value: cookies[name] } : undefined,
    },
  } as unknown as import("next/server").NextRequest;
}

describe("getSessionFromCookie", () => {
  const origSecret = process.env.AUTH_SECRET;

  beforeAll(() => {
    process.env.AUTH_SECRET = SECRET;
  });

  afterAll(() => {
    if (origSecret === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = origSecret;
  });

  it("returns {null,null} when no session cookie is present", async () => {
    const req = makeRequest({});
    expect(await getSessionFromCookie(req)).toEqual({ role: null, id: null });
  });

  it("decrypts a valid JWE cookie and exposes role + id", async () => {
    const token = await encode({
      token: { id: "user-123", role: "CLIENT", email: "a@b.c" },
      secret: SECRET,
      salt: COOKIE_NAME,
      maxAge: 60 * 60,
    });
    // Sanity: JWE has 5 segments and segment[1] is empty (the pre-fix bug would
    // try to read segment[1] as payload).
    const parts = token.split(".");
    expect(parts.length).toBe(5);
    expect(parts[1]).toBe("");

    const req = makeRequest({ [COOKIE_NAME]: token });
    expect(await getSessionFromCookie(req)).toEqual({
      role: "CLIENT",
      id: "user-123",
    });
  });

  it("returns nulls on a tampered/unsignable cookie", async () => {
    const req = makeRequest({ [COOKIE_NAME]: "not-a-real-token" });
    expect(await getSessionFromCookie(req)).toEqual({ role: null, id: null });
  });

  it("decrypts PRACTITIONER role the same way", async () => {
    const token = await encode({
      token: { id: "p1", role: "PRACTITIONER" },
      secret: SECRET,
      salt: COOKIE_NAME,
      maxAge: 60 * 60,
    });
    const req = makeRequest({ [COOKIE_NAME]: token });
    expect(await getSessionFromCookie(req)).toEqual({
      role: "PRACTITIONER",
      id: "p1",
    });
  });
});
