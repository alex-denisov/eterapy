import fs from "fs";
import path from "path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B205 Library and esoteric service pages", () => {
  it("does not keep experimental section hubs or redirect them", () => {
    for (const route of ["esoterika", "esotericism"]) {
      expect(fs.existsSync(path.join(root, `src/app/library/${route}/page.tsx`))).toBe(false);
      expect(fs.existsSync(path.join(root, `src/app/library/${route}/route.ts`))).toBe(false);
    }

    /**
     * B740 — КОНТРАКТ МАРШРУТА ИЗМЕНЁН РЕШЕНИЕМ ВЛАДЕЛЬЦА, А НЕ СЛОМАН.
     *
     * Прежде здесь проверялось, что маршрут Библиотеки ЗАКРЫТ
     * (`dynamicParams = false`), а прокси держит список слагов корпуса и
     * хоронит всё остальное. Оба утверждения были верны ровно до тех пор, пока
     * корпус был только редакционным.
     *
     * SEO-агент выпускает страницы в базу между выкатками. Закрытый маршрут
     * означал бы, что выпущенная страница недоступна до следующей пересборки
     * образа, а список в прокси — что она отдаёт 404 даже после неё, пока
     * процесс не перезапущен.
     *
     * Проверка остаётся, но проверяет теперь ДРУГОЕ: маршрут открыт, а
     * редакционный корпус по-прежнему предсобирается — то есть двести
     * известных адресов не стали рисоваться на запросе.
     */
    const detail = source("src/app/library/[slug]/page.tsx");
    expect(detail).toContain("export const dynamicParams = true");
    expect(detail).toContain("generateStaticParams");
    expect(detail).toContain("getPublishedSeoLibraryEntry");

    const proxy = source("src/proxy.ts");
    expect(proxy).not.toContain("VALID_LIBRARY_SLUGS");
  });

  it("keeps legacy esoteric URLs as redirects to canonical /products pages", () => {
    const redirects: Record<string, string> = {
      tarot: "/products/tarot",
      astro: "/products/natal-chart",
      numerology: "/products/numerology",
    };

    for (const [route, target] of Object.entries(redirects)) {
      const page = source(`src/app/${route}/page.tsx`);
      expect(page).toContain("redirect(");
      expect(page).toContain(target);
    }

    const seo = source("src/lib/seo.ts");
    const publicSeo = source("src/lib/public-page-seo.ts");

    for (const route of ["/products/tarot", "/products/natal-chart", "/products/numerology"]) {
      expect(seo).toContain(`"${route}"`);
      expect(publicSeo).toContain(`"${route}"`);
    }
  });

  it("B601: разбор отвечает прямо, но ничего не гарантирует", () => {
    const page = source("src/components/public/esoteric-soon-page.tsx");

    // Владелец 2026-07-27 снял «это не гадание» из копирайта. Осталась
    // единственная честная граница: ответ есть, гарантии события — нет.
    expect(page).toContain("Разбор отвечает на ваш вопрос прямо");
    expect(page).toContain("Гарантией события такой ответ\n            не является");
    expect(page).toContain("психолога или врача мы не заменяем");
    // M26/B367: joint-session блок заменён на каталожный CTA с бейджем универсала.
    expect(page).toContain("психология + эзотерика");
  });

  it("links v4.2 service catalog cards to real service pages instead of placeholders", () => {
    const catalog = source("src/components/products/service-catalog.tsx");

    expect(catalog).toContain('href: "/products/tarot"');
    expect(catalog).toContain('href: "/products/natal-chart"');
    expect(catalog).toContain('href: "/products/numerology"');
    expect(catalog).not.toContain("joint-session");
    // B456: cards link to real pages (no in-card «Подробнее и заказать» link).
    expect(catalog).toContain('href: "/products/human-design"');
    expect(catalog).not.toContain('id: "tarot-d", title: "Расклад Таро", desc: "Цифровой расклад с бережной интерпретацией.", price: "390 ₽", cat: "tarot", kind: "Цифровое", href: "#"' );
  });

  it("keeps the library detail page aligned with the current editorial structure", () => {
    const detail = source("src/app/library/[slug]/page.tsx");
    const cta = source("src/components/library/library-entry-cta.tsx");
    const ctaLib = source("src/lib/library-cta.ts");

    expect(detail).toContain("короткий ответ");
    expect(detail).toContain("что здесь важно различить");
    expect(detail).toContain("что можно проверить");
    expect(detail).toContain("первый шаг");
    expect(detail).toContain("Как подготовлен материал");
    expect(detail).toContain("Частые вопросы");
    expect(detail).toContain("рядом в библиотеке");
    expect(detail).toContain("LibraryEntryCta");
    // B382: CTA now drives into the mapped paid service (label from resolveLibraryCta).
    expect(cta).toContain("data-analytics-event=\"library_cta_clicked\"");
    expect(ctaLib).toContain("Разобрать свой вопрос");
  });
});
