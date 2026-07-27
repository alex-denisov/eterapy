/**
 * B600 — сторож маркетинговых URL.
 *
 * Проверка идёт против НАСТОЯЩЕГО дерева маршрутов (`src/app/**\/page.tsx`), а
 * не против списка `publicSeoRoutes`: сравнивать список с самим собой
 * бессмысленно — именно расхождение списка и файлов и есть та ошибка, которую
 * ищем. Так был бы пойман батч №15, где пять адресов услуг сменились разом.
 */
import fs from "node:fs";
import path from "node:path";
import { v5Products } from "@/lib/v5-products";
import { allLegalDocSlugs } from "@/lib/legal/registry";
import {
  RETIRED_URLS,
  findRegistryViolations,
  marketingUrlRegistry,
  routeMapLivePaths,
  urlStatus,
} from "@/lib/marketing/url-registry";

const APP_DIR = path.join(process.cwd(), "src", "app");

/** Статические пути app-роутера: каталоги с `page.tsx`, без групп и параметров. */
function collectStaticRoutes(dir: string, prefix = ""): string[] {
  const routes: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    if (name.startsWith("_") || name.startsWith("[")) continue;
    // Группы маршрутов `(group)` не участвуют в URL.
    const segment = name.startsWith("(") && name.endsWith(")") ? "" : `/${name}`;
    const child = path.join(dir, name);
    const childPrefix = `${prefix}${segment}`;
    if (fs.existsSync(path.join(child, "page.tsx")) || fs.existsSync(path.join(child, "page.ts"))) {
      routes.push(childPrefix || "/");
    }
    routes.push(...collectStaticRoutes(child, childPrefix));
  }
  return routes;
}

/**
 * Живая карта = статические маршруты + динамические, ПОДКРЕПЛЁННЫЕ ДАННЫМИ.
 *
 * `/products/[slug]` и `/legal/[doc]` существуют как файлы всегда — по файлам
 * их не проверить. Живым делает каталог: услуга, выпавшая из `v5Products`,
 * отдаёт 404 при живом файле роута. Ровно это и случилось в B609, и ровно это
 * сторож обязан ловить.
 */
const liveRoutes = (() => {
  const routes = collectStaticRoutes(APP_DIR);
  if (fs.existsSync(path.join(APP_DIR, "page.tsx"))) routes.push("/");
  for (const product of v5Products) routes.push(`/products/${product.slug}`);
  for (const doc of allLegalDocSlugs()) routes.push(`/legal/${doc}`);
  return routes;
})();

describe("B600 — реестр маркетинговых URL", () => {
  it("видит реальные маршруты, а не только список SEO-адресов", () => {
    // Если сканер сломается, всё остальное в этом файле станет зелёным молча.
    expect(liveRoutes.length).toBeGreaterThan(30);
    expect(liveRoutes).toContain("/products/horoscope");
    expect(liveRoutes).toContain("/");
  });

  it("ни один адрес с весом не пропал без решения", () => {
    const violations = findRegistryViolations(liveRoutes);
    expect(violations.map((v) => `${v.path} — ${v.message}`)).toEqual([]);
  });

  it("у каждого снятого адреса есть причина и дата", () => {
    for (const [url, decision] of Object.entries(RETIRED_URLS)) {
      expect(url.startsWith("/")).toBe(true);
      expect(decision.reason.length).toBeGreaterThan(20);
      expect(decision.decidedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it("снятые адреса действительно сняты — иначе решение врёт", () => {
    // Обратная ошибка: маршрут вернули, а запись «убран осознанно» осталась.
    // Тогда сторож молчал бы про адрес, который на самом деле живой.
    for (const url of Object.keys(RETIRED_URLS)) {
      expect(liveRoutes).not.toContain(url);
    }
  });

  it("пять переименованных услуг записаны как осознанное решение владельца", () => {
    for (const old of [
      "/products/horary",
      "/products/surname-story",
      "/products/family-scenarios",
      "/products/synastry",
      "/products/tarot-numerology",
    ]) {
      expect(RETIRED_URLS[old]?.kind).toBe("gone");
      expect(RETIRED_URLS[old]?.reason).toContain("B609");
    }
  });

  it("вес берётся из ядра: у посадочной с фразами P1 вес P1", () => {
    const registry = marketingUrlRegistry();
    const tarot = registry.find((r) => r.path === "/products/tarot");
    expect(tarot?.weight).toBe("P1");
    expect(tarot?.corePhrases ?? 0).toBeGreaterThan(0);
    expect(tarot?.coreDemand ?? 0).toBeGreaterThan(0);

    // Правовая страница фраз не собирает, но остаётся адресом с весом.
    const offer = registry.find((r) => r.path === "/legal/offer");
    expect(offer?.weight).toBe("P2");
    expect(offer?.corePhrases).toBe(0);
  });

  it("сторож ловит исчезнувший адрес — на пустой карте маршрутов", () => {
    // Проверяем сам сторож, а не только его молчание.
    const violations = findRegistryViolations([]);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.some((v) => v.path === "/products/tarot")).toBe(true);
  });

  it("статус адреса читается человеком", () => {
    const live = routeMapLivePaths();
    expect(urlStatus("/products/tarot", live)).toBe("live");
    expect(urlStatus("/products/horary", live)).toBe("gone");
    expect(urlStatus("/cabinet/practice", live)).toBe("redirect");
    // Параметризованный адрес библиотеки считается живым по префиксу.
    expect(urlStatus("/library/kak-perestat-somnevatsya", live)).toBe("live");
  });
});
