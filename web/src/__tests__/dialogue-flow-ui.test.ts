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

  it("offers save and v4.2 triage actions after the primary answer", () => {
    const page = source("src/app/checkin/page.tsx");

    // #10: share + «новый вопрос» removed; authed users see the shared auto-saved
    // note (same as tarot), guests get the save→/login action.
    expect(page).not.toContain("<AIShareButton");
    expect(page).not.toContain("Новый вопрос");
    expect(page).toContain('testId="result-autosaved-note"');
    expect(page).toContain('data-testid="save-result-login"');
    expect(page).toContain('data-testid="dialogue-answer-triage-layout"');
    expect(page).toContain('data-testid="dialogue-triage-rail"');
    expect(page).toContain('data-testid="triage-primary-cta"');
    expect(page).toContain('data-testid="triage-secondary-options"');
    expect(page).toContain('data-testid="triage-subscription-option"');
    expect(page).toContain('data-testid="dialogue-free-continuation-actions"');
    // W17: "другие форматы" is now topic-driven from the API, not a static array
    expect(page).toContain("secondaryProducts.map(");
    expect(page).toContain("${item.href}?dialogueId=${dialogue.id}");
    // B441: reframe is self-contained — the checkin fallback links to it without ?dialogueId.
    expect(page).toContain('href="/products/reframe"');
    expect(page).toContain('data-analytics-event="triage_primary_clicked"');
    expect(page).toContain('data-analytics-event="triage_secondary_clicked"');
    expect(page).toContain('data-analytics-event="triage_subscription_clicked"');
    // Two branches share the testid: dynamic recommendation (topic-aware)
    // vs. the reframe fallback. Only one renders at runtime.
    expect(page.match(/data-testid="triage-primary-cta"/g)?.length).toBe(2);
    expect(page).toContain('data-analytics-surface="checkin_triage"');
    expect(page).toContain('data-analytics-cta-role="primary"');
    expect(page).toContain('data-analytics-offer-id="reframe_first_paid_step"');
    expect(page).toContain('data-analytics-offer-reason="decision_request_after_free_answer"');
    expect(page).toContain('data-analytics-price-rub="299"');
    expect(page).toContain('data-analytics-credit-cost="1"');
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

  it("shows a soft daily-limit paywall for standalone checkin creation", () => {
    const page = source("src/app/checkin/page.tsx");

    expect(page).toContain("DIALOGUE_DAILY_LIMIT");
    expect(page).toContain('data-testid="dialogue-limit-paywall"');
    expect(page).toContain('data-testid="register-to-continue"');
    expect(page).toContain('href="/register?intent=continue-dialogue"');
    expect(page).toContain('data-testid="upgrade-to-plus"');
    expect(page).toContain('href="/pricing#plus"');
    expect(page).toContain("dialogue_limit_hit");
    expect(page).toContain("dialogue_limit_paywall_shown");
    expect(page).toContain("dialogue_limit_register_clicked");
    expect(page).toContain("dialogue_limit_upgrade_clicked");
  });

  // B411: the primary разбор finalizes on a single screen — no separate
  // generation page that crops the dialogue to just the first question, and the
  // full dialogue collapses into an expandable «Первичный разбор».
  it("B411: kills the cropped generation screen and collapses the dialogue", () => {
    const page = source("src/app/checkin/page.tsx");
    const processing = page.slice(
      page.indexOf('data-testid="dialogue-processing-step"'),
      page.indexOf('phase === "safety" &&'),
    );
    // the processing screen no longer renders the cropped single-question bubble
    expect(processing).not.toContain("soft-msg-bubble-user");
    // instead it reuses the result scaffold (the «что я слышу» band)
    expect(processing).toContain("что я слышу в вашем вопросе");
    // the dialogue is a collapsible «Первичный разбор» disclosure
    expect(page).toContain("<details");
    expect(page).toContain(">первичный разбор<");
  });

  // B412: recommendation priority + rename + price-in-card + specialist highlight.
  it("B412: orders recommendations by priority with prices and a specialist highlight", () => {
    const page = source("src/app/checkin/page.tsx");
    expect(page).toContain("подобрано для вас");
    expect(page).not.toContain("рекомендуем именно вам");
    expect(page).toContain('data-testid="continue-in-chat-cta"');
    // chat card carries its price inside the card
    expect(page).toContain("790 ₽");
    expect(page).toContain("или 4 балла");
    // specialist session is elevated above the other formats
    expect(page).toContain("человек рядом");
  });

  // Subtask (2026-06-17, owner): the «продолжить разговор в чате» service is paid —
  // no «бесплатно» framing on the chat CTA (the FREE part is the первичный разбор).
  it("presents the chat continuation as a paid service (no free mention)", () => {
    const page = source("src/app/checkin/page.tsx");
    const chatCard = page.slice(
      page.indexOf('data-testid="continue-in-chat-cta"'),
      page.indexOf('data-testid="triage-primary-cta"'),
    );
    expect(chatCard).not.toContain("Первый мини-диалог");
    expect(chatCard).not.toContain("Бесплатно");
    expect(chatCard).not.toContain("бесплатно");
  });

  // Subtask (2026-06-17, owner): the разбор result header is an iOS-style back
  // arrow (= новый разбор), not the loud «разбор готов»/«бесплатно» badge row;
  // the «зашифровано» plate became a quiet shield line; the low-value
  // «не заменяет профильную помощь» disclaimer is gone.
  it("uses an iOS-style back-arrow header on the result and drops the noise plates", () => {
    const page = source("src/app/checkin/page.tsx");
    const result = page.slice(
      page.indexOf('data-testid="dialogue-result-step"'),
      page.indexOf('{error && phase !== "processing"'),
    );
    expect(result).toContain('data-testid="dialogue-result-back"');
    expect(result).toContain("<ChevronLeft");
    expect(result).not.toContain("разбор готов");
    expect(result).not.toContain('soft-badge soft-badge-warm">бесплатно');
    expect(page).not.toContain("не заменяет профильную помощь и не является прогнозом");
    // result phase suppresses the built-in shell header (single clean header)
    expect(page).toContain('hideHeader={phase === "result"}');
  });

  // #10: the checkin result no longer shows a share button; the AIShareButton
  // component still supports iconOnly for other surfaces.
  it("checkin result has no share button; AIShareButton still supports iconOnly", () => {
    const page = source("src/app/checkin/page.tsx");
    expect(page).not.toContain("AIShareButton");
    const share = source("src/components/ai-share-button.tsx");
    expect(share).toContain("iconOnly");
    expect(share).toContain("lucide-share-2");
  });

  // B416: the limit gate is a blocking popup, never shown during a safety interrupt.
  it("B416: limit is a blocking popup gated off the safety state", () => {
    const page = source("src/app/checkin/page.tsx");
    expect(page).toContain('limitPaywall && phase !== "safety"');
    expect(page).toContain('role="dialog"');
    expect(page).toContain("На сегодня — достаточно");
    expect(page).toContain("Ваш первый разбор готов");
  });
});
