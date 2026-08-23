import { canonicalUrl, hostKind, publicSeoRoutes } from "@/lib/seo";
import { indexableLibraryEntries } from "@/data/anonymous-library";
import { resolvedCells } from "@/lib/astro/cells";
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
    /**
     * B714 — в карту сайта идут только записи, прошедшие гейт глубины.
     *
     * До 2026-08-17 сюда попадали все 199 карточек, и именно это профилировало
     * хост как ферму шаблонов: 199 адресов из 251 по ≈60 уникальных слов.
     * Люди по-прежнему видят весь каталог — `approvedLibraryEntries()`.
     */
    ...indexableLibraryEntries().map((entry) => `/library/${entry.slug}`),
    // B711 · Ячейки расчётной сетки «планета × знак». Список растёт волнами и
    // берётся из корпуса, а не переписывается сюда руками: выложенная ячейка,
    // забытая в карте сайта, ждала бы обхода месяцами.
    ...resolvedCells().map((cell) => cell.path),
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
