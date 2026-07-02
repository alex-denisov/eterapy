import fs from "node:fs";
import path from "node:path";
import { formatCbrRateLabel, getAdminCurrencyRates } from "@/app/admin/admin-currency";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
});

describe("Admin owner finance overview", () => {
  it("surfaces owner-grade financial liabilities and revenue splits", () => {
    const overview = source("src/app/admin/finance/page.tsx");
    const data = source("src/app/admin/admin-analytics-data.ts");
    expect(overview).toContain("Финансы платформы");
    expect(overview).toContain("Поступления и возвраты по дням");
    expect(overview).toContain("Выплаты практикам");
    expect(overview).toContain("Юнит-экономика");
    expect(data).toContain("manualCredits");
    expect(data).toContain("purchasedCredits");
    // Z1-Ф1: the client ₽ balance rail is removed — no ₽ top-up / manual-credit
    // liability lines, no user-balance liability metric.
    expect(overview).not.toContain("Пополнения через эквайер");
    expect(overview).not.toContain("totalBalanceRub");
  });

  it("Z1-Ф1: drops the manual ₽-balance adjustment action from the user API", () => {
    const route = source("src/app/api/admin/users/[id]/route.ts");
    expect(route).not.toContain('case "update_balance"');
    expect(route).not.toContain("const delta = kopecks - targetUser.balance");
    // the client credit-grant action remains (the credit-centric currency)
    expect(route).toContain('case "update_clarity_credits"');
  });

  it("labels AI service cost rows with Russian names instead of raw feature slugs", () => {
    const data = source("src/app/admin/admin-analytics-data.ts");
    expect(data).toContain('"chat-analysis-ocr": "Распознавание переписки"');
    expect(data).toContain('"dialogue-primary-answer": "Первичный разбор"');
    expect(data).toContain('"session-stt": "Транскрипция сессии"');
    expect(data).toContain('replaceAll("_", "-")');

    const aiCost = source("src/app/admin/ops/ai-cost/page.tsx");
    expect(aiCost).toContain("const exactTitle = productLabel(feature)");
    expect(aiCost).toContain("if (exactTitle !== normalized) return exactTitle");
  });

  it("renders admin charts as SVG and exposes the finance currency selector", () => {
    const ui = source("src/app/admin/admin-analytics-ui.tsx");
    const selector = source("src/app/admin/admin-currency-selector.tsx");
    const finance = source("src/app/admin/finance/page.tsx");
    const dashboard = source("src/app/admin/page.tsx");
    expect(ui).toContain('data-testid="admin-vertical-bar-chart-svg"');
    expect(ui).not.toContain("style={{ height:");
    expect(selector).toContain("Валюта");
    expect(selector).toContain("RUB · ₽");
    expect(selector).toContain("USD · $");
    expect(finance).toContain("<AdminCurrencySelector");
    expect(dashboard).toContain("<AdminCurrencySelector");
  });

  it("parses the official CBR USD block instead of the first XML currency value", async () => {
    const xml = [
      '<?xml version="1.0" encoding="windows-1251"?>',
      '<ValCurs Date="30.06.2026" name="Foreign Currency Market">',
      '<Valute ID="R01010"><CharCode>AUD</CharCode><Nominal>1</Nominal><Value>53,6191</Value></Valute>',
      '<Valute ID="R01235"><CharCode>USD</CharCode><Nominal>1</Nominal><Value>77,7539</Value></Valute>',
      "</ValCurs>",
    ].join("");

    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => xml,
    })) as unknown as typeof fetch;

    const rates = await getAdminCurrencyRates(new Date("2026-06-30T07:00:00.000Z"));

    expect(rates.usdRub).toBeCloseTo(77.7539);
    expect(formatCbrRateLabel(rates)).toBe("$/₽ · 30.06.2026 · 77,75");
  });

  it("uses the official latest CBR endpoint by default for the admin currency selector", async () => {
    global.fetch = jest.fn(async () => ({
      ok: true,
      text: async () => [
        '<ValCurs Date="01.07.2026">',
        '<Valute><CharCode>USD</CharCode><Nominal>1</Nominal><Value>78,1212</Value></Valute>',
        "</ValCurs>",
      ].join(""),
    })) as unknown as typeof fetch;

    const rates = await getAdminCurrencyRates();

    expect(global.fetch).toHaveBeenCalledWith(
      "https://www.cbr.ru/scripts/XML_daily.asp",
      expect.any(Object),
    );
    expect(rates.usdRub).toBeCloseTo(78.1212);
    expect(formatCbrRateLabel(rates)).toBe("$/₽ · 01.07.2026 · 78,12");
  });
});
