import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("D1 — admin sessions table uses the minimalist standard", () => {
  it("renders the shared soft-admin-data-table with controls and pagination", () => {
    const table = source("src/app/admin/sessions/sessions-table.tsx");
    expect(table).toContain('data-testid="admin-sessions-table"');
    expect(table).toContain("soft-admin-data-table");
    // status segmented filter + search above the table
    expect(table).toContain("soft-admin-seg-btn");
    expect(table).toContain('type="search"');
    // sortable columns
    expect(table).toContain("dateSort");
    expect(table).toContain("durationSort");
    // 25-per-page pagination
    expect(table).toContain("PAGE_SIZE = 25");
    expect(table).toContain("pageCount");
  });

  it("page serializes rows and delegates to the client table", () => {
    const page = source("src/app/admin/product/sessions/page.tsx");
    expect(page).toContain("SessionsTable");
    expect(page).toContain("VideoSessionRow");
    expect(page).toContain("db.videoSession.findMany");
    // the old raw muted-border table markup is gone
    expect(page).not.toContain('border border-border/30 overflow-hidden');
  });
});
