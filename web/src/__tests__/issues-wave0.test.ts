import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("Issues 30.05 — Wave 0 quick fixes", () => {
  it("B602: карточек карт в биллинге больше нет (блок удалён владельцем)", () => {
    const page = source("src/components/cabinet/billing-panel.tsx");
    expect(page).not.toContain("•••• {card.last4}");
  });

  it("Z1-Ф1: the ₽ top-up field is removed from billing (no client balance rail)", () => {
    const page = source("src/components/cabinet/billing-panel.tsx");
    expect(page).not.toContain("const [topUpRaw, setTopUpRaw] = useState");
    expect(page).not.toContain("client-topup-amount");
    expect(page).not.toContain('type="number"');
  });

  it("D4 / B455: specialist card states no fixed session length (duration is client-chosen)", () => {
    const catalog = source("src/components/products/service-catalog.tsx");
    const pricing = source("src/app/pricing/pricing-plans.tsx");
    expect(catalog).not.toContain("50 минут");
    expect(pricing).not.toContain("50 минут");
    // B455: dropped the misleading fixed "60 минут онлайн" — the client picks the length.
    expect(catalog).not.toContain("60 минут онлайн");
    expect(catalog).toContain("длительность встречи выбираете сами");
  });

  it("D3/D5: unified admin compact controls replace low-contrast toggles", () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain(".soft-admin-action");
    expect(css).toContain('.soft-admin-action[data-variant="primary"]');
    for (const file of [
      "src/app/admin/applications/applications-manager.tsx",
      "src/app/admin/complaints/complaints-manager.tsx",
    ]) {
      const content = source(file);
      expect(content).toContain("AdminCompactDataTable");
      expect(content).toContain('filterKind: "select"');
      expect(content).not.toContain("bg-primary/15 text-primary");
    }
    const bookings = source("src/app/admin/bookings/bookings-manager.tsx");
    expect(bookings).toContain("AdminCompactDataTable");
    expect(bookings).toContain('filterKind: "select"');
    expect(bookings).not.toContain("bg-primary/15 text-primary");
  });

  it("D6: admin/system colors metrics by health tone", () => {
    const page = source("src/app/admin/system/admin-system-page.tsx");
    expect(page).toContain("const TONE_COLOR");
    expect(page).toContain("function statTone");
    expect(page).toContain("statusTone(service.status)");
    expect(page).not.toContain("text-emerald-300");
  });
});
