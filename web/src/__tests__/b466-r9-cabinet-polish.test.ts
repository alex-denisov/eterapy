import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9-5 — owner polish batch: plan-export removed, заявки price on one
// line, client mobile «верх» = bell-only (как у практика), mobile Доступность
// gets the approved hours-range editor.

describe("B466 R9-5 cabinet polish", () => {
  it("removes the reserved «Экспорт» button from the mobile care-plan", () => {
    const plan = source("src/app/cabinet/practitioner/clients/[id]/card-mobile-plan.tsx");
    expect(plan).not.toContain("Экспорт");
    expect(plan).not.toContain("Download");
    expect(plan).toContain("Редактировать план");
  });

  it("keeps the заявки price on one line (nowrap)", () => {
    const css = source("src/app/cabinet/practitioner-cockpit.css");
    expect(css).toMatch(/\.pcab-rq-slot b\s*\{[^}]*white-space:\s*nowrap/);
    const calendar = source("src/app/cabinet/practitioner/calendar/calendar-mobile.tsx");
    // appt-meta price wrapped in a nowrap span
    expect(calendar).toContain('<span className="whitespace-nowrap">{b.priceRub.toLocaleString("ru")} ₽</span>');
  });

  it("client mobile cabinet hides the public header and keeps only the bell", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");
    expect(shell).toContain("data-cabinet-mobile-top");
    expect(shell).toContain("NotificationBell");
    expect(shell).toContain("client-mobile-appbar");
    const css = source("src/app/cabinet/practitioner-cockpit.css");
    expect(css).toMatch(/\[data-cabinet-mobile-top\][^{]*header\[data-site-chrome="header"\]/);
  });

  it("mobile Доступность gets an hours-range editor wired to PUT /api/schedule", () => {
    const availability = source("src/app/cabinet/practitioner/calendar/availability-mobile.tsx");
    expect(availability).toContain("availability-edit-open"); // «Изменить»
    expect(availability).toContain("availability-editor"); // sheet
    expect(availability).toContain("availability-timepick"); // 30-min picker
    expect(availability).toContain('method: "PUT"');
    expect(availability).toContain("/api/schedule");
    expect(availability).toContain("Скопировать Пн на все будни");
    expect(availability).toContain("Будни 10–19"); // preset
  });
});
