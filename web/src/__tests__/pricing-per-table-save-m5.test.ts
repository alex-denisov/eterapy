import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "src/app/admin/pricing/pricing-editor.tsx"), "utf8");

describe("M5/B2 — Save button inside each pricing table", () => {
  it("each settings table has its own scoped save button", () => {
    expect(source).toContain("data-testid={`pricing-save-${scope}`}");
    expect(source).toContain("Сохранить настройки");
    // scoped save persists only that table's keys
    expect(source).toContain("async function saveSettings(scope: string, keys?: PriceKey[])");
    expect(source).toContain('saveSettings("plans", rows)'.replace('"plans", rows', "scope, rows"));
  });

  it("drops the single global «Сохранить все настройки» button", () => {
    expect(source).not.toContain("Сохранить все настройки");
    // M6: the standalone «Тарифные планы и комиссия» table was removed; products
    // + all subscriptions now live in a single table.
    expect(source).not.toContain('settingsTable("Тарифные планы и комиссия"');
    expect(source).toContain('settingsTable("Цифровые продукты и подписки", PRODUCT_PRICE_KEYS, "products")');
  });
});
