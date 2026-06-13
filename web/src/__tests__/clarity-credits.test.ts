import fs from "node:fs";
import path from "node:path";
import { creditExpiryFor } from "@/lib/credit-expiry";
import { getProductCreditCost } from "@/lib/entitlements";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("M21 clarity credits", () => {
  it("adds a separate non-cash ledger with anti-fraud fields", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260512180000_add_clarity_credit_ledger/migration.sql");

    expect(schema).toContain("model ClarityCreditLedgerEntry");
    expect(schema).toContain("sourceEventId");
    expect(schema).toContain("status");
    expect(schema).toContain("expiresAt");
    expect(migration).toContain("clarity_credit_ledger_entries");
    expect(migration).toContain("ON DELETE CASCADE");
  });

  it("keeps product credit costs server-side", () => {
    // B366: consistent ~297 ₽/балл ladder.
    expect(getProductCreditCost("perspectives")).toBe(1);
    expect(getProductCreditCost("deep-report")).toBe(3);
    expect(getProductCreditCost("chat-analysis")).toBe(2);
    expect(getProductCreditCost("compatibility")).toBe(3);
    expect(getProductCreditCost("tarot")).toBe(2);
  });

  it("gates credit spending through an authenticated entitlement API", () => {
    const route = source("src/app/api/billing/spend-credits/route.ts");

    expect(route).toContain("await auth()");
    expect(route).toContain("getSpendableClarityCreditBalance");
    expect(route).toContain("recordClarityCreditEntry");
    expect(route).toContain('productKey === "full-question" ? "bundle" : "credits"');
    expect(route).toContain("INSUFFICIENT_CREDITS");
  });

  it("marks referral rewards as pending credits instead of instant cash", () => {
    const share = source("src/lib/share-referral.ts");

    expect(share).toContain("REWARD_PENDING");
    expect(share).toContain('status: "pending"');
    expect(share).toContain('source: "referral"');
    expect(share).toContain("meaningful_action_pending_review");
  });
});

describe("Y10 Z4 credit expiry windows", () => {
  const now = new Date("2026-06-05T09:00:00.000Z");

  function daysFromNow(date: Date | null) {
    if (!date) return null;
    return Math.round((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  }

  it("centralizes every credit source expiry window", () => {
    const periodEnd = new Date("2026-07-01T09:00:00.000Z");

    expect(daysFromNow(creditExpiryFor("daily_practice", now))).toBe(30);
    expect(daysFromNow(creditExpiryFor("welcome", now))).toBe(14);
    expect(daysFromNow(creditExpiryFor("mission", now))).toBe(30);
    expect(daysFromNow(creditExpiryFor("streak", now))).toBe(30);
    expect(daysFromNow(creditExpiryFor("referral", now))).toBe(60);
    expect(creditExpiryFor("subscription", now, periodEnd)).toEqual(periodEnd);
    expect(creditExpiryFor("purchase", now)).toBeNull();
    expect(creditExpiryFor("admin", now)).toBeNull();
  });

  it("uses the shared expiry helper for daily-practice credits", () => {
    // B375: начисление переехало в lib/streaks.ts (вехи серии).
    const route = source("src/lib/streaks.ts");

    expect(route).toContain("creditExpiryFor");
    expect(route).not.toContain("setDate(expiresAt.getDate() + 90)");
  });
});
