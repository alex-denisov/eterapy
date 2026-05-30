import fs from "node:fs";
import path from "node:path";

const table = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/clients/clients-table.tsx"),
  "utf8",
);

describe("D1 — admin clients table: pagination + unified filters", () => {
  it("adds 25-per-page pagination over the filtered users", () => {
    expect(table).toContain("const PAGE_SIZE = 25");
    expect(table).toContain("const paged = filtered.slice");
    expect(table).toContain("{paged.map(u =>");
    expect(table).toContain("pageCount");
  });

  it("uses the shared seg button for the status filter", () => {
    expect(table).toContain("soft-admin-seg-btn");
    expect(table).toContain("data-active={filterStatus === f}");
    expect(table).not.toContain("border-primary bg-primary/10 text-primary");
  });
});
