import fs from "node:fs";
import path from "node:path";
import { GET as llms } from "@/app/llms.txt/route";
import { GET as llmsFull } from "@/app/llms-full.txt/route";
import { homeAuthorityJsonLd, HOME_FAQS } from "@/lib/home-authority-content";
import { GET as mcpCard } from "@/app/.well-known/mcp/server-card.json/route";
import { GET as agentCard } from "@/app/.well-known/agent-card.json/route";
import { GET as skillsIndex } from "@/app/.well-known/agent-skills/index.json/route";
import { GET as skillArtifact } from "@/app/.well-known/agent-skills/understand-eterapy/SKILL.md/route";
import { GET as apiCatalog } from "@/app/.well-known/api-catalog/route";
import { GET as authMd } from "@/app/auth.md/route";
import { GET as agentAuth } from "@/app/agent/auth/route";
import { createHash } from "node:crypto";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B469 AI search readiness", () => {
  it("serves a concise llms.txt with canonical public resources", async () => {
    const response = llms();
    const body = await response.text();

    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body).toContain("# ETerapy");
    expect(body).toContain("https://eterapy.com/how-it-works");
    expect(body).toContain("https://eterapy.com/llms-full.txt");
    expect(body).toContain("not diagnosis, treatment, psychotherapy");
  });

  it("serves full definitions, decision rules, FAQ, and source policy", async () => {
    const response = llmsFull();
    const body = await response.text();

    expect(body).toContain("## Definitions");
    expect(body).toContain("## Decision rules");
    expect(body).toContain("## Frequently asked questions");
    expect(body).toContain("## Source and citation policy");
    expect(body).toContain("who.int");
  });

  it("keeps Article and FAQ schema aligned with visible server content", () => {
    const [article, faq] = homeAuthorityJsonLd();
    const component = source("src/components/landing/authority-article.tsx");
    const page = source("src/app/page.tsx");

    expect(article).toEqual(expect.objectContaining({
      "@type": "Article",
      author: expect.objectContaining({ name: "ETerapy" }),
      dateModified: "2026-07-16",
    }));
    expect(faq).toEqual(expect.objectContaining({
      "@type": "FAQPage",
      mainEntity: expect.arrayContaining([
        expect.objectContaining({ name: HOME_FAQS[0].question }),
      ]),
    }));
    expect(component).toContain("<article");
    expect(component).toContain("<table");
    expect(component).toContain("<details");
    expect(component).toContain("редакция ETerapy");
    expect(page).toContain("<HomeAuthorityArticle />");
    expect(page.indexOf("<HomeAuthorityArticle />")).toBeLessThan(page.indexOf("<ScenariosSection />"));
    expect(component).toContain("Коротко (TL;DR)");
    expect(component).toContain("Вывод и следующий шаг");
    expect(component).toContain("Что показывают данные платформы");
    expect(component).toContain("Разбор обобщённого случая");
    expect(component).toContain("Автор: редакция ETerapy");
  });

  it("publishes truthful agent discovery cards and a verifiable skill", async () => {
    const mcp = await mcpCard().json();
    const a2a = await agentCard().json();
    const index = await skillsIndex().json();
    const skill = await skillArtifact().text();
    const digest = `sha256:${createHash("sha256").update(skill).digest("hex")}`;

    expect(mcp).toEqual(expect.objectContaining({
      serverInfo: { name: "eterapy-public-info", version: "1.0.0" },
      transport: expect.objectContaining({ endpoint: "https://eterapy.com/mcp" }),
      authentication: { required: false },
    }));
    expect(a2a).toEqual(expect.objectContaining({
      name: "ETerapy Public Information Agent",
      supportedInterfaces: expect.arrayContaining([
        expect.objectContaining({ url: "https://eterapy.com/a2a", protocolBinding: "JSONRPC" }),
      ]),
    }));
    expect(index.$schema).toBe("https://schemas.agentskills.io/discovery/0.2.0/schema.json");
    expect(index.skills[0].digest).toBe(digest);
    expect(skill).toContain("Do not use this skill for diagnosis");
  });

  it("publishes API discovery and self-contained anonymous auth policy", async () => {
    const catalogResponse = apiCatalog();
    const catalog = await catalogResponse.json();
    const auth = await authMd().text();
    const profile = await agentAuth().json();
    const nextConfig = source("next.config.ts");
    const webMcp = source("src/components/landing/webmcp-registration.tsx");

    expect(catalogResponse.headers.get("content-type")).toContain("application/linkset+json");
    expect(catalog.linkset[0]).toEqual(expect.objectContaining({
      anchor: "https://eterapy.com/mcp",
      "service-desc": expect.any(Array),
      "service-doc": expect.any(Array),
      status: expect.any(Array),
    }));
    expect(auth).toContain("# ETerapy auth.md");
    // B469: identity_types_supported uses only the spec-recognized "anonymous"
    // value; OAuth client_credentials is advertised as an extension block.
    expect(auth).toContain('"register_uri": "https://eterapy.com/agent/oauth/register"');
    expect(auth).toContain('"identity_types_supported": ["anonymous"]');
    expect(auth).toContain('"claim_uri": "https://eterapy.com/agent/auth"');
    expect(auth).toContain('"oauth_client"');
    expect(profile).toEqual(expect.objectContaining({
      identity_type: "anonymous",
      credential_type: "none",
      token_issued: false,
      account_created: false,
      state_stored: false,
    }));
    expect(source("src/app/robots.txt/route.ts")).toContain(
      '"User-agent: *",\n    "Content-Signal: ai-train=no, search=yes, ai-input=no",',
    );
    expect(nextConfig).toContain('rel="api-catalog"');
    expect(source("src/app/mcp/route.ts")).toContain('"https://staging.eterapy.com"');
    expect(webMcp).toContain("navigator.modelContext.registerTool");
    expect(webMcp).toContain("cannot access accounts, personal questions, payments or health information");
  });
});
