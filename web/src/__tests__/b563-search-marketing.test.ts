import fs from "node:fs";
import path from "node:path";
import {
  classifySearchOpportunity,
  parseMetrikaTotals,
  parseMetrikaTrafficSources,
  parseWebmasterQueries,
  parseWebmasterSummary,
  parseWordstatDemand,
  weightedAveragePosition,
} from "@/lib/search-marketing-parsers";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("B563 — search and marketing dashboard", () => {
  it("parses the Yandex Webmaster shapes used by yandex-mcp", () => {
    expect(parseWebmasterSummary({
      searchable_pages_count: 150,
      downloaded_pages_count: 163,
      sqi: 40,
      site_problems: { FATAL: 0 },
    })).toEqual({ searchablePages: 150, downloadedPages: 163, siteQualityIndex: 40, fatalProblems: 0 });

    const queries = parseWebmasterQueries({
      queries: [{
        query_text: "ии психолог",
        indicators: { TOTAL_SHOWS: "100", TOTAL_CLICKS: 12, AVG_SHOW_POSITION: 7.5 },
      }],
    });
    expect(queries[0]).toMatchObject({ query: "ии психолог", impressions: 100, clicks: 12, ctr: 12, averagePosition: 7.5 });
    expect(queries[0]?.opportunity).toBe("Быстрый рост");
    expect(weightedAveragePosition(queries)).toBe(7.5);
  });

  it("keeps demand, traffic and site position as separate metrics", () => {
    expect(parseWordstatDemand("таро онлайн", { results: [{ phrase: "таро онлайн", count: "297000" }] }))
      .toEqual({ phrase: "таро онлайн", monthlyDemand: 297000 });
    expect(parseMetrikaTotals({ totals: [125, 98, 17.2, 2.4] }))
      .toEqual({ visits: 125, users: 98, bounceRate: 17.2, pageDepth: 2.4 });
    expect(parseMetrikaTrafficSources({
      data: [{ dimensions: [{ name: "Yandex" }], metrics: [72, 55] }],
    })).toEqual([{ label: "Yandex", visits: 72, users: 55 }]);
  });

  it("assigns actionable query opportunities", () => {
    expect(classifySearchOpportunity({ impressions: 100, ctr: 3, averagePosition: 2 })).toBe("Сниппет");
    expect(classifySearchOpportunity({ impressions: 100, ctr: 10, averagePosition: 9 })).toBe("Быстрый рост");
    expect(classifySearchOpportunity({ impressions: 100, ctr: 2, averagePosition: 31 })).toBe("Усилить страницу");
  });

  it("is SUPERADMIN-only and never serializes credentials or upstream errors", () => {
    const page = source("src/app/admin/marketing/page.tsx");
    const adapter = source("src/lib/search-marketing-data.ts");
    const nav = source("src/app/admin/admin-shell.tsx");
    expect(page).toContain('session?.user?.role !== "SUPERADMIN"');
    expect(page).toContain('data-testid="admin-marketing-page"');
    expect(nav).toContain('adminUrl("/admin/marketing")');
    expect(nav).toContain("superadminOnly: true");
    expect(adapter).not.toContain("error.message");
    expect(page).not.toContain("YANDEX_OAUTH_TOKEN");
    expect(page).not.toContain("YANDEX_WORDSTAT_API_KEY");
  });
});
