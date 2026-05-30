import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("D1 — admin files table uses the minimalist standard", () => {
  it("renders the shared soft-admin-data-table with filter/search/sort/pagination", () => {
    const table = source("src/app/admin/files/files-table.tsx");
    expect(table).toContain('data-testid="admin-files-table"');
    expect(table).toContain("soft-admin-data-table");
    expect(table).toContain("soft-admin-seg-btn");
    expect(table).toContain('type="search"');
    expect(table).toContain("size-desc");
    expect(table).toContain("PAGE_SIZE = 25");
  });

  it("page serializes rows and delegates to the client table", () => {
    const page = source("src/app/admin/files/page.tsx");
    expect(page).toContain("FilesTable");
    expect(page).toContain("StoredFileRow");
    expect(page).not.toContain('rounded-xl border border-border/30 overflow-hidden');
  });
});
