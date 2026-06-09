import fs from "node:fs";
import path from "node:path";

// B359 / Баг 2 — a just-registered user must show a «последняя сессия» in the
// admin panel. Registration already captures IP/device (REGISTER audit); the
// last-session lookup must consider REGISTER, not just LOGIN.

const root = process.cwd();
const source = (rel: string) => fs.readFileSync(path.join(root, rel), "utf8");

describe("last-session at registration", () => {
  it("registration captures IP + device into the audit log", () => {
    const register = source("src/app/api/auth/register/route.ts");
    expect(register).toMatch(/logAudit\([^)]*"REGISTER"/);
    expect(register).toContain("device");
    expect(register).toMatch(/meta\.ip/);
  });

  it("admin last-session lookup includes REGISTER alongside LOGIN", () => {
    const page = source("src/app/admin/users/page.tsx");
    expect(page).toMatch(/action:\s*\{\s*in:\s*\[\s*"LOGIN",\s*"REGISTER"\s*\]\s*\}/);
  });

  it("the admin user modal renders last session + IP + device", () => {
    const modal = source("src/app/admin/users/user-edit-modal.tsx");
    expect(modal).toContain("Последняя сессия");
    expect(modal).toContain("IP последнего входа");
    expect(modal).toMatch(/lastLogin\?\.device/);
  });
});
