import { createHash } from "crypto";
import { APP_URL } from "@/lib/env";
import { upsertMarketingSignal } from "@/lib/marketing/agent";

type PageAudit = {
  url: string;
  status: number;
  title: boolean;
  description: boolean;
  canonical: boolean;
  noindex: boolean;
};

function urlsFromSitemap(xml: string, origin: string) {
  return Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g), (match) => match[1].trim())
    .filter((url) => {
      try {
        const candidate = new URL(url);
        return candidate.origin === origin;
      } catch {
        return false;
      }
    })
    .slice(0, 100);
}

async function auditPage(url: string): Promise<PageAudit> {
  try {
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": "ETerapy-SEO-Monitor/1.0" },
      signal: AbortSignal.timeout(12_000),
    });
    const html = (await response.text()).slice(0, 500_000);
    return {
      url,
      status: response.status,
      title: /<title[^>]*>\s*[^<]{3,}\s*<\/title>/i.test(html),
      description: /<meta[^>]+name=["']description["'][^>]+content=["'][^"']{20,}/i.test(html)
        || /<meta[^>]+content=["'][^"']{20,}["'][^>]+name=["']description["']/i.test(html),
      canonical: /<link[^>]+rel=["']canonical["'][^>]+href=/i.test(html)
        || /<link[^>]+href=[^>]+rel=["']canonical["']/i.test(html),
      noindex: /<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(html),
    };
  } catch {
    return { url, status: 0, title: false, description: false, canonical: false, noindex: false };
  }
}

export async function runSeoAudit() {
  const base = new URL(APP_URL);
  const sitemapUrl = new URL("/sitemap.xml", base).toString();
  const sitemapResponse = await fetch(sitemapUrl, {
    headers: { "User-Agent": "ETerapy-SEO-Monitor/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!sitemapResponse.ok) {
    await upsertMarketingSignal({
      key: "seo:sitemap",
      kind: "SEO_AUDIT",
      severity: "INCIDENT",
      title: "Sitemap недоступен",
      summary: `${sitemapUrl} вернул HTTP ${sitemapResponse.status}`,
      evidence: { sitemapUrl, status: sitemapResponse.status },
    });
    return { checked: 0, failures: 1 };
  }
  const urls = urlsFromSitemap(await sitemapResponse.text(), base.origin);
  const results: PageAudit[] = [];
  for (let index = 0; index < urls.length; index += 5) {
    results.push(...await Promise.all(urls.slice(index, index + 5).map(auditPage)));
  }
  let failures = 0;
  for (const page of results) {
    const problems = [
      page.status !== 200 ? `HTTP ${page.status}` : null,
      !page.title ? "нет title" : null,
      !page.description ? "нет description" : null,
      !page.canonical ? "нет canonical" : null,
      page.noindex ? "noindex" : null,
    ].filter(Boolean);
    if (problems.length === 0) continue;
    failures += 1;
    const key = createHash("sha256").update(page.url).digest("hex").slice(0, 20);
    await upsertMarketingSignal({
      key: `seo:page:${key}`,
      kind: "SEO_AUDIT",
      severity: page.status === 0 || page.status >= 500 || page.noindex ? "INCIDENT" : "WARNING",
      title: `SEO-контроль: ${new URL(page.url).pathname}`,
      summary: problems.join(", "),
      evidence: page,
    });
  }
  return { checked: results.length, failures };
}

export const seoMonitorTestables = { urlsFromSitemap };
