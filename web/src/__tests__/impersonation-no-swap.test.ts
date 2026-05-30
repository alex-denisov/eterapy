import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B1 — no-swap impersonation keeps the superadmin session intact", () => {
  it("uses a separate impersonation cookie, not the session cookie", () => {
    const lib = source("src/lib/impersonation.ts");
    expect(lib).toContain('IMPERSONATION_COOKIE = "eterapy-imp"');
    expect(lib).toContain("export async function readImpersonation");
    expect(lib).toContain("export function setImpersonationCookie");
    expect(lib).toContain("export function clearImpersonationCookie");
  });

  it("wraps auth() so impersonation never applies on the admin host", () => {
    const auth = source("src/lib/auth.ts");
    expect(auth).toContain("auth: rawAuth");
    expect(auth).toContain("export async function auth()");
    expect(auth).toContain('host.startsWith("admin.")');
    expect(auth).toContain("readImpersonation");
    // only an admin/superadmin that issued the cookie is honored
    expect(auth).toContain("session.user.id !== imp.impersonatorId");
  });

  it("the token route sets the imp cookie and never overwrites the session cookie", () => {
    const route = source("src/app/api/admin/impersonate/[token]/route.ts");
    expect(route).toContain("setImpersonationCookie");
    expect(route).not.toContain("SESSION_COOKIE_NAME");
    // cannot impersonate a superadmin / blocked user
    expect(route).toContain('target.role === "SUPERADMIN"');
  });

  it("stop-impersonate clears the imp cookie and never force-clears a live session", () => {
    const route = source("src/app/api/admin/stop-impersonate/route.ts");
    expect(route).toContain("clearImpersonationCookie");
    // the old code set SESSION_COOKIE_NAME to "" when no backup — that logged
    // real superadmins out; must not happen anymore
    expect(route).not.toContain('response.cookies.set(SESSION_COOKIE_NAME, "", expiredCookieOpts)');
  });
});
