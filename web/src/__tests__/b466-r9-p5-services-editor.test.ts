import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9 «Ещё» → Услуги и направления (mockup practitioner-more-services).
// pcab-native мобильный редактор таксономии (специализация → направления → темы)
// + форматов сессий. НЕ обёртка десктопных PractitionerTaxonomyFields/
// SessionFormatsField (другой дизайн-язык). Сохраняет через JSON PATCH
// /api/practitioner/profile ТОЛЬКО таксономию — partial-safe маршрут не трогает
// title/bio/experience/languages/avatar. Цены/длительности — в «Календарь →
// Доступность» (гласит note макета).

const PRAC = "src/app/cabinet/practitioner";

describe("R9 «Ещё» → Услуги — mobile pcab editor", () => {
  const editor = () => source(`${PRAC}/services/services-editor-mobile.tsx`);

  it("renders a dedicated pcab mobile screen with its own «Сохранить» topbar", () => {
    const src = editor();
    expect(src).toContain('data-testid="practitioner-services-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toMatch(/pcab-screen[^"]*md:hidden/);
    expect(src).toContain("pcab-save-link");
    expect(src).toContain('data-testid="practitioner-services-save-mobile"');
    expect(src).toContain("Услуги и направления");
  });

  it("Специализация: cat-row opens a picker over the real CATEGORIES with direction pruning", () => {
    const src = editor();
    expect(src).toContain('data-testid="practitioner-services-cat-row"');
    expect(src).toContain('data-testid="practitioner-services-cat-picker"');
    expect(src).toContain("CATEGORIES.map");
    // снятие категории отцепляет её направления (categoryIdForDirection guard).
    expect(src).toContain("categoryIdForDirection");
  });

  it("Направления: committed chips with remove + «+ добавить» picker scoped to categories", () => {
    const src = editor();
    expect(src).toContain("directionsForCategories");
    expect(src).toContain("directionLabel");
    expect(src).toContain('data-testid="practitioner-services-dir-add"');
    expect(src).toContain('data-testid="practitioner-services-dir-picker"');
    expect(src).toContain("addDirection");
    expect(src).toContain("removeDirection");
    expect(src).toContain("pcab-svc-chip on"); // выбранное направление = терракотовый .on-чип
  });

  it("Темы: removable chips + suggested picker + free-text add", () => {
    const src = editor();
    expect(src).toContain("tasksForCategories");
    expect(src).toContain('data-testid="practitioner-services-task-add"');
    expect(src).toContain('data-testid="practitioner-services-task-picker"');
    expect(src).toContain("commitTaskDraft");
    expect(src).toContain("removeTask");
    expect(src).toContain("pcab-svc-addbtn"); // собственная кнопка (не конфликтный pcab-step)
  });

  it("Форматы: a toggle per real SESSION_FORMATS entry", () => {
    const src = editor();
    expect(src).toContain("SESSION_FORMATS.map");
    expect(src).toContain("pcab-toggle");
    expect(src).toContain("toggleFormat");
    expect(src).toContain('role="switch"');
    expect(src).toContain("practitioner-services-format-");
  });

  it("saves ONLY taxonomy via JSON PATCH (partial-safe: never sends title/bio/languages)", () => {
    const src = editor();
    expect(src).toContain('method: "PATCH"');
    expect(src).toContain('"Content-Type": "application/json"');
    // зеркалим эзотерические направления в legacy Specialty enum
    expect(src).toContain("specialties: specialtiesForDirections(directions)");
    // тело PATCH не содержит профильных ключей → не может их затереть
    // (проверяем ключи объекта, а не упоминания в комментарии).
    expect(src).not.toContain("bio:");
    expect(src).not.toContain("languages:");
    expect(src).not.toContain("experience:");
    expect(src).not.toContain("title:");
  });

  it("keeps prices out of this screen and points to «Календарь → Доступность»", () => {
    const src = editor();
    expect(src).toContain("pcab-note");
    expect(src).toContain("Календарь");
    expect(src).toContain("Доступность");
  });
});

describe("R9 «Ещё» → Услуги — page split", () => {
  const page = () => source(`${PRAC}/services/page.tsx`);

  it("renders the pcab editor on mobile and the тарифы/acquisition desktop tree hidden below md", () => {
    const src = page();
    expect(src).toContain("PractitionerServicesEditorMobile");
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-services-desktop"');
    // мобильный редактор получает живую таксономию практика
    expect(src).toContain("categories: practitioner.categories");
    expect(src).toContain("formats: practitioner.formats");
  });
});
