/**
 * INC-078 — три семейства публичных маршрутов отдавали soft 404.
 *
 * Причина одна на всех: корневой `app/loading.tsx` создаёт Suspense-границу
 * для КАЖДОГО маршрута. Next начинает стримить и фиксирует HTTP 200 раньше,
 * чем серверный компонент дойдёт до `notFound()`. Показательно, что
 * `/legal/[doc]` объявляет `dynamicParams = false` и всё равно отдавал 200:
 * дело не в контракте маршрута, а в том, что ответ уже начат.
 *
 * Лечение: граница переехала с корня на сегменты. Тест держит инвариант,
 * который иначе вернётся первой же «просто добавим лоадер» правкой: над
 * маршрутом, который обязан уметь 404, не должно быть `loading.tsx` ни на
 * одном уровне выше.
 *
 * Проверено сборкой + prod-сервером 2026-07-26: `/legal/zzz` и
 * `/practitioners/zzz` — 404 (было 200), `/legal/terms` — 200.
 */
import fs from "node:fs";
import path from "node:path";

const APP = path.join(process.cwd(), "src", "app");

/** Сегменты маршрута от корня `app/` до файла страницы. */
function segmentsOf(routeDir: string): string[] {
  const parts = routeDir.split("/").filter(Boolean);
  return parts.map((_, i) => path.join(APP, ...parts.slice(0, i + 1)));
}

function hasLoading(dir: string): boolean {
  return fs.existsSync(path.join(dir, "loading.tsx")) || fs.existsSync(path.join(dir, "loading.js"));
}

/**
 * Маршруты, чей 404 приходит из `notFound()` внутри страницы. Именно им
 * граница выше по дереву ломает статус: ответ уже начат.
 */
const NOT_FOUND_FROM_PAGE = ["practitioners/[slug]", "p/[slug]", "legal/[doc]"];

/**
 * Маршруты, чей 404 выставляет proxy ДО начала стрима, сверяя слаг со
 * статическим списком (B373 для продуктов, INC-076 для библиотеки). Им
 * граница загрузки не мешает — и `/products` она нужна по CLS.
 */
const NOT_FOUND_FROM_PROXY = ["library/[slug]", "products/[slug]"];

describe("INC-078 · граница загрузки не мешает статусу 404", () => {
  it("на корне app/ границы загрузки нет", () => {
    expect(hasLoading(APP)).toBe(false);
  });

  it.each(NOT_FOUND_FROM_PAGE)("над %s нет loading.tsx ни на одном уровне", (route) => {
    // Сам сегмент [slug] тоже проверяем: граница в нём ломает ровно так же.
    const offenders = segmentsOf(route).filter((dir) => fs.existsSync(dir) && hasLoading(dir));
    expect(offenders.map((d) => path.relative(APP, d))).toEqual([]);
  });

  it.each(NOT_FOUND_FROM_PROXY)("%s 404-ится в proxy, поэтому граница ему разрешена", (route) => {
    // Утверждение не про файлы, а про то, что у маршрута есть второй механизм:
    // если он исчезнет из proxy, граница снова даст soft 404.
    const proxy = fs.readFileSync(path.join(process.cwd(), "src", "proxy.ts"), "utf8");
    const family = route.split("/")[0];
    expect(proxy).toContain(`/${family}/`);
  });

  it("сегменты, где граница нужна, её сохранили", () => {
    // products — там измеряли CLS 0.30 при стриме (B549); неизвестный слаг
    // продукта 404-ится в proxy до начала стрима, поэтому граница безопасна.
    expect(hasLoading(path.join(APP, "products"))).toBe(true);
    // (auth) и auth — без границы `useSearchParams()` валит пререндер
    // (CSR bailout). Это всплыло сборкой при переезде: раньше боундари для
    // форм входа неявно давал корневой loading.tsx.
    expect(hasLoading(path.join(APP, "(auth)"))).toBe(true);
    expect(hasLoading(path.join(APP, "auth"))).toBe(true);
  });

  it("границы переиспользуют один компонент, а не копию разметки", () => {
    for (const seg of ["products", "(auth)", "auth", "miniapp", "checkin"]) {
      const file = path.join(APP, seg, "loading.tsx");
      if (!fs.existsSync(file)) continue;
      expect(fs.readFileSync(file, "utf8")).toContain("@/components/route-loading");
    }
  });

  // INC-085: у кабинета фолбэк СВОЙ — оверлей на весь вьюпорт закрывал сайдбар
  // и таб-бар, которые при переходе между страницами никуда не деваются, и
  // рамка заведомо не совпадала с областью app-shell-main.
  it("в кабинете фолбэк живёт в потоке главной колонки, а не оверлеем", () => {
    const boundary = fs.readFileSync(path.join(APP, "cabinet", "loading.tsx"), "utf8");
    expect(boundary).toContain("@/components/cabinet/cabinet-route-loading");
    const src = fs.readFileSync(
      path.join(process.cwd(), "src", "components", "cabinet", "cabinet-route-loading.tsx"),
      "utf8",
    );
    expect(src).not.toContain("fixed inset-0");
    expect(src).not.toContain("100svh\"");
  });

  it("распорка от прыжка футера (B549) не потеряна при переезде", () => {
    const src = fs.readFileSync(path.join(process.cwd(), "src", "components", "route-loading.tsx"), "utf8");
    expect(src).toContain("100svh");
  });
});
