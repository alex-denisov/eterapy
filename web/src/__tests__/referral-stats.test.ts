import { computeReferralStats } from "@/lib/referral-stats";

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
