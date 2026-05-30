import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("Issues 30.05 — Wave 0 quick fixes", () => {
  it("D8: billing renders the full card mask, not a short tail", () => {
    const page = source("src/app/cabinet/billing/page.tsx");
    expect(page).toContain("•••• •••• •••• {card.last4}");
  });

  it("B11/D9: top-up field is a clearable string draft (no trapped 0)", () => {
    const page = source("src/app/cabinet/billing/page.tsx");
    expect(page).toContain("const [topUpRaw, setTopUpRaw] = useState");
    expect(page).toContain("const topUpAmount = topUpRaw.trim() === \"\"");
    expect(page).not.toContain('type="number"');
  });

  it("D4: psychologist card states the correct 60-minute session", () => {
    const catalog = source("src/components/products/service-catalog.tsx");
    const pricing = source("src/app/pricing/pricing-plans.tsx");
    expect(catalog).not.toContain("50 минут");
    expect(pricing).not.toContain("50 минут");
    expect(catalog).toContain("60 минут онлайн с проверенным специалистом");
  });

  it("D3/D5: unified admin segmented control exists and replaces low-contrast toggles", () => {
    const css = source("src/app/v4-soft.css");
    expect(css).toContain(".soft-admin-seg-btn");
    expect(css).toContain('.soft-admin-seg-btn[data-active="true"]');
    for (const file of [
      "src/app/admin/applications/applications-manager.tsx",
      "src/app/admin/complaints/complaints-manager.tsx",
      "src/app/admin/bookings/bookings-manager.tsx",
    ]) {
      const content = source(file);
      expect(content).toContain("soft-admin-seg-btn");
      expect(content).not.toContain("bg-primary/15 text-primary");
    }
  });

  it("D6: admin/system colors metrics by health tone", () => {
    const page = source("src/app/admin/system/page.tsx");
    expect(page).toContain("const TONE_COLOR");
    expect(page).toContain("function statTone");
    expect(page).toContain("statusTone(service.status)");
    expect(page).not.toContain("text-emerald-300");
  });
});
