import fs from "node:fs";
import path from "node:path";

const panel = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/payments/payments-panel.tsx"),
  "utf8",
);

describe("D1 — admin payments panel: sortable columns + pagination", () => {
  it("adds sortable Оборот / К выплате columns", () => {
    expect(panel).toContain("function toggleSort");
    expect(panel).toContain('toggleSort("revenue")');
    expect(panel).toContain('toggleSort("earnings")');
  });

  it("adds 25-per-page pagination over the filtered payouts", () => {
    expect(panel).toContain("const PAGE_SIZE = 25");
    expect(panel).toContain("const paged = filtered.slice");
    expect(panel).toContain("{paged.map(p =>");
    expect(panel).toContain("pageCount");
  });
});
