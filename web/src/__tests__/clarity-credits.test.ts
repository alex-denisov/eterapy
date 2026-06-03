import fs from "node:fs";
import path from "node:path";
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
    expect(getProductCreditCost("perspectives")).toBe(1);
    expect(getProductCreditCost("deep-report")).toBe(4);
    expect(getProductCreditCost("chat-analysis")).toBe(2);
    expect(getProductCreditCost("compatibility")).toBe(4);
    expect(getProductCreditCost("seven-days")).toBe(8);
  });

  it("gates credit spending through an authenticated entitlement API", () => {
    const route = source("src/app/api/billing/spend-credits/route.ts");

    expect(route).toContain("await auth()");
    expect(route).toContain("getSpendableClarityCreditBalance");
    expect(route).toContain("recordClarityCreditEntry");
    expect(route).toContain('source: "credits"');
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
