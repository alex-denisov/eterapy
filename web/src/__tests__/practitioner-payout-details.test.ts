import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("X13 — practitioner payout requisites mechanic", () => {
  it("exposes a payout-details API that upserts PayoutDetails", () => {
    const route = read("src/app/api/practitioner/payout-details/route.ts");
    expect(route).toContain("db.payoutDetails.upsert");
    expect(route).toContain("CARD");
    expect(route).toContain("SBP");
    expect(route).toContain('session.user.role !== "PRACTITIONER"');
  });

  it("renders the requisites form on the earnings page", () => {
    const page = read("src/app/cabinet/practitioner/earnings/page.tsx");
    expect(page).toContain("<PayoutDetailsForm");
    expect(page).toContain("payoutDetails:");
    const form = read("src/app/cabinet/practitioner/earnings/payout-details-form.tsx");
    expect(form).toContain('data-testid="practitioner-payout-details"');
    expect(form).toContain("/api/practitioner/payout-details");
  });
});
