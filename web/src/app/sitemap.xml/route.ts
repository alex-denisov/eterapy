import { canonicalUrl, hostKind, publicSeoRoutes } from "@/lib/seo";
import { approvedLibraryEntries } from "@/data/anonymous-library";
import db from "@/lib/db";

export const dynamic = "force-dynamic";

function xmlResponse(body: string, cacheControl = "public, max-age=3600") {
  return new Response(body, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": cacheControl,
    },
  });
}

export async function GET(request: Request) {
  const kind = hostKind(request.headers.get("host"));

  if (kind === "app" || kind === "admin") {
    return xmlResponse('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" />', "no-store");
  }

  const activePractitioners = await db.practitioner.findMany({
    where: { status: "ACTIVE" },
    select: { slug: true },
  }).catch(() => [] as Array<{ slug: string | null }>);

  const sitemapRoutes = [
    ...publicSeoRoutes,
    "/llms.txt",
    "/llms-full.txt",
    "/pricing.md",
    ...approvedLibraryEntries().map((entry) => `/library/${entry.slug}`),
    ...activePractitioners.filter((p) => p.slug).map((p) => `/practitioners/${p.slug}`),
  ];

  const urls = [...new Set(sitemapRoutes)].map((route) => [
    "  <url>",
    `    <loc>${canonicalUrl(route)}</loc>`,
    "    <changefreq>weekly</changefreq>",
    "    <priority>" + (route === "/" ? "1.0" : "0.7") + "</priority>",
    "  </url>",
  ].join("\n"));

  return xmlResponse([
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...urls,
    "</urlset>",
  ].join("\n"));
}
