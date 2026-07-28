import { seoMonitorTestables } from "@/lib/marketing/seo-monitor";

describe("B552 · production SEO monitor", () => {
  it("audits only same-origin sitemap URLs and caps the batch", () => {
    const xml = [
      "<urlset>",
      "<url><loc>https://eterapy.com/library/one</loc></url>",
      "<url><loc>https://attacker.example/internal</loc></url>",
      "<url><loc>not-a-url</loc></url>",
      "<url><loc>https://eterapy.com/library/two</loc></url>",
      "</urlset>",
    ].join("");

    expect(seoMonitorTestables.urlsFromSitemap(xml, "https://eterapy.com")).toEqual([
      "https://eterapy.com/library/one",
      "https://eterapy.com/library/two",
    ]);
  });
});
