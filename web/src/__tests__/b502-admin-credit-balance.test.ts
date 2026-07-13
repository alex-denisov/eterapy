import fs from "node:fs";
import path from "node:path";
import { buildOpenClarityCreditLots } from "@/lib/clarity-credits";

describe("B502 admin clarity-credit target balance", () => {
  it("excludes expired grants from the balance used by the admin UI", () => {
    const now = new Date("2026-07-10T12:00:00.000Z");
    const lots = buildOpenClarityCreditLots([
      { amount: 5, source: "welcome", type: "grant", status: "confirmed", expiresAt: new Date("2026-07-09T12:00:00.000Z") },
      { amount: 7000, source: "admin", type: "adjustment", status: "confirmed", expiresAt: null },
    ], now);

    expect(lots.reduce((sum, lot) => sum + lot.amount, 0)).toBe(7000);
  });

  it("uses the shared open-lot balance in the users table and exact filter", () => {
    const source = fs.readFileSync(path.join(process.cwd(), "src/app/admin/users/admin-users-page.tsx"), "utf8");
    expect(source).toContain("getClarityCreditBalances");
    expect(source).not.toContain("clarityCreditLedgerEntry.groupBy");
  });
});
