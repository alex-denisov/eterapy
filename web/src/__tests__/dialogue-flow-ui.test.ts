import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("B071-B074 dialogue flow UI", () => {
  it("uses the v5 dialogue APIs instead of the old check-in generator", () => {
    const page = source("src/app/checkin/page.tsx");

    expect(page).toContain('requestJson<{ dialogue: DialoguePayload }>("/api/dialogues"');
    expect(page).toContain("/api/dialogues/${dialogueId}/answer");
    expect(page).toContain("/api/dialogues/${dialogue.id}");
    expect(page).not.toContain("/api/modalities/checkin");
  });

  it("covers question, clarification, processing, safety, and result states", () => {
    const page = source("src/app/checkin/page.tsx");

    expect(page).toContain('data-testid="dialogue-question-step"');
    expect(page).toContain('data-testid="dialogue-clarifying-step"');
    expect(page).toContain('data-testid="dialogue-processing-step"');
    expect(page).toContain('data-testid="dialogue-safety-interrupt"');
    expect(page).toContain('data-testid="dialogue-result-step"');
    expect(page).toContain('data-testid="dialogue-retry-answer"');
  });

  it("offers save, share, and v4.2 triage actions after the primary answer", () => {
    const page = source("src/app/checkin/page.tsx");

    expect(page).toContain("<AIShareButton");
    expect(page).toContain('data-testid="save-result-authenticated"');
    expect(page).toContain('data-testid="save-result-register"');
    expect(page).toContain('data-testid="dialogue-answer-triage-layout"');
    expect(page).toContain('data-testid="dialogue-triage-rail"');
    expect(page).toContain('data-testid="triage-primary-cta"');
    expect(page).toContain('data-testid="triage-secondary-options"');
    expect(page).toContain('data-testid="triage-subscription-option"');
    expect(page).toContain('data-testid="dialogue-free-continuation-actions"');
    expect(page).toContain("/products/deep-report?dialogueId=${dialogue.id}");
    expect(page).toContain('href={`/products/perspectives?dialogueId=${dialogue.id}`}');
    expect(page).toContain('data-analytics-event="triage_primary_clicked"');
    expect(page).toContain('data-analytics-event="triage_secondary_clicked"');
    expect(page).toContain('data-analytics-event="triage_subscription_clicked"');
    expect(page.match(/data-testid="triage-primary-cta"/g)?.length).toBe(1);
    expect(page).toContain('data-analytics-surface="checkin_triage"');
    expect(page).toContain('data-analytics-cta-role="primary"');
    expect(page).toContain('data-analytics-offer-id="perspectives_first_paid_step"');
    expect(page).toContain('data-analytics-offer-reason="decision_request_after_free_answer"');
    expect(page).toContain('data-analytics-price-rub="299"');
    expect(page).toContain('data-analytics-credit-cost="2"');
    expect(page).toContain("ETerapy не будет предлагать платные продукты");
  });

  it("keeps paid CTAs out of the safety interrupt state", () => {
    const page = source("src/app/checkin/page.tsx");
    const safetySection = page.slice(
      page.indexOf('phase === "safety" &&'),
      page.indexOf('phase === "result" &&'),
    );

    expect(safetySection).toContain('data-testid="dialogue-safety-interrupt"');
    expect(safetySection).not.toContain("triage_primary_clicked");
    expect(safetySection).not.toContain("triage_secondary_clicked");
    expect(safetySection).not.toContain("triage_subscription_clicked");
    expect(safetySection).not.toContain("/products/");
  });
});
