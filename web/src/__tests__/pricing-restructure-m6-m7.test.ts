import fs from "node:fs";
import path from "node:path";

const editor = fs.readFileSync(
  path.join(process.cwd(), "src/app/admin/pricing/pricing-editor.tsx"),
  "utf8",
);

describe("M6 — pricing tables restructure", () => {
  it("removes the obsolete platform settings (free sessions, tool limit, min price)", () => {
    expect(editor).not.toContain("plan.free.sessions");
    expect(editor).not.toContain("tools.default_limit");
    expect(editor).not.toContain("session.min_price");
    // the standalone «Тарифные планы и комиссия» table is gone
    expect(editor).not.toContain("PLAN_KEYS");
    expect(editor).not.toContain("Тарифные планы и комиссия");
  });

  it("moves both practitioner subscriptions into the digital-products table", () => {
    expect(editor).toContain("subscription.practitioner-pro.price");
    expect(editor).toContain("subscription.practitioner-pro-plus.price");
    // they sit inside PRODUCT_PRICE_KEYS now
    const productsBlock = editor.slice(
      editor.indexOf("const PRODUCT_PRICE_KEYS"),
      editor.indexOf("];", editor.indexOf("const PRODUCT_PRICE_KEYS")),
    );
    expect(productsBlock).toContain("subscription.practitioner-pro.price");
    expect(productsBlock).toContain("subscription.practitioner-pro-plus.price");
  });

  it("manages platform commission per-practitioner via the profile endpoint", () => {
    expect(editor).toContain("function saveCommission(id: string)");
    expect(editor).toContain("/profile`");
    expect(editor).toContain('JSON.stringify({ commissionPercent: n })');
    expect(editor).toContain("commissionDraft");
  });
});

describe("M7 — single base price (60 min) per practitioner", () => {
  it("replaces min-rate with a single 60-minute base price used for sort/filter", () => {
    expect(editor).not.toContain("Минимальная ставка");
    expect(editor).toContain("function basePrice60(practitioner: Practitioner)");
    expect(editor).toContain("durationMin === 60");
    expect(editor).toContain("Базовая цена (60 мин)");
    // sortable + searchable practitioner table now uses the shared admin table
    // contract instead of a local query/sort implementation.
    expect(editor).toContain("AdminCompactDataTable");
    expect(editor).toContain('filterKind: "text"');
    expect(editor).toContain("sortValue: base ?? 0");
  });

  it("edits the 60-minute base price inline from the practitioner table", () => {
    expect(editor).toContain("function startBasePriceEdit(practitioner: Practitioner)");
    expect(editor).toContain("function saveBasePrice(practitioner: Practitioner)");
    expect(editor).toContain("nextRatesWithBasePrice(practitioner, n)");
    expect(editor).toContain("pricing-base-price-edit");
    expect(editor).toContain("Сохранить базовую цену");
  });
});
