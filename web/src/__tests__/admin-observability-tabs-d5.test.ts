import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("D5 — unify superadmin segmented-tab buttons (readable colors)", () => {
  it("logs observability tabs use the shared soft-admin-seg-btn class", () => {
    const viewer = source("src/app/admin/logs/logs-viewer.tsx");
    expect(viewer).toContain('data-testid="admin-observability-tabs"');
    expect(viewer).toContain('className="soft-admin-seg-btn"');
    expect(viewer).toContain("data-active={active}");
    // the old white-on-bordeaux inline variant is gone
    expect(viewer).not.toContain("bg-[var(--soft-bordeaux)] text-white shadow-sm");
  });

  it("bookings status filter shares the same segmented-button style", () => {
    const page = source("src/app/admin/bookings/bookings-manager.tsx");
    expect(page).toContain('className="soft-admin-seg-btn"');
    expect(page).toContain("data-active={sort === k}");
    expect(page).not.toContain("bg-brand-soft-gold/15 text-brand-soft-gold");
  });

  it("the shared class defines a readable active state in the stylesheet", () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain('.soft-admin-seg-btn[data-active="true"]');
    expect(css).toContain("background: var(--soft-bordeaux)");
    expect(css).toContain("color: #fff8f1");
  });
});
