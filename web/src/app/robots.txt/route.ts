import { hostKind, seoHosts, seoOrigins } from "@/lib/seo";

export const dynamic = "force-dynamic";

function textResponse(body: string) {
  return new Response(body, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}

export function GET(request: Request) {
  const kind = hostKind(request.headers.get("host"));

  if (kind === "app" || kind === "admin") {
    return textResponse([
      "User-agent: *",
      "Disallow: /",
      "",
    ].join("\n"));
  }

  return textResponse([
    "User-agent: *",
    "Allow: /",
    "Disallow: /admin",
    "Disallow: /admin/",
    "Disallow: /api",
    "Disallow: /api/",
    "Disallow: /cabinet",
    "Disallow: /cabinet/",
    "Disallow: /dashboard",
    "Disallow: /dashboard/",
    "Disallow: /session",
    "Disallow: /session/",
    "",
    `Host: ${seoHosts.main}`,
    `Sitemap: ${seoOrigins.main}/sitemap.xml`,
    "",
  ].join("\n"));
}
