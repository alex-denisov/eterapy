import fs from "node:fs";
import path from "node:path";
import {
  GRID_CELLS,
  GRID_HUB_PATH,
  PLANET_AXES,
  SIGN_AXES,
  cellBySlug,
  resolvedCells,
  rowNeighbours,
  transitWindow,
  planetAxis,
} from "@/lib/astro/cells";
import { publicPageSeo } from "@/lib/public-page-seo";
import { publicSeoRoutes } from "@/lib/seo";
import { GET as sitemapXml } from "@/app/sitemap.xml/route";
import { formatDuration } from "@/lib/astro/transit-format";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), "src", rel), "utf8");

describe("B711 — расчётная сетка «планета × знак»", () => {
  it("выложена волна 1: Луна во всех двенадцати знаках", () => {
    const moon = GRID_CELLS.filter((cell) => cell.planetKey === "moon");
    expect(moon).toHaveLength(12);
    expect(new Set(moon.map((cell) => cell.signKey))).toEqual(new Set(SIGN_AXES.map((sign) => sign.key)));
  });

  it("ключи осей совпадают с эфемеридными: иначе таблица периодов упадёт на сборке", () => {
    // Ось планеты обязана называться так же, как светило в `lib/astro/ecliptic`.
    // Разошедшийся ключ (`moon` против `luna`) не поймается типами: он вылезет
    // исключением «Неизвестное светило» при пререндере всей строки.
    for (const cell of GRID_CELLS) {
      expect(() => planetAxis(cell.planetKey)).not.toThrow();
      expect(SIGN_AXES.some((sign) => sign.key === cell.signKey)).toBe(true);
    }
  });

  it("адрес каждой ячейки уникален и собран из осей", () => {
    const slugs = resolvedCells().map((item) => item.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(cellBySlug("luna-v-skorpione")?.heading).toBe("Луна в Скорпионе");
    expect(cellBySlug("luna-v-teltse")?.heading).toBe("Луна в Тельце");
    // Исключение на весь корпус: «во Льве», и в заголовке, и в адресе.
    expect(cellBySlug("luna-vo-lve")?.heading).toBe("Луна во Льве");
    expect(cellBySlug("luna-v-lve")).toBeNull();
    expect(cellBySlug("net-takoy-yacheyki")).toBeNull();
  });

  it("метаданные уникальны и укладываются в выдачу", () => {
    const titles = resolvedCells().map((item) => item.metaTitle);
    const descriptions = resolvedCells().map((item) => item.metaDescription);
    expect(new Set(titles).size).toBe(titles.length);
    expect(new Set(descriptions).size).toBe(descriptions.length);
    for (const item of resolvedCells()) {
      expect({ slug: item.slug, ok: item.metaTitle.length <= 65 }).toEqual({ slug: item.slug, ok: true });
      expect({ slug: item.slug, ok: item.metaDescription.length <= 158 }).toEqual({ slug: item.slug, ok: true });
      // Хвост про расчёт добавляется только когда влезает целиком: обрезанное
      // на полуслове описание в выдаче хуже, чем описание без хвоста.
      expect(item.metaDescription.endsWith(".")).toBe(true);
    }
  });

  it("не подставляет один и тот же текст в разные ячейки", () => {
    // Главная защита от дорвея: если абзац ячейки остаётся верным при замене
    // знака, сетка превращается в размноженный шаблон — ровно то, что
    // фильтруют и Яндекс, и Google.
    const answers = GRID_CELLS.map((cell) => cell.answer);
    const tensions = GRID_CELLS.map((cell) => cell.tension);
    const steps = GRID_CELLS.map((cell) => cell.firstStep);
    expect(new Set(answers).size).toBe(answers.length);
    expect(new Set(tensions).size).toBe(tensions.length);
    expect(new Set(steps).size).toBe(steps.length);

    const questions = GRID_CELLS.flatMap((cell) => cell.faqs.map((faq) => faq.question));
    expect(new Set(questions).size).toBe(questions.length);
  });

  it("прямой ответ укладывается в 40–60 слов брифа извлекаемости", () => {
    for (const cell of GRID_CELLS) {
      const words = cell.answer.trim().split(/\s+/).length;
      expect({ cell: `${cell.planetKey}-${cell.signKey}`, fits: words >= 35 && words <= 70 })
        .toEqual({ cell: `${cell.planetKey}-${cell.signKey}`, fits: true });
    }
  });

  it("каждая ячейка отвечает на подзапросы, а не только на головной", () => {
    for (const cell of GRID_CELLS) {
      expect(cell.faqs.length).toBeGreaterThanOrEqual(3);
      expect(cell.plus.length).toBeGreaterThanOrEqual(3);
      expect(cell.minus.length).toBeGreaterThanOrEqual(3);
      for (const faq of cell.faqs) expect(faq.answer.length).toBeGreaterThan(80);
    }
  });

  it("соседи берутся по кругу знаков, а не по порядку записи", () => {
    const scorpio = cellBySlug("luna-v-skorpione")!;
    expect(rowNeighbours(scorpio).map((item) => item.sign.key)).toEqual(["libra", "sagittarius"]);
    // Круг замыкается: у Овна сосед слева — Рыбы, а не пустота.
    const aries = cellBySlug("luna-v-ovne")!;
    expect(rowNeighbours(aries).map((item) => item.sign.key)).toEqual(["pisces", "taurus"]);
  });

  it("окно таблицы едет от даты сборки, а не от вбитой константы года", () => {
    const moon = PLANET_AXES.find((axis) => axis.key === "moon")!;
    const window2027 = transitWindow(moon, new Date("2027-06-01T00:00:00Z"));
    expect(window2027.label).toBe("2027 год");
    expect(window2027.from.toISOString()).toBe("2027-01-01T00:00:00.000Z");

    // Медленным светилам год бесполезен: Плутон стоит в знаке дольше.
    const pluto = PLANET_AXES.find((axis) => axis.key === "pluto")!;
    const wide = transitWindow(pluto, new Date("2026-01-01T00:00:00Z"));
    expect(wide.to.getUTCFullYear() - wide.from.getUTCFullYear()).toBeGreaterThanOrEqual(100);
  });

  it("длительность показывается в человеческих единицах", () => {
    const day = new Date("2026-01-01T00:00:00Z");
    // Визит Луны в знак — около 53 часов; сутки как единица здесь бесполезны.
    expect(formatDuration(day, new Date("2026-01-03T07:00:00Z"))).toBe("2 дн. 7 ч");
    expect(formatDuration(day, new Date("2026-01-01T18:00:00Z"))).toBe("18 ч");
    expect(formatDuration(day, new Date("2026-02-10T00:00:00Z"))).toBe("40 дн.");
    expect(formatDuration(day, new Date("2027-07-01T00:00:00Z"))).toBe("18 мес.");
    expect(formatDuration(day, new Date("2038-04-01T00:00:00Z"))).toBe("12 г. 3 мес.");
  });

  it("хаб зарегистрирован как публичная страница, а не живёт в стороне", () => {
    expect(publicSeoRoutes).toContain(GRID_HUB_PATH);
    expect(publicPageSeo[GRID_HUB_PATH].title).toContain("Планеты в знаках");
  });

  it("карта сайта отдаёт все выложенные ячейки и хаб", async () => {
    const res = await sitemapXml(
      new Request("https://eterapy.com/sitemap.xml", { headers: { host: "eterapy.com" } }),
    );
    const body = await res.text();
    expect(body).toContain(`<loc>https://eterapy.com${GRID_HUB_PATH}</loc>`);
    for (const item of resolvedCells()) {
      expect(body).toContain(`<loc>https://eterapy.com${item.path}</loc>`);
    }
  });

  it("на хаб ведёт внутренняя ссылка — ячейки не сироты", () => {
    // Разбор натальной карты в библиотеке — единственная точка входа в сетку
    // помимо карты сайта. Пропадёт она — обход ячеек встанет.
    expect(source("lib/service-guides.ts")).toContain(GRID_HUB_PATH);
  });

  it("страница ячейки держит расчёт и таблицу выше трактовки", () => {
    const page = source("app/astro/[slug]/page.tsx");
    const answerAt = page.indexOf("{cell.answer}");
    const finderAt = page.indexOf("<SignFinder");
    const tableAt = page.indexOf("transit-table-title");
    const meaningAt = page.indexOf("cell-meaning-title");
    expect(answerAt).toBeGreaterThan(0);
    expect(answerAt).toBeLessThan(finderAt);
    expect(finderAt).toBeLessThan(tableAt);
    expect(tableAt).toBeLessThan(meaningAt);
  });

  it("калькулятор не тянет эфемериды в бандл страницы", () => {
    // 50 КБ `astronomy-engine` в каждой из ста двадцати страниц — цена, которую
    // платят все ради тех, кто нажмёт кнопку. Импорт обязан быть динамическим.
    const finder = source("components/astro/sign-finder.tsx");
    expect(finder).toContain('await import("@/lib/astro/sign-transits")');
    expect(finder).not.toMatch(/^import .*sign-transits/m);
    expect(finder).not.toMatch(/^import .*astronomy-engine/m);
  });

  it("страница ячейки размечена как статья с крошками и FAQ", () => {
    const page = source("app/astro/[slug]/page.tsx");
    expect(page).toContain('"@graph"');
    expect(page).toContain('"@type": "Article"');
    expect(page).toContain('"@type": "BreadcrumbList"');
    expect(page).toContain('"@type": "FAQPage"');
    expect(page).toContain("isAccessibleForFree: true");
    // Дата проверки — собственная у волны: общая библиотечная означала бы
    // проверку раньше появления страницы.
    expect(page).toContain('GRID_REVIEWED_AT = "2026-08-14"');
  });
});
