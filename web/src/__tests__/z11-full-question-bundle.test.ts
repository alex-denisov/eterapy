import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(filePath: string) {
  return fs.readFileSync(path.join(root, "src", filePath), "utf8");
}

describe("Z11 — full-question bundle", () => {
  it("expands credit purchases of full-question through the spend-credits route", () => {
    const route = source("app/api/billing/spend-credits/route.ts");

    expect(route).toContain("V5_BUNDLE_CONTENTS");
    expect(route).toContain("bundleProductKeys");
    expect(route).toContain('productKey === "full-question"');
    expect(route).toContain('"bundle"');
    expect(route).toContain('sourceEventId: productKey');
    expect(route).toContain("productEntitlement.create");
  });

  it("treats a full-question entitlement check as active only when both child products are active", () => {
    const entitlements = source("lib/entitlements.ts");

    expect(entitlements).toContain("V5_BUNDLE_CONTENTS");
    expect(entitlements).toContain("isKnownBundleProduct");
    expect(entitlements).toContain("bundleProductKeys.every");
    expect(entitlements).toContain('"perspectives"');
    expect(entitlements).toContain('"deep-report"');
  });

  // B366: the decoy ladder prices now derive from the single billing source
  // (getProductPriceLabel) instead of hardcoded ₽ literals.
  it("shows the deep-report decoy ladder derived from the single price source", () => {
    const deepActions = source("components/products/deep-report-actions.tsx");
    const bundleOffer = source("components/products/full-question-bundle-offer.tsx");

    expect(deepActions).toContain("FullQuestionBundleOffer");
    expect(bundleOffer).toContain('data-testid="full-question-bundle-offer"');
    expect(bundleOffer).toContain('getProductPriceLabel("deep-report")');
    expect(bundleOffer).toContain('getProductPriceLabel("full-question")');
    expect(bundleOffer).toContain("1 290 ₽");
    expect(bundleOffer).toContain('productKey="full-question"');
    expect(bundleOffer).toContain("creditCost={BUNDLE_COST}");
    expect(bundleOffer).toContain("/api/billing/entitlements?productKey=full-question");
  });
});
