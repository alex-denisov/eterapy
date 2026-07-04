import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("D5 — unify superadmin segmented-tab buttons (readable colors)", () => {
  it("logs center facets use the shared compact action buttons", () => {
    const viewer = source("src/app/admin/logs/logs-viewer.tsx");
    expect(viewer).toContain('data-testid="admin-log-source-family-filter"');
    expect(viewer).toContain('className="soft-admin-action"');
    expect(viewer).toContain('data-variant={sourceFamily === facet.key ? "primary" : "subtle"}');
    // the old white-on-bordeaux inline variant is gone
    expect(viewer).not.toContain("bg-[var(--soft-bordeaux)] text-white shadow-sm");
  });

  it("bookings management uses the shared compact admin table controls", () => {
    const page = source("src/app/admin/bookings/bookings-manager.tsx");
    const compact = source("src/components/admin/compact-client-table.tsx");
    expect(page).toContain('data-testid="admin-bookings-table"');
    expect(page).toContain("AdminCompactDataTable");
    expect(page).toContain("bookingColumns");
    expect(page).toContain('filterKind: "select"');
    expect(page).toContain("RescheduleControls");
    expect(compact).toContain("CompactTableShell");
    expect(compact).toContain("CompactPaginationBar");
    expect(page).not.toContain("bg-brand-soft-gold/15 text-brand-soft-gold");
  });

  it("the shared compact action class defines a readable primary state in the stylesheet", () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain('.soft-admin-action[data-variant="primary"]');
    expect(css).toContain("background: var(--soft-terracotta)");
    expect(css).toContain("color: #fff8f1");
  });
});
