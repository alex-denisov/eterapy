import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("U3 — proxy respects impersonation on the app host", () => {
  it("the proxy decodes the impersonation cookie and routes by the target role", () => {
    const proxy = source("src/proxy.ts");
    expect(proxy).toContain("getImpersonationFromRequest");
    expect(proxy).toContain("const appRole = impersonating");
    // the staff-bounce check now uses the impersonation-aware role
    expect(proxy).toContain("if (isAdminRole(appRole))");
    expect(proxy).toContain("if (!appRole)");
  });

  it("the impersonation token carries the target role + an edge-safe reader", () => {
    const lib = source("src/lib/impersonation.ts");
    expect(lib).toContain("targetRole");
    expect(lib).toContain("export async function getImpersonationFromRequest");
    const route = source("src/app/api/admin/impersonate/[token]/route.ts");
    expect(route).toContain("targetRole: target.role");
  });
});
