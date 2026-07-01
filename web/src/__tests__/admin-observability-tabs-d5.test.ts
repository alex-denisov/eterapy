import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("D5 — unify superadmin segmented-tab buttons (readable colors)", () => {
  it("logs observability tabs use the shared compact action buttons", () => {
    const viewer = source("src/app/admin/logs/logs-viewer.tsx");
    expect(viewer).toContain('data-testid="admin-observability-tabs"');
    expect(viewer).toContain('className="soft-admin-action"');
    expect(viewer).toContain('data-variant={active ? "primary" : "subtle"}');
    // the old white-on-bordeaux inline variant is gone
    expect(viewer).not.toContain("bg-[var(--soft-bordeaux)] text-white shadow-sm");
  });

  it("bookings management uses the shared compact admin table controls", () => {
    const page = source("src/app/admin/bookings/bookings-manager.tsx");
    expect(page).toContain('data-testid="admin-bookings-table"');
    expect(page).toContain("CompactTableShell");
    expect(page).toContain("CompactHeader");
    expect(page).toContain("CompactPaginationBar");
    expect(page).toContain("COMPACT_SELECT_CLASS");
    expect(page).toContain("toggleSort");
    expect(page).not.toContain("bg-brand-soft-gold/15 text-brand-soft-gold");
  });

  it("the shared compact action class defines a readable primary state in the stylesheet", () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain('.soft-admin-action[data-variant="primary"]');
    expect(css).toContain("background: var(--soft-bordeaux)");
    expect(css).toContain("color: #fff8f1");
  });
});
