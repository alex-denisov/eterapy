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
    expect(page).toContain("ETerapy не будет предлагать платные продукты");
  });
});
