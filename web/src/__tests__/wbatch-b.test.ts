import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("W10 — /credits title, products anchor, balance-aware CTA", () => {
  const page = read("src/app/cabinet/wallet/page.tsx");
  it("uses a consistent title and a subscription upsell instead of a ₽ top-up CTA", () => {
    expect(page).toContain("Кошелёк кредитов");
    expect(page).not.toContain("Баллы для углублений");
    // Z1-Ф1: the client ₽ balance rail is removed — no rubBalance, the second
    // recommendation card is a subscription upsell.
    expect(page).not.toContain("rubBalance");
    expect(page).toContain("Выбрать подписку");
    expect(page).toContain('id="credits-products"');
  });
});

describe("W13 — action-history hide persists + show-hidden toggle + un-hide", () => {
  it("listMyMapItems supports includeHidden + a hidden flag", () => {
    const lib = read("src/lib/my-map.ts");
    expect(lib).toContain("includeHidden");
    expect(lib).toContain("hidden: isHiddenFromMap");
  });
  it("the page adds a show-hidden toggle and an un-hide action", () => {
    const page = read("src/app/cabinet/action-history/page.tsx");
    expect(page).toContain("async function unhideMapItem");
    expect(page).toContain("hiddenFromMap: false");
    expect(page).toContain("Показать скрытые");
    expect(page).toContain("item.hidden ? unhideMapItem : hideMapItem");
  });
});

describe("W15 — duplicate mid-page Экспорт removed", () => {
  it("action-history keeps a single export (header), none in the bottom CTA", () => {
    const page = read("src/app/cabinet/action-history/page.tsx");
    const exportButtons = page.split('api/cabinet/map/export').length - 1;
    expect(exportButtons).toBe(1);
  });
});
