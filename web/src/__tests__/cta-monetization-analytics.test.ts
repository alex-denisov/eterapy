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
    expect(checkin).toContain('data-analytics-offer-id="perspectives_first_paid_step"');
    expect(checkin).toContain('data-analytics-offer-reason="decision_request_after_free_answer"');
    expect(checkin).toContain('data-analytics-cta-role="secondary"');
    expect(checkin).toContain('data-analytics-cta-role="bundle"');
  });

  it("shows CTA monetization events in admin metrics", () => {
    const metrics = source("src/app/admin/metrics/page.tsx");

    expect(metrics).toContain("triage_primary_clicked");
    expect(metrics).toContain("triage_secondary_clicked");
    expect(metrics).toContain("triage_subscription_clicked");
    expect(metrics).toContain("credits_spend_clicked");
    expect(metrics).toContain('data-testid="admin-cta-monetization-funnel"');
    expect(metrics).toContain("one primary CTA");
    expect(metrics).toContain('"chat-analysis": 390');
    expect(metrics).toContain('"compatibility": 590');
  });
});
