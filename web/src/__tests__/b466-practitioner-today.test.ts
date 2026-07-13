import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 — «Сегодня» (Practice cockpit home). Locks the owner-approved layout:
// hero «следующая сессия» with the T-30 join gate, «требует внимания»,
// расписание дня and the metered AI-разбор quota card.

describe("B466 practitioner «Сегодня»", () => {
  const page = source("src/app/cabinet/practitioner/page.tsx");

  it("gates «Войти в сессию» to the 30-minute join window", () => {
    expect(page).toContain("canJoinBooking");
    expect(page).toContain('data-testid="practitioner-join-session"');
    expect(page).toContain('data-testid="practitioner-join-gated"');
    expect(page).toContain("за 30 мин");
  });

  it("shows the next-session hero with recording notice and client card link", () => {
    expect(page).toContain('data-testid="practitioner-next-session"');
    expect(page).toContain("запись включена");
    expect(page).toContain("/practitioner/clients/");
  });

  it("surfaces заявки and fresh AI-разборы in «требует внимания»", () => {
    expect(page).toContain('data-testid="practitioner-attention"');
    expect(page).toContain("/practitioner/calendar?tab=requests");
    expect(page).toContain("/practitioner/sessions/");
  });

  it("renders the metered AI-разбор quota (B434), not an unlimited pitch", () => {
    expect(page).toContain('data-testid="practitioner-ai-quota-card"');
    expect(page).toContain("getPractitionerAiQuota");
    expect(page).toContain("/practitioner/ai-usage");
    expect(page).not.toContain("безлимит");
  });

  it("counts income by МСК month with the applied commission", () => {
    expect(page).toContain("mskMonthRange");
    expect(page).toContain("commissionPercentApplied");
  });

  // R9-5 desktop — the approved «Сегодня» refinements built on top of the
  // existing hero/timeline/quota layout.
  it("assembles the «строка-ориентир» from the same signals as mobile", () => {
    expect(page).toContain('data-testid="practitioner-today-orientation"');
    expect(page).toContain("orientationLine");
    expect(page).toContain("Ближайшая встреча —");
    // Fallback branch when there is no confirmed session.
    expect(page).toContain("откройте доступность");
  });

  it("labels the metrics «Пульс практики» and offers the AI top-up CTA (B434)", () => {
    expect(page).toContain("Пульс практики");
    expect(page).toContain('data-testid="practitioner-ai-topup"');
    expect(page).toContain("Докупить разборы");
  });
});
