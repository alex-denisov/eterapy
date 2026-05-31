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

  it("adds the client-only «Разобрать глубже» service CTA (N8)", () => {
    expect(header).toContain("header-deepen-cta");
    expect(header).toContain('data-analytics-event="deepening_option_clicked"');
    expect(header).toContain("Разобрать глубже");
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
    expect(help).toContain("const visible = filtered.slice(0, visibleCount)");
  });
});
