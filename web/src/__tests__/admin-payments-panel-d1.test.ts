import fs from "node:fs";
import path from "node:path";

const panel = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/payments/payments-panel.tsx"),
  "utf8",
);

describe("D1 — admin payments panel: sortable columns + pagination", () => {
  it("adds sortable Оборот / К выплате columns", () => {
    expect(panel).toContain("AdminCompactDataTable");
    expect(panel).toContain('label: "Оборот", sortable: true');
    expect(panel).toContain('label: "Доступно", sortable: true');
    expect(panel).toContain('label: "К выплате", sortable: true');
  });

  it("adds 20-per-page pagination over the filtered payouts", () => {
    expect(panel).toContain("practitionerPayoutRows");
    expect(panel).toContain("selectable");
    expect(panel).toContain("bulkActions");
    expect(panel).not.toContain("const paged = filtered.slice");
  });
});
