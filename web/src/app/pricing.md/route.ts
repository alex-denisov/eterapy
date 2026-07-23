import { v5Products } from "@/lib/v5-products";
import { seoOrigins } from "@/lib/seo";

export const dynamic = "force-static";

export function GET() {
  const products = v5Products
    .filter((product) => product.tone !== "free")
    .map((product) => [
      `## ${product.name}`,
      `- Price: ${product.price}`,
      `- Credits: ${product.creditCost ? `${product.creditCost}` : "not applicable"}`,
      `- Result: ${product.result}`,
      `- Public page: ${seoOrigins.main}${product.route}`,
      "",
    ].join("\n"));

  const body = [
    "# Pricing — ETerapy",
    "",
    "Last reviewed: 2026-07-23",
    "Currency: RUB",
    "Primary reflection: free; no bank card is required to start.",
    `Canonical comparison: ${seoOrigins.main}/pricing/compare`,
    "",
    ...products,
    "## Important limits",
    "",
    "- Digital products provide informational or symbolic reflection, not diagnosis, treatment, professional advice, prediction, or guaranteed outcomes.",
    "- Live-practitioner prices are shown on each public practitioner profile and may differ from digital-product prices.",
    "- The checkout always shows the current payable price before confirmation; if this file and checkout differ, checkout is authoritative.",
    "",
  ].join("\n");

  return new Response(body, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=86400",
    },
  });
}
