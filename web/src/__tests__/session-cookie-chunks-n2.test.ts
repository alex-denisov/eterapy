import { readSessionCookieValue } from "@/lib/session-from-cookie";

type FakeCookie = { name: string; value: string };

function fakeCookies(list: FakeCookie[]) {
  return {
    get: (name: string) => list.find((c) => c.name === name),
    getAll: () => list,
  } as unknown as Parameters<typeof readSessionCookieValue>[0];
}

const NAME = "__Secure-authjs.session-token";

describe("N2 — chunked Auth.js session cookie reassembly", () => {
  it("returns the plain cookie when present", () => {
    const cookies = fakeCookies([{ name: NAME, value: "whole-token" }]);
    expect(readSessionCookieValue(cookies, NAME)).toBe("whole-token");
  });

  it("reassembles chunked cookies in numeric order", () => {
    // Auth.js splits big JWTs into name.0, name.1, … — out of order on purpose here.
    const cookies = fakeCookies([
      { name: `${NAME}.1`, value: "BBB" },
      { name: `${NAME}.0`, value: "AAA" },
      { name: `${NAME}.2`, value: "CCC" },
      { name: "unrelated", value: "x" },
    ]);
    expect(readSessionCookieValue(cookies, NAME)).toBe("AAABBBCCC");
  });

  it("prefers the plain cookie over chunks if both somehow exist", () => {
    const cookies = fakeCookies([
      { name: NAME, value: "plain" },
      { name: `${NAME}.0`, value: "chunk0" },
    ]);
    expect(readSessionCookieValue(cookies, NAME)).toBe("plain");
  });

  it("returns null when neither plain nor chunks are present", () => {
    const cookies = fakeCookies([{ name: "something-else", value: "y" }]);
    expect(readSessionCookieValue(cookies, NAME)).toBeNull();
  });
});
