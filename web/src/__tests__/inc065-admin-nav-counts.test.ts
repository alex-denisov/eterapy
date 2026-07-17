import fs from "node:fs";
import path from "node:path";

function source(rel: string) {
  return fs.readFileSync(path.join(process.cwd(), rel), "utf8");
}

// INC-065 round 2: the admin sidebar badges were an SSR-only snapshot — a
// superadmin cancelling a booking (or resolving a complaint) saw stale
// numbers until a full reload. The badges must live-refresh: in-tab event
// after every counted mutation, focus/visibility re-sync and a backstop poll.
describe("INC-065 admin sidebar counters live refresh", () => {
  it("shares one counts query between the layout SSR snapshot and the live API", () => {
    const lib = source("src/lib/admin-nav-counts.ts");
    expect(lib).toContain("export async function getAdminNavCounts");
    expect(lib).toContain('db.booking.count({ where: { status: "PENDING" } })');
    expect(lib).toContain('permissions.includes("support.manage")');

    const layout = source("src/app/admin/layout.tsx");
    expect(layout).toContain("getAdminNavCounts(permissions)");
    expect(layout).not.toContain("db.booking.count");

    const route = source("src/app/api/admin/nav-counts/route.ts");
    expect(route).toContain('["ADMIN", "SUPERADMIN"].includes(role)');
    expect(route).toContain("getAdminNavCounts(permissions)");
    expect(route).toContain('"Cache-Control": "no-store"');
  });

  it("keeps the shell counts live via event + focus + visibility + poll", () => {
    const hook = source("src/app/admin/use-admin-nav-counts.ts");
    expect(hook).toContain("/api/admin/nav-counts");
    expect(hook).toContain("ADMIN_COUNTS_CHANGED_EVENT");
    expect(hook).toContain('window.addEventListener("focus"');
    expect(hook).toContain('document.addEventListener("visibilitychange"');
    expect(hook).toContain("window.setInterval(refresh, COUNTS_POLL_MS)");

    const shell = source("src/app/admin/admin-shell.tsx");
    expect(shell).toContain("useAdminNavCounts(initialCounts)");
  });

  it("every counted moderator mutation notifies the sidebar", () => {
    const managers = [
      "src/app/admin/bookings/bookings-manager.tsx",
      "src/app/admin/applications/applications-manager.tsx",
      "src/app/admin/complaints/complaints-manager.tsx",
      "src/app/admin/reviews/reviews-manager.tsx",
      "src/app/admin/product/quality/library-requests-manager.tsx",
      "src/app/admin/support/support-console.tsx",
    ];
    for (const manager of managers) {
      expect(source(manager)).toContain("dispatchAdminCountsChanged()");
    }
  });
});
