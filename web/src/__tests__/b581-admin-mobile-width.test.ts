/**
 * B581 (owner 2026-07-26): «на мобильной версии суперадминка имеет плохую
 * вёрстку — элементы выходят за пределы экрана по ширине».
 *
 * Что было. Панель периода и валюты (`.soft-admin-sticky-controls`) несла
 * `max-width: min(54rem, calc(100vw - 19rem))`. Вычет 19rem — это ширина
 * сайдбара админки, но сайдбар существует только от 768px (`md:pl-64` на
 * shell). На 390px тот же вычет давал `max-width: 86px`, и он побеждал
 * мобильное `width: 100%`: панель сжималась в столбик шириной в одну кнопку,
 * прижималась к правому краю, а её содержимое (селектор валюты, курс, поля дат)
 * уезжало за экран. Достать его было нельзя — shell режет вылет `overflow-x:
 * clip`, поэтому даже горизонтального скролла не появлялось.
 *
 * Тест целится в ПРИЧИНУ, а не в симптом: вычет ширины сайдбара обязан жить
 * внутри брейкпоинта, на котором сайдбар есть.
 */
import fs from "node:fs";
import path from "node:path";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("B581 — панель админки не вылезает за мобильный экран", () => {
  const css = read("src/app/v4-soft.css");

  // Блок правил `.soft-admin-sticky-controls` целиком: от первого вхождения
  // селектора до следующего независимого селектора.
  const block = css.slice(
    css.indexOf(".soft-admin-sticky-controls"),
    css.indexOf(".soft-chart-tooltip-layer"),
  );

  it("вычитает ширину сайдбара только там, где сайдбар есть", () => {
    const sidebarClamp = "calc(100vw - 19rem)";
    expect(block).toContain(sidebarClamp);

    // Вычет должен стоять ПОСЛЕ открытия `@media (min-width: 768px)` —
    // то есть внутри него, а не в базовом правиле.
    const desktopMedia = block.indexOf("@media (min-width: 768px)");
    expect(desktopMedia).toBeGreaterThanOrEqual(0);
    expect(block.indexOf(sidebarClamp)).toBeGreaterThan(desktopMedia);
  });

  it("на мобильном снимает и ограничение ширины, и прижатие вправо", () => {
    const mobileMedia = block.indexOf("@media (max-width: 767px)");
    expect(mobileMedia).toBeGreaterThanOrEqual(0);
    const mobileRules = block.slice(mobileMedia);
    expect(mobileRules).toContain("width: 100%");
    // Без сброса `max-width` мобильное `width: 100%` остаётся зажатым
    // десктопным клампом — именно так баг и жил.
    expect(mobileRules).toContain("max-width: 100%");
    expect(mobileRules).toContain("margin-left: 0");
  });

  it("обёртка панели занимает всю ширину до брейкпоинта сайдбара", () => {
    const ui = read("src/app/admin/admin-analytics-ui.tsx");
    expect(ui).toContain("soft-admin-sticky-controls");
    expect(ui).toContain("w-full");
    expect(ui).toContain("md:w-fit");
    expect(ui).toContain("md:ml-auto");
  });

  it("меню выгрузки раскрывается внутрь экрана на узком вьюпорте", () => {
    // `right-0` + `min-w-56` у кнопки возле левого края уводило меню
    // за ЛЕВУЮ границу экрана (замерено: left = -19px).
    const menu = read("src/app/admin/finance/export-menu.tsx");
    expect(menu).toContain("left-0");
    expect(menu).toContain("sm:right-0");
    expect(menu).toContain("sm:left-auto");
  });
});
