import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("D1 — admin files table uses the minimalist standard", () => {
  it("renders the shared compact admin table with filter/sort/pagination", () => {
    const table = source("src/app/admin/files/files-table.tsx");
    expect(table).toContain('data-testid="admin-files-table"');
    expect(table).toContain("AdminCompactDataTable");
    expect(table).toContain("AdminCompactColumn");
    expect(table).toContain('filterKind: "select"');
    expect(table).toContain('filterKind: "date"');
    expect(table).not.toContain("CompactTableShell");
    expect(table).not.toContain("COMPACT_INPUT_CLASS");
  });

  it("page serializes rows and delegates to the client table", () => {
    const page = source("src/app/admin/files/admin-files-page.tsx");
    expect(page).toContain("FilesTable");
    expect(page).toContain("StoredFileRow");
    expect(page).not.toContain('rounded-xl border border-border/30 overflow-hidden');
  });
});
