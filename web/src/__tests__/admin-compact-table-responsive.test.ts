import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "src/components/admin/compact-client-table.tsx"), "utf8");

describe("admin compact table responsive behavior", () => {
  it("does not reserve an empty toolbar gap between headings and tables", () => {
    expect(source).not.toContain('className="flex min-h-8 flex-wrap items-center justify-between gap-2"');
    expect(source).toContain("selectedIds.size > 0");
    expect(source).toContain("admin-compact-bulk-actions");
  });

  it("renders a mobile card surface from the same rows, columns, and icon-only actions", () => {
    expect(source).toContain('data-testid="admin-compact-mobile-cards"');
    expect(source).toContain("md:hidden");
    expect(source).toContain("admin-compact-mobile-card");
    expect(source).toContain("CompactMobileCard");
    expect(source).toContain("soft-admin-table-actions");
  });
});
