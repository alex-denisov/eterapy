import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B230 v4.2 CTA monetization analytics", () => {
  it("persists Triage CTA clicks as first-party events with offer metadata", () => {
    const analytics = source("src/components/analytics.tsx");
    const analyticsLib = source("src/lib/analytics.ts");
    const checkin = source("src/app/checkin/page.tsx");

    expect(analyticsLib).toContain('fetch("/api/analytics/track"');
    expect(analytics).toContain("track({");
    expect(analytics).toContain("analyticsCtaRole");
    expect(analytics).toContain("analyticsOfferId");
    expect(analytics).toContain("analyticsOfferReason");
    expect(checkin).toContain('data-analytics-offer-id="reframe_first_paid_step"');
    expect(checkin).toContain('data-analytics-offer-reason="decision_request_after_free_answer"');
    expect(checkin).toContain('data-analytics-cta-role="secondary"');
    expect(checkin).toContain('data-analytics-cta-role="bundle"');
  });

  it("shows CTA monetization events in the product analytics center", () => {
    const analyticsData = source("src/app/admin/admin-analytics-data.ts");
    const productCenter = source("src/app/admin/product/page.tsx");

    expect(analyticsData).toContain("triage_primary_clicked");
    expect(analyticsData).toContain("triage_subscription_clicked");
    expect(analyticsData).toContain("credits_spend_clicked");
    expect(productCenter).toContain("Воронка продукта");
    expect(productCenter).toContain('data-testid="admin-product-center"');
  });
});
