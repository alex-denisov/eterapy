import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("D1 — admin sessions table uses the minimalist standard", () => {
  it("renders the shared compact admin table with controls and pagination", () => {
    const table = source("src/app/admin/sessions/sessions-table.tsx");
    const compact = source("src/components/admin/compact-client-table.tsx");
    expect(table).toContain('data-testid="admin-sessions-table"');
    expect(table).toContain("AdminCompactDataTable");
    expect(table).toContain("sessionColumns");
    expect(table).toContain('filterKind: "select"');
    expect(table).toContain('filterKind: "date"');
    expect(compact).toContain("CompactTableShell");
    expect(compact).toContain("CompactHeader");
    expect(compact).toContain("CompactPaginationBar");
    expect(compact).toContain("pageSize = 20");
  });

  it("renders bookings and reschedules as the same compact searchable table", () => {
    const bookings = source("src/app/admin/bookings/bookings-manager.tsx");

    expect(bookings).toContain('data-testid="admin-bookings-table"');
    expect(bookings).toContain("AdminCompactDataTable");
    expect(bookings).toContain("bookingColumns");
    expect(bookings).toContain('filterKind: "select"');
    expect(bookings).toContain('filterKind: "date"');
    expect(bookings).toContain("RescheduleControls");
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
