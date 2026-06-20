import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("N1 — cabinet support page fixes", () => {
  const form = source("src/components/support/complaint-form.tsx");
  const chat = source("src/components/support/support-chat.tsx");

  it("collapses the complaint form behind a trigger (N1a)", () => {
    expect(form).toContain("cabinet-support-complaint-trigger");
    expect(form).toContain("const [open, setOpen] = useState(false)");
  });

  it("uses a bordered field for the category select + textarea, not the hero input (N1b/N1c)", () => {
    expect(form).not.toContain("soft-question-input");
    expect(form).toContain("FIELD_CLASS");
    expect(form).toContain("cabinet-support-complaint-counter");
    expect(chat).not.toContain("soft-question-input");
  });

  it("uses support@eterapy.com everywhere (N1e)", () => {
    expect(source("src/app/cabinet/support/page.tsx")).toContain("mailto:support@eterapy.com");
    expect(source("src/app/admin/support/page.tsx")).toContain("mailto:support@eterapy.com");
    expect(source("src/app/cabinet/support/page.tsx")).not.toContain("hello@eterapy.com");
  });
});

describe("N5/N7/N8 — header", () => {
  const header = source("src/components/header.tsx");

  it("logged-in help icon always routes to cabinet support (N5a)", () => {
    expect(header).toContain('href={appUrl("/support")}');
    expect(header).not.toContain('href={isAppArea ? appUrl("/support") : mainUrl("/help")}');
  });

  it("public /help keeps the landing nav (N7)", () => {
    expect(header).not.toContain('pathname.startsWith("/help") || isAppHost');
  });

  it("keeps the header CTA focused on one client dialogue action (N8)", () => {
    expect(header).not.toContain("header-deepen-cta");
    expect(header).not.toContain("Разобрать глубже");
    expect(header).toContain("header-credits-topup");
  });
});

describe("N6 — /help content + pagination", () => {
  const help = source("src/app/help/page.tsx");

  it("renames Safety to Russian + adds an account category", () => {
    expect(help).not.toContain('"Safety"');
    expect(help).toContain("Безопасность и кризис");
    expect(help).toContain('["account", "Аккаунт и кабинет"]');
  });

  it("ships ~100+ Q&A entries", () => {
    const count = (help.match(/cat:\s*"/g) ?? []).length;
    expect(count).toBeGreaterThanOrEqual(100);
  });

  it("paginates 10-at-a-time behind «Еще» (N6)", () => {
    expect(help).toContain("const PAGE_STEP = 10");
    expect(help).toContain("help-show-more");
    expect(help).toContain("setVisibleCount((c) => c + PAGE_STEP)");
    expect(help).toContain("source.slice(0, visibleCount)");
  });
});

describe("B380 — /help opens with curated top questions", () => {
  const help = source("src/app/help/page.tsx");

  it("defines a curated set of 10-15 top question ids", () => {
    expect(help).toContain("const TOP_FAQ_IDS");
    const block = help.slice(help.indexOf("const TOP_FAQ_IDS"));
    const ids = (block.slice(0, block.indexOf("]")).match(/"[a-z0-9]+"/g) ?? []).length;
    expect(ids).toBeGreaterThanOrEqual(10);
    expect(ids).toBeLessThanOrEqual(15);
  });

  it("shows the curated set by default and lets the visitor open the full list", () => {
    expect(help).toContain("const isTopView");
    expect(help).toContain('"help-featured"');
    expect(help).toContain("help-show-all");
    expect(help).toContain("setShowAll(true)");
    expect(help).toContain("Популярные вопросы");
  });
});

describe("B380 / B431 — /legal/privacy human-readable summary", () => {
  // B431 (M28): privacy now renders via the dynamic /legal/[doc] route; the
  // plain-language summary is preserved as a registry intro shown above the text.
  const route = source("src/app/legal/[doc]/page.tsx");
  const registry = source("src/lib/legal/registry.ts");
  const pack = source("src/content/legal-pack.md");

  it("renders a plain-language summary above the legal text", () => {
    expect(registry).toContain("Коротко и по-человечески");
    expect(route).toContain("LEGAL_DOC_INTROS");
    expect(route).toContain("legal-summary");
    // The summary block renders before the document body.
    expect(route.indexOf("legal-summary")).toBeLessThan(route.indexOf("<LegalMarkdown"));
  });

  it("keeps removed M26 products out of the legal pack", () => {
    expect(pack).not.toContain("Круг близких");
    expect(pack).not.toContain("Моя карта");
  });
});
