import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B217 referral and credit anti-fraud", () => {
  it("persists referral risk signals and fraud events", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260513200000_add_referral_fraud_events/migration.sql");

    expect(schema).toContain("model FraudEvent");
    expect(schema).toContain("riskScore");
    expect(schema).toContain("riskFlags");
    expect(schema).toContain("ipHash");
    expect(schema).toContain("deviceHash");
    expect(schema).toContain("@@index([ipHash, createdAt])");
    expect(schema).toContain("@@index([deviceHash, createdAt])");
    expect(migration).toContain("fraud_events");
    expect(migration).toContain("risk_flags");
    expect(migration).toContain("referral_attributions_ip_hash_created_at_idx");
  });

  it("scores referral rewards with fingerprint, velocity, duplicate and limit checks", () => {
    const antifraud = source("src/lib/antifraud.ts");

    expect(antifraud).toContain("requestFingerprint");
    expect(antifraud).toContain("x-eterapy-device-id");
    expect(antifraud).toContain("many_referrals_same_ip_day");
    expect(antifraud).toContain("many_referrals_same_device_day");
    expect(antifraud).toContain("daily_referral_reward_limit");
    expect(antifraud).toContain("monthly_referral_reward_limit");
    expect(antifraud).toContain("duplicate_referred_user_reward");
    expect(antifraud).toContain("HIGH_RISK_SCORE");
  });

  it("keeps referral rewards pending, blocks risky rewards and logs decisions", () => {
    const referral = source("src/lib/share-referral.ts");

    expect(referral).toContain("assessReferralRisk");
    expect(referral).toContain("logFraudEvent");
    expect(referral).toContain("referral_reward_blocked");
    expect(referral).toContain("referral_reward_pending");
    expect(referral).toContain('status: "pending"');
    expect(referral).toContain("meaningful_action_pending_review");
    expect(referral).toContain("REWARD_REVOKED");
    expect(referral).toContain("referral_reward_clawback");
  });

  it("claws referral credits back after refunds and only spends confirmed credits", () => {
    const billing = source("src/lib/billing-credit.ts");
    const credits = source("src/lib/clarity-credits.ts");
    const referral = source("src/lib/share-referral.ts");
    const spendRoute = source("src/app/api/billing/spend-credits/route.ts");

    expect(billing).toContain("clawbackReferralRewardsForUser");
    expect(credits).toContain("getSpendableClarityCreditBalance");
    expect(credits).toContain('const SPENDABLE_STATUSES: ClarityCreditStatus[] = ["confirmed"]');
    expect(referral).toContain('type: "clawback"');
    expect(spendRoute).toContain("getSpendableClarityCreditBalance");
    expect(spendRoute).not.toContain("getClarityCreditBalance");
  });
});
