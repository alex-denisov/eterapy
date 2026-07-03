import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("W10 — /credits title, products anchor, balance-aware CTA", () => {
  const page = read("src/app/cabinet/wallet/page.tsx");
  it("uses a consistent title and a subscription upsell instead of a ₽ top-up CTA", () => {
    expect(page).toContain("Кошелёк баллов");
    expect(page).not.toContain("Баллы для углублений");
    // Z1-Ф1: the client ₽ balance rail is removed — no rubBalance, the second
    // recommendation card is a subscription upsell.
    expect(page).not.toContain("rubBalance");
    // B464 round-4 #13: the spend catalog moved to the landing «Услуги» — the
    // wallet keeps a slim bridge, «Сравнить тарифы» lives in BillingPanel.
    expect(page).toContain('data-testid="wallet-spend-bridge"');
    expect(page).not.toContain('id="credits-products"');
  });
});

describe("W13 — action-history hide persists + show-hidden toggle + un-hide", () => {
  it("listDiaryItems supports includeHidden + a hidden flag", () => {
    const lib = read("src/lib/diary.ts");
    expect(lib).toContain("includeHidden");
    expect(lib).toContain("hidden: isHiddenFromDiary");
  });
  it("the page adds a show-hidden toggle and an un-hide action", () => {
    const page = read("src/app/cabinet/diary/page.tsx");
    expect(page).toContain("async function unhideMapItem");
    expect(page).toContain("hiddenFromMap: false");
    expect(page).toContain("Показать скрытые");
    expect(page).toContain("item.hidden ? unhideMapItem : hideMapItem");
  });
});

describe("W15/B373 — diary export removed with the retired map/export route", () => {
  it("the diary no longer links the removed /api/cabinet/map/export endpoint", () => {
    const page = read("src/app/cabinet/diary/page.tsx");
    const exportButtons = page.split('api/cabinet/map/export').length - 1;
    expect(exportButtons).toBe(0);
  });
});
