import {
  AI_ANALYSES_INCLUDED,
  AI_TOPUP_PACKS,
  computeAiQuota,
  mskMonthRange,
} from "@/lib/practitioner-ai-quota";

// B466/B434 — practitioner AI-разбор metering (owner-frozen numbers 2026-07-04):
// included Pro 20 / Pro+ 50 / Free 0 per month, top-up packs +10/+25/+50 =
// 790/1790/2990 ₽, auto-topup default OFF. Month boundaries are МСК.

describe("B434 AI-разбор quota — frozen numbers", () => {
  it("includes 0/20/50 разборов per month by tier", () => {
    expect(AI_ANALYSES_INCLUDED.free).toBe(0);
    expect(AI_ANALYSES_INCLUDED.pro).toBe(20);
    expect(AI_ANALYSES_INCLUDED.pro_plus).toBe(50);
  });

  it("prices the top-up packs +10/+25/+50 at 790/1790/2990 ₽", () => {
    expect(AI_TOPUP_PACKS.map((p) => [p.units, p.priceRub])).toEqual([
      [10, 790],
      [25, 1790],
      [50, 2990],
    ]);
  });
});

describe("B434 computeAiQuota", () => {
  const now = new Date("2026-07-06T12:00:00.000Z");

  it("counts remaining = included − used + top-up balance", () => {
    const q = computeAiQuota({ tier: "pro", usedThisMonth: 8, topupBalance: 0, now });
    expect(q.included).toBe(20);
    expect(q.remaining).toBe(12);
    expect(q.exhausted).toBe(false);
  });

  it("never lets overuse drive remaining negative and flags exhaustion", () => {
    const q = computeAiQuota({ tier: "pro", usedThisMonth: 25, topupBalance: 0, now });
    expect(q.remaining).toBe(0);
    expect(q.exhausted).toBe(true);
  });

  it("adds the (already-net) top-up pool on top of the included quota", () => {
    // usedThisMonth = все разборы месяца; topupBalance = НЕТТО-остаток
    // докупленного пула (ledger уже списал потраченные topup-разборы).
    const q = computeAiQuota({ tier: "pro", usedThisMonth: 25, topupBalance: 5, now });
    expect(q.remaining).toBe(5);
    expect(q.exhausted).toBe(false);
  });

  it("gives Free practitioners no included разборы", () => {
    const q = computeAiQuota({ tier: "free", usedThisMonth: 0, topupBalance: 0, now });
    expect(q.included).toBe(0);
    expect(q.exhausted).toBe(true);
  });

  it("resets on the 1st of the next month (МСК)", () => {
    const q = computeAiQuota({ tier: "pro", usedThisMonth: 0, topupBalance: 0, now });
    // 2026-08-01 00:00 МСК == 2026-07-31T21:00:00Z
    expect(q.periodResetAt.toISOString()).toBe("2026-07-31T21:00:00.000Z");
  });
});

describe("B434 mskMonthRange", () => {
  it("bounds the month in МСК (UTC+3), not UTC", () => {
    // 2026-06-30 23:30 МСК is still June in МСК but already 20:30Z on the 30th.
    const lateJune = new Date("2026-06-30T20:30:00.000Z");
    const june = mskMonthRange(lateJune);
    expect(june.start.toISOString()).toBe("2026-05-31T21:00:00.000Z");
    expect(june.end.toISOString()).toBe("2026-06-30T21:00:00.000Z");

    // 2026-07-01 00:30 МСК (21:30Z June 30) is already July in МСК.
    const earlyJuly = new Date("2026-06-30T21:30:00.000Z");
    const july = mskMonthRange(earlyJuly);
    expect(july.start.toISOString()).toBe("2026-06-30T21:00:00.000Z");
    expect(july.end.toISOString()).toBe("2026-07-31T21:00:00.000Z");
  });
});
