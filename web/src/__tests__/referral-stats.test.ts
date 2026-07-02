import { computeReferralStats, computeReferralCredits } from "@/lib/referral-stats";

describe("B464 referral-stats — staged counter", () => {
  it("counts invited / tried / stayed as a funnel", () => {
    const stats = computeReferralStats([
      { meaningfulActionAt: new Date(), rewardGrantedAt: new Date(), status: "REWARDED" },
      { meaningfulActionAt: new Date(), rewardGrantedAt: null, status: "REGISTERED" },
      { meaningfulActionAt: null, rewardGrantedAt: null, status: "REGISTERED" },
    ]);
    expect(stats).toEqual({ invited: 3, tried: 2, stayed: 1 });
  });

  it("treats a rewardGrantedAt timestamp OR the REWARDED status as «остались»", () => {
    const stats = computeReferralStats([
      { meaningfulActionAt: new Date(), rewardGrantedAt: new Date(), status: "REGISTERED" },
      { meaningfulActionAt: new Date(), rewardGrantedAt: null, status: "REWARDED" },
    ]);
    expect(stats.stayed).toBe(2);
  });

  it("returns zeros for a user who has not invited anyone", () => {
    expect(computeReferralStats([])).toEqual({ invited: 0, tried: 0, stayed: 0 });
  });
});

describe("B464 IB5 referral-credits — earned vs pending", () => {
  it("splits confirmed (earned) from pending referral grants", () => {
    const credits = computeReferralCredits([
      { amount: 2, status: "confirmed" },
      { amount: 1, status: "confirmed" },
      { amount: 2, status: "pending" },
      { amount: 3, status: "spent" },
    ]);
    expect(credits).toEqual({ earned: 3, pending: 2 });
  });

  it("returns zeros when there are no referral grants", () => {
    expect(computeReferralCredits([])).toEqual({ earned: 0, pending: 0 });
  });
});
