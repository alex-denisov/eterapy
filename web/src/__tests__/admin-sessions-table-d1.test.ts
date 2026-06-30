import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("D1 — admin sessions table uses the minimalist standard", () => {
  it("renders the shared compact admin table with controls and pagination", () => {
    const table = source("src/app/admin/sessions/sessions-table.tsx");
    expect(table).toContain('data-testid="admin-sessions-table"');
    expect(table).toContain("CompactTableShell");
    expect(table).toContain("CompactHeader");
    expect(table).toContain("CompactPaginationBar");
    // status segmented filter + search above the table
    expect(table).toContain("soft-admin-seg-btn");
    expect(table).toContain('type="search"');
    // sortable columns
    expect(table).toContain("dateSort");
    expect(table).toContain("durationSort");
    // compact admin pagination
    expect(table).toContain("PAGE_SIZE = 20");
    expect(table).toContain("pageCount");
  });

  it("renders bookings and reschedules as the same compact searchable table", () => {
    const bookings = source("src/app/admin/bookings/bookings-manager.tsx");

    expect(bookings).toContain('data-testid="admin-bookings-table"');
    expect(bookings).toContain("CompactTableShell");
    expect(bookings).toContain("CompactHeader");
    expect(bookings).toContain("CompactPaginationBar");
    expect(bookings).toContain('type="search"');
    expect(bookings).toContain("RescheduleControls");
    expect(bookings).toContain("PAGE_SIZE = 20");
    expect(bookings).not.toContain('className="rounded-xl border border-border/20 bg-card/20 overflow-hidden"');
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
