import { seoMonitorTestables } from "@/lib/marketing/seo-monitor";

describe("B552 · production SEO monitor", () => {
  it("audits only same-origin sitemap URLs", () => {
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

  it("does not silently truncate a normal sitemap after one hundred URLs", () => {
    const xml = [
      "<urlset>",
      ...Array.from(
        { length: 150 },
        (_, index) => `<url><loc>https://eterapy.com/library/page-${index + 1}</loc></url>`,
      ),
      "</urlset>",
    ].join("");

    expect(
      seoMonitorTestables.urlsFromSitemap(xml, "https://eterapy.com"),
    ).toHaveLength(150);
  });

  it("does not demand HTML metadata from healthy machine-readable resources", () => {
    expect(seoMonitorTestables.pageProblems({
      url: "https://eterapy.com/llms.txt",
      status: 200,
      contentType: "text/plain; charset=utf-8",
      title: false,
      description: false,
      canonical: false,
      noindex: false,
    })).toEqual([]);
  });

  it("still checks HTML metadata and availability for every content type", () => {
    expect(seoMonitorTestables.pageProblems({
      url: "https://eterapy.com/library",
      status: 200,
      contentType: "text/html; charset=utf-8",
      title: true,
      description: false,
      canonical: false,
      noindex: false,
    })).toEqual(["нет description", "нет canonical"]);
    expect(seoMonitorTestables.pageProblems({
      url: "https://eterapy.com/llms.txt",
      status: 503,
      contentType: "text/plain",
      title: false,
      description: false,
      canonical: false,
      noindex: false,
    })).toEqual(["HTTP 503"]);
  });
});
