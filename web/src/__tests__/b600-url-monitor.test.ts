import { urlMonitorTestables } from "@/lib/marketing/url-monitor";

describe("B600 · live URL monitoring", () => {
  const healthy = {
    path: "/library/example",
    status: 200,
    finalUrl: "https://eterapy.com/library/example",
    redirectCount: 0,
    inSitemap: true,
    trafficTouches: 3,
    checkedAt: "2026-07-28T12:00:00.000Z",
  };

  it("accepts a healthy registry URL", () => {
    expect(urlMonitorTestables.problems(healthy, false)).toEqual([]);
  });

  it("reports availability, redirect-chain and sitemap failures", () => {
    expect(urlMonitorTestables.problems({
      ...healthy,
      status: 503,
      redirectCount: 2,
      inSitemap: false,
    }, false)).toEqual(["HTTP 503", "цепочка из 2 редиректов", "нет в sitemap"]);
  });

  it("treats an intentional retired 404 as healthy", () => {
    expect(urlMonitorTestables.problems({
      ...healthy,
      path: "/products/retired",
      status: 404,
      inSitemap: false,
    }, true)).toEqual([]);
  });

  it("keeps only same-origin sitemap paths", () => {
    expect(urlMonitorTestables.sitemapPaths(
      "<urlset><url><loc>https://eterapy.com/library/a</loc></url><url><loc>https://evil.test/a</loc></url></urlset>",
      "https://eterapy.com",
    )).toEqual(new Set(["/library/a"]));
  });

  it("normalizes publication destinations and rejects foreign URLs", () => {
    expect(urlMonitorTestables.marketingPathFromUrl(
      "https://eterapy.com/library/a?utm_source=telegram",
      "https://eterapy.com",
    )).toBe("/library/a");
    expect(urlMonitorTestables.marketingPathFromUrl(
      "https://attacker.test/library/a",
      "https://eterapy.com",
    )).toBeNull();
  });
});
