/**
 * B657 — `/ai-psychologist` связана с сайтом.
 *
 * Диагноз B470 от 2026-08-04: страница, несущая ЕДИНСТВЕННЫЙ кластер, в
 * котором сайт реально ранжируется («ии психолог» — 13 380 показов в месяц,
 * позиции 1–16, оба клика сайта за 30 дней), не имела ни одной внутренней
 * ссылки. Для поисковика страница без входящих ссылок — страница без веса.
 *
 * Прогон держит именно то обещание, которое легко потерять при следующей
 * правке лендинга: ссылки существуют и их несколько, а не «была одна и ушла
 * вместе с блоком». Проверяем ИСХОДНИКИ, потому что дефект был именно
 * структурный — grep по дереву не находил ни одного вхождения.
 */

import fs from "node:fs";
import path from "node:path";

const read = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

const ROUTE = "/ai-psychologist";

// Каждый источник ссылки — отдельная поверхность сайта. Подвал даёт сквозной
// вес со всех страниц, остальные три — тематическую близость.
const INBOUND_SOURCES: ReadonlyArray<readonly [string, string]> = [
  ["подвал (сквозная ссылка со всех страниц)", "src/components/footer.tsx"],
  ["главная, блок «как это работает»", "src/components/landing/how-it-works.tsx"],
  ["каталог форматов", "src/app/products/page.tsx"],
  ["страница «Как работает ETerapy»", "src/app/how-it-works/page.tsx"],
];

describe("B657 · входящие ссылки на /ai-psychologist", () => {
  it.each(INBOUND_SOURCES)("%s ведёт на страницу", (_label, file) => {
    expect(read(file)).toContain(ROUTE);
  });

  it("источников больше одного — потеря одного блока не обнуляет вес", () => {
    const alive = INBOUND_SOURCES.filter(([, file]) => read(file).includes(ROUTE));
    expect(alive.length).toBeGreaterThanOrEqual(3);
  });

  it("страница ведёт дальше по сайту, а не только на форму разбора", () => {
    const page = read("src/app/ai-psychologist/page.tsx");
    // До правки все ссылки страницы шли в /checkin и в юридический блок:
    // вес приходил и упирался в тупик.
    for (const href of ["/library", "/practitioners", "/how-it-works"]) {
      expect(page).toContain(`href="${href}"`);
    }
  });
});

describe("B657 · подпись в панели маркетинга больше не врёт", () => {
  it("устаревшее «одна страница из 208» снято", () => {
    const panel = read("src/app/admin/marketing/page.tsx");
    expect(panel).not.toContain("одна страница из 208");
  });

  it("подпись не пересказывает разовый замер числом", () => {
    // B697: прежняя проверка требовала в тексте «213» — число замера от
    // 2026-08-04. Так подпись снова становилась утверждением с датой годности,
    // ровно того рода, что B657 и снимал. Живое значение показывает карточка
    // «Страниц в поиске», а не абзац.
    const panel = read("src/app/admin/marketing/page.tsx");
    const paragraph = panel.slice(panel.indexOf("Блоки выше собираются"), panel.indexOf("</p>"));
    expect(paragraph).not.toMatch(/\d{3}/);
    expect(panel).toContain('label="Страниц в поиске"');
  });
});
