import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9 «Ещё» → Профиль (mockup practitioner-more-profile). Мобильный редактор
// публичных данных практика (фото/имя/специализация/о себе/языки/опыт + nav-строка
// «Верификация» + топбар со «Сохранить»). Паттерн editor-variant: тот же shared
// handleSave, что и десктоп; mobile-вариант правит title/bio/experience, а
// categories/directions/formats/tags/languages уходят НЕИЗМЕНЁННЫМИ из initialData
// (PATCH partial-safe не затирает таксономию — её правят на «Услуги»).
// Имя — read-only (задаётся в аккаунте; редактор его не персистит).

const PRAC = "src/app/cabinet/practitioner";

describe("R9 «Ещё» → Профиль — mobile editor variant", () => {
  const editor = () => source(`${PRAC}/profile/profile-editor.tsx`);

  it("renders a dedicated pcab mobile screen with its own «Сохранить» topbar", () => {
    const src = editor();
    expect(src).toContain('variant === "pcab"');
    expect(src).toContain('data-testid="practitioner-profile-mobile"');
    expect(src).toContain("data-pcab-top");
    // «Сохранить» в топбаре = submit (мокап рисует save-link в топбаре).
    expect(src).toContain("pcab-save-link");
    expect(src).toContain('data-testid="practitioner-profile-save-mobile"');
    expect(src).toMatch(/pcab-screen[^"]*md:hidden/);
  });

  it("renders the mockup photo row: gradient avatar + camera + verif chip + public link", () => {
    const src = editor();
    expect(src).toContain("pcab-pf-photorow");
    expect(src).toContain("pcab-pf-photo");
    expect(src).toContain("pcab-pf-cam"); // камера-бейдж = загрузка фото (реюз fileRef)
    expect(src).toContain("pcab-pf-verif");
    expect(src).toContain('data-testid="practitioner-profile-public-mobile"');
    expect(src).toContain("Открыть публичную страницу");
  });

  it("edits title/bio/experience; name is read-only; languages are display chips", () => {
    const src = editor();
    expect(src).toContain('data-testid="practitioner-profile-title-mobile"');
    expect(src).toContain('data-testid="practitioner-profile-bio-mobile"');
    expect(src).toContain('data-testid="practitioner-profile-experience-mobile"');
    // Имя — read-only (честно: редактор не меняет имя аккаунта, как и десктоп).
    expect(src).toMatch(/value=\{initialData\.name\}[\s\S]*?readOnly/);
    expect(src).toContain('data-testid="practitioner-profile-name-mobile"');
    expect(src).toContain("languages.map");
  });

  it("routes to Верификация via a reused pcab list nav-row", () => {
    const src = editor();
    expect(src).toContain("pcab-pf-navrow");
    expect(src).toContain('data-testid="practitioner-profile-verification-mobile"');
    expect(src).toContain("verificationHref");
  });

  it("shares one handleSave that re-sends taxonomy/formats unchanged (no data loss) and never persists name", () => {
    const src = editor();
    // Общий обработчик шлёт ВЕСЬ стейт → мобильный save не затирает таксономию.
    expect(src).toContain('formData.append("categories"');
    expect(src).toContain('formData.append("directions"');
    expect(src).toContain('formData.append("formats"');
    expect(src).toContain('formData.append("languages"');
    // Имя не отправляется на сервер (read-only, персистится в аккаунте).
    expect(src).not.toContain('formData.append("name"');
  });
});

describe("R9 «Ещё» → Профиль — page split", () => {
  const page = () => source(`${PRAC}/profile/page.tsx`);

  it("renders the pcab editor on mobile and the previous desktop tree hidden below md", () => {
    const src = page();
    expect(src).toContain('variant="pcab"');
    expect(src).toContain("verified={practitioner.verified}");
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-profile-page"'); // прежний десктоп-testid
  });

  it("builds initialData once and reuses it for both trees (no duplicated inline object)", () => {
    const src = page();
    expect(src).toContain("const editorInitialData");
    // объект передан обоим инстансам редактора
    expect(src.match(/initialData=\{editorInitialData\}/g)?.length).toBe(2);
  });
});
