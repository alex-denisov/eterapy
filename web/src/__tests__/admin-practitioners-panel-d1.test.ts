import fs from "node:fs";
import path from "node:path";

const panel = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/practitioners/practitioners-panel.tsx"),
  "utf8",
);

describe("D1 — admin practitioners panel: pagination + unified filter buttons", () => {
  it("adds 25-per-page pagination over the filtered list", () => {
    expect(panel).toContain("const PAGE_SIZE = 25");
    expect(panel).toContain("const paged = filtered.slice");
    expect(panel).toContain("pageCount");
    expect(panel).toContain("{paged.map(p =>");
  });

  it("replaces the low-contrast status toggles with the shared seg button", () => {
    expect(panel).toContain("soft-admin-seg-btn");
    expect(panel).not.toContain("bg-primary/15 text-primary");
    expect(panel).toContain("data-active={filterStatus === s}");
  });
});
