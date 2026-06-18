import fs from "node:fs";
import path from "node:path";
import {
  classifyPayoutRunCandidates,
  payoutAvailableAt,
  payoutReserveKopecks,
  PAYOUT_HOLD_DAYS_BY_PLAN,
  payoutRunIdempotencyKey,
} from "@/lib/payout-runs";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("Z17 payout holds and payout runs", () => {
  it("defines the B426 payout hold ladder 7/3/1", () => {
    const now = new Date("2026-06-06T10:00:00.000Z");

    expect(PAYOUT_HOLD_DAYS_BY_PLAN).toEqual({
      base: 7,
      practitioner_pro: 3,
      practitioner_pro_plus: 1,
    });
    expect(payoutAvailableAt("base", now).toISOString()).toBe("2026-06-13T10:00:00.000Z");
    expect(payoutAvailableAt("practitioner_pro", now).toISOString()).toBe("2026-06-09T10:00:00.000Z");
    expect(payoutAvailableAt("practitioner_pro_plus", now).toISOString()).toBe("2026-06-07T10:00:00.000Z");
  });

  it("keeps chargeback reserve for paid practitioner plans only", () => {
    expect(payoutReserveKopecks("base", 100_000)).toBe(0);
    expect(payoutReserveKopecks("practitioner_pro", 100_000)).toBe(5_000);
    expect(payoutReserveKopecks("practitioner_pro_plus", 100_001)).toBe(5_000);
  });

  it("classifies due payouts into processing vs held with KYC/risk reasons and reserve withheld", () => {
    const result = classifyPayoutRunCandidates([
      {
        id: "ok-card",
        practitionerId: "p1",
        amountKopecks: 100_000,
        reserveKopecks: 5_000,
        payoutDetails: { type: "CARD", inn: "123456789012", kycStatus: null },
        gate: { allowed: true, reasons: [] },
      },
      {
        id: "entity-no-kyc",
        practitionerId: "p2",
        amountKopecks: 100_000,
        reserveKopecks: 5_000,
        payoutDetails: { type: "ENTITY", inn: "1234567890", kycStatus: "PENDING" },
        gate: { allowed: true, reasons: [] },
      },
      {
        id: "risk-held",
        practitionerId: "p3",
        amountKopecks: 80_000,
        reserveKopecks: 0,
        payoutDetails: { type: "SBP", inn: "123456789012", kycStatus: null },
        gate: { allowed: false, reasons: ["open_complaints"] },
      },
    ]);

    expect(result.processing.map((p) => p.id)).toEqual(["ok-card"]);
    expect(result.processing[0]?.disbursedKopecks).toBe(95_000);
    expect(result.held).toEqual([
      { id: "entity-no-kyc", holdReason: "kyc_required", riskFlags: ["entity_kyc_required"] },
      { id: "risk-held", holdReason: "risk_review", riskFlags: ["open_complaints"] },
    ]);
    expect(result.summary).toEqual({
      candidateCount: 3,
      processingCount: 1,
      heldCount: 2,
      totalAmountKopecks: 280_000,
      totalDisbursedKopecks: 95_000,
      totalReserveKopecks: 10_000,
    });
  });

  it("uses one idempotency key per scheduled payout date", () => {
    expect(payoutRunIdempotencyKey(new Date("2026-06-15T00:00:00.000Z"))).toBe("payout-run:2026-06-15");
  });

  it("persists schema, migration, cron, worker, practitioner UI, and admin payout-run wiring", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260606150000_add_payout_runs_and_hold_ladder/migration.sql");
    const sessionComplete = source("src/lib/session-complete.ts");
    const cronRoute = source("src/app/api/cron/payouts/route.ts");
    const cronJobs = source("src/lib/cron-jobs.ts");
    const earningsPage = source("src/app/cabinet/practitioner/earnings/page.tsx");
    const adminPayments = source("src/app/admin/payments/page.tsx");
    const adminPaymentsPanel = source("src/app/admin/payments/payments-panel.tsx");
    const adminPayouts = source("src/app/admin/payouts/page.tsx");

    expect(schema).toContain("model PayoutRun");
    expect(schema).toContain("holdDays");
    expect(schema).toContain("planKeyAtPayout");
    expect(schema).toContain("reserveKopecks");
    expect(schema).toContain("payoutRunId");
    expect(schema).toContain("kycStatus");
    expect(schema).toContain("@@unique([scheduledFor])");
    expect(migration).toContain("CREATE TABLE \"payout_runs\"");
    expect(migration).toContain("\"hold_days\"");
    expect(migration).toContain("\"kyc_status\"");
    expect(sessionComplete).toContain("resolvePractitionerPayoutPlanKey");
    expect(sessionComplete).toContain("holdDays");
    expect(sessionComplete).toContain("reserveKopecks");
    expect(cronRoute).toContain("cron.payout-run");
    expect(cronRoute).toContain("payoutRunIdempotencyKey");
    expect(cronJobs).toContain("runPayoutRunJob");
    expect(earningsPage).toContain("Удержано");
    expect(earningsPage).toContain("holdDays");
    expect(adminPayments).toContain("payoutRun.findMany");
    expect(adminPaymentsPanel).toContain("PayoutRun");
    expect(adminPayouts).toContain("AdminPaymentsPage");
  });
});
