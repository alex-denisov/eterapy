import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const PRAC = "src/app/cabinet/practitioner";

// B466 R9-5 desktop — Профиль по approved -profile-v2: 2-колоночная раскладка
// (карточка-редактор личных полей + «Статус и проверки»); таксономия/форматы
// переехали на «Услуги» (mockup показывает их там), профиль их лишь pass-through.

describe("R9-5 desktop profile — 2-column layout + «Статус и проверки»", () => {
  const page = () => source(`${PRAC}/profile/page.tsx`);

  it("keeps the desktop testid and renders a 2-column grid with the status card", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-profile-page"');
    expect(src).toContain("lg:grid-cols-[1.5fr_1fr]");
    expect(src).toContain('data-testid="practitioner-profile-status"');
    expect(src).toContain("Статус и проверки");
  });

  it("status card links to Верификация and «Услуги и направления»", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-profile-verification-row"');
    expect(src).toContain("/practitioner/verification");
    expect(src).toContain('data-testid="practitioner-profile-services-row"');
    expect(src).toContain("/practitioner/services");
    expect(src).toContain("servicesSummary"); // категория · N направлений
    expect(src).toContain("verified={practitioner.verified}"); // verif-чип в редакторе
  });
});

describe("R9-5 desktop profile — editor card is personal fields only", () => {
  const editor = () => source(`${PRAC}/profile/profile-editor.tsx`);

  it("renders photo + verif-chip + public link + personal fields", () => {
    const src = editor();
    expect(src).toContain('data-testid="practitioner-profile-editor-desktop"');
    expect(src).toContain("Профиль подтверждён");
    expect(src).toContain('data-testid="practitioner-profile-public"');
    for (const t of [
      "practitioner-profile-name",
      "practitioner-profile-title",
      "practitioner-profile-bio",
      "practitioner-profile-experience",
    ]) {
      expect(src).toContain(`data-testid="${t}"`);
    }
    expect(src).toContain("readOnly"); // Имя — read-only (меняется в настройках)
  });

  it("no longer embeds the taxonomy/session-formats editors (moved to «Услуги»)", () => {
    const src = editor();
    expect(src).not.toContain("PractitionerTaxonomyFields");
    expect(src).not.toContain("SessionFormatsField");
    expect(src).not.toContain("Специализация и задачи");
    // но всё ещё сохраняет их значения через pass-through
    expect(src).toContain('formData.append("formats"');
    expect(src).toContain("specialtiesForDirections");
  });
});

describe("R9-5 desktop profile — session formats relocated to «Услуги»", () => {
  it("services page renders the formats editor with autosave", () => {
    const editorSrc = source(`${PRAC}/services/services-formats-editor.tsx`);
    expect(editorSrc).toContain("SessionFormatsField");
    expect(editorSrc).toContain("/api/practitioner/profile");
    expect(editorSrc).toContain('data-testid="practitioner-services-formats"');
    const page = source(`${PRAC}/services/page.tsx`);
    expect(page).toContain("<ServicesFormatsEditor");
    expect(page).toContain("Форматы сессий");
  });
});
