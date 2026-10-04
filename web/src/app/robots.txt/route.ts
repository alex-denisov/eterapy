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
    // B751 — решение владельца 2026-10-05: обучение разрешено, цитирование и
    // поиск тоже. Нас должны находить, индексировать и использовать ассистенты;
    // запрет обучения (решение B701 2026-08-09) снят, потому что именованные
    // обучающие боты его и так не соблюдали бы — у них свои группы `Allow: /`,
    // и политика в файле расходилась сама с собой.
    "Content-Signal: ai-train=yes, search=yes, ai-input=yes",
    "Allow: /",
    ...PRIVATE_PATHS.flatMap((path) => [`Disallow: ${path}`, `Disallow: ${path}/`]),
    "",
    `Host: ${seoHosts.main}`,
    `Sitemap: ${seoOrigins.main}/sitemap.xml`,
    `# LLM content map: ${seoOrigins.main}/llms.txt`,
    `# Machine-readable pricing: ${seoOrigins.main}/pricing.md`,
    "",
  ].join("\n"));
}
