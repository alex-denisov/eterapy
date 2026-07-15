import { seoOrigins } from "@/lib/seo";

export const dynamic = "force-static";

export function GET() {
  return Response.json({
    linkset: [
      {
        anchor: `${seoOrigins.main}/mcp`,
        "service-desc": [{ href: `${seoOrigins.main}/openapi.json`, type: "application/openapi+json" }],
        "service-doc": [{ href: `${seoOrigins.main}/agent-docs`, type: "text/markdown" }],
        status: [{ href: `${seoOrigins.main}/api/health`, type: "application/json" }],
      },
    ],
  }, {
    headers: {
      "Content-Type": "application/linkset+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
