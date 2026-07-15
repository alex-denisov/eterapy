import { hostKind, seoHosts, seoOrigins } from "@/lib/seo";

export const dynamic = "force-dynamic";

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-SearchBot",
  "Claude-User",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "cohere-ai",
] as const;

const PRIVATE_PATHS = ["/admin", "/api", "/cabinet", "/dashboard", "/session"] as const;

function crawlerRules(userAgent: string) {
  return [
    `User-agent: ${userAgent}`,
    "Allow: /",
    ...PRIVATE_PATHS.flatMap((path) => [`Disallow: ${path}`, `Disallow: ${path}/`]),
    "",
  ];
}

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
    ...AI_CRAWLERS.flatMap(crawlerRules),
    "User-agent: *",
    "Content-Signal: ai-train=no, search=yes, ai-input=no",
    "Allow: /",
    ...PRIVATE_PATHS.flatMap((path) => [`Disallow: ${path}`, `Disallow: ${path}/`]),
    "",
    `Host: ${seoHosts.main}`,
    `Sitemap: ${seoOrigins.main}/sitemap.xml`,
    `# LLM content map: ${seoOrigins.main}/llms.txt`,
    "",
  ].join("\n"));
}
