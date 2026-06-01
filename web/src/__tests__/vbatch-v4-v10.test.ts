import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("V4 — admin/reviews compact paginated table with in-row actions + edit", () => {
  const manager = read("src/app/admin/reviews/reviews-manager.tsx");

  it("renders a table paginated at 25 rows with searchable practitioner filter", () => {
    expect(manager).toContain("const PAGE_SIZE = 25");
    expect(manager).toContain("<table");
    expect(manager).toContain('data-testid="reviews-filter-practitioner-search"');
    expect(manager).toContain("practitionerQuery");
    // alphabetical dropdown retained
    expect(manager).toContain('localeCompare(b[1], "ru")');
    expect(manager).toContain("Страница");
  });

  it("keeps per-row Publish/Hide/Delete and adds Edit (redaction) inside the table", () => {
    expect(manager).toContain('data-testid="admin-review-row"');
    expect(manager).toContain("Опубликовать");
    expect(manager).toContain("Скрыть");
    expect(manager).toContain("Удалить");
    expect(manager).toContain("Изменить");
    expect(manager).toContain("function saveText");
    expect(manager).toContain('JSON.stringify({ text: next })');
  });

  it("the reviews API accepts an edited text alongside status", () => {
    const api = read("src/app/api/admin/reviews/[id]/route.ts");
    expect(api).toContain("const rawText = (body as { text?: unknown }).text");
    expect(api).toContain("data.text");
    expect(api).toContain("text edited (redaction)");
  });
});

describe("V10 — client /credits surfaces paid recommendations", () => {
  const page = read("src/app/cabinet/credits/page.tsx");

  it("adds an always-visible paid CTA block (specialist session + balance top-up)", () => {
    expect(page).toContain('data-testid="credits-paid-recommendations"');
    expect(page).toContain('mainUrl("/practitioners")');
    expect(page).toContain("Записаться к специалисту");
    expect(page).toContain("Пополнить баланс");
  });
});
