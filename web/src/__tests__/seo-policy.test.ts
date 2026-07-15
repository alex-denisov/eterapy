import { GET as robotsTxt } from "@/app/robots.txt/route";
import { GET as sitemapXml } from "@/app/sitemap.xml/route";
import { createPublicPageMetadata, jsonLdForPublicPage, publicPageSeo } from "@/lib/public-page-seo";
import { canonicalUrl, publicSeoRoutes, shouldNoIndex } from "@/lib/seo";

function requestFor(host: string, pathname = "/robots.txt") {
  return new Request(`https://${host}${pathname}`, {
    headers: { host },
  });
}

describe("v5 SEO routing policy", () => {
  it("allows public indexing only on the main domain robots.txt", async () => {
    const response = robotsTxt(requestFor("eterapy.com"));
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("Allow: /");
    expect(body).toContain("Disallow: /cabinet");
    expect(body).toContain("Disallow: /admin");
    expect(body).toContain("Sitemap: https://eterapy.com/sitemap.xml");
    expect(body).toContain("User-agent: GPTBot");
    expect(body).toContain("User-agent: ClaudeBot");
    expect(body).toContain("User-agent: PerplexityBot");
    expect(body).toContain("# LLM content map: https://eterapy.com/llms.txt");
  });

  it.each(["app.eterapy.com", "admin.eterapy.com"])("blocks all crawlers on %s", async (host) => {
    const response = robotsTxt(requestFor(host));
    const body = await response.text();

    expect(body.trim()).toBe(["User-agent: *", "Disallow: /"].join("\n"));
  });

  it("emits only canonical public URLs in the main sitemap", async () => {
    const response = await sitemapXml(requestFor("eterapy.com", "/sitemap.xml"));
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("application/xml");
    expect(body).toContain("<loc>https://eterapy.com/</loc>");
    expect(body).toContain("<loc>https://eterapy.com/checkin</loc>");
    expect(body).not.toContain("<loc>https://eterapy.com/all-modalities/checkin</loc>");
    expect(body).not.toContain("<loc>https://eterapy.com/all-modalities/tarot</loc>");
    expect(body).not.toContain("<loc>https://eterapy.com/all-modalities/horoscope</loc>");
    expect(body).not.toContain("app.eterapy.com");
    expect(body).not.toContain("admin.eterapy.com");
    expect(body).not.toContain("/cabinet");
    expect(body).not.toContain("/api");
    expect(body).not.toContain("/modalities");
    expect(body).not.toContain("/tools");

    for (const route of publicSeoRoutes) {
      expect(body).toContain(`<loc>${canonicalUrl(route)}</loc>`);
    }
  });

  it.each(["app.eterapy.com", "admin.eterapy.com"])("returns an empty sitemap on %s", async (host) => {
    const response = await sitemapXml(requestFor(host, "/sitemap.xml"));
    const body = await response.text();

    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(body).not.toContain("<loc>");
  });

  it("marks app, admin, and protected paths as noindex", () => {
    expect(shouldNoIndex("app.eterapy.com", "/")).toBe(true);
    expect(shouldNoIndex("admin.eterapy.com", "/admin")).toBe(true);
    expect(shouldNoIndex("eterapy.com", "/cabinet/billing")).toBe(true);
    expect(shouldNoIndex("eterapy.com", "/admin/users")).toBe(true);
    expect(shouldNoIndex("eterapy.com", "/all-modalities/checkin")).toBe(false);
  });

  it("keeps metadata and JSON-LD defined for every sitemap route", () => {
    for (const route of publicSeoRoutes) {
      const metadata = createPublicPageMetadata(route);
      const jsonLd = jsonLdForPublicPage(route);

      expect(publicPageSeo[route].title.length).toBeGreaterThan(10);
      expect(publicPageSeo[route].description.length).toBeGreaterThan(40);
      expect(metadata.alternates?.canonical).toBe(canonicalUrl(route));
      expect(metadata.openGraph).toEqual(expect.objectContaining({
        title: publicPageSeo[route].title,
        description: publicPageSeo[route].description,
        url: canonicalUrl(route),
      }));
      // B390: каждая публичная страница отдаёт брендовую OG-картинку.
      expect(Array.isArray(metadata.openGraph?.images) && metadata.openGraph.images.length > 0).toBe(true);
      expect(metadata.twitter).toEqual(expect.objectContaining({
        card: "summary_large_image",
        title: publicPageSeo[route].title,
      }));
      expect(jsonLd).toEqual(expect.objectContaining({
        "@context": "https://schema.org",
        name: publicPageSeo[route].title,
        description: publicPageSeo[route].description,
        url: canonicalUrl(route),
      }));
    }
  });
});
