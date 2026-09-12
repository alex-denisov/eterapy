/**
 * B740 — ЧЕСТНОСТЬ 404 ДЕРЖИТСЯ УСТРОЙСТВОМ ВЕТКИ, А НЕ СПИСКОМ В ПРОКСИ.
 *
 * INC-076: `notFound()` внутри стримящейся страницы рисует правильный экран, но
 * HTTP 200 уже отправлен, и краулер видит двухсотку. Лечили это списком слагов
 * в прокси — он отдавал 404 раньше рендера.
 *
 * Список убран (B740): SEO-агент выпускает страницы между выкатками, и список,
 * собранный на старте процесса, хоронил бы каждую такую страницу. Условие, на
 * котором теперь держится честный 404, ровно одно: НАД листом
 * `/library/[slug]` нет границы Suspense, поэтому ответ не начинает уходить
 * раньше, чем лист решил свою судьбу.
 *
 * ⚠ ЭТОТ ПРОГОН СТОРОЖИТ ИМЕННО ЭТО УСЛОВИЕ. Он не проверяет код ответа —
 * проверить его можно только боевой сборкой, и она делается при выкатке.
 * Он проверяет то, что условие никто не снял мимоходом: добавленный
 * `loading.tsx` где-нибудь в `app/` или `app/library/` вернул бы двухсотку на
 * несуществующий адрес, и понять это по симптому было бы почти невозможно.
 */

import fs from "fs";
import path from "path";

const root = process.cwd();

describe("B740 — у ветки /library нет границы Suspense над листом", () => {
  it("ни один сегмент от корня до [slug] не объявляет loading.tsx", () => {
    const segments = [
      "src/app",
      "src/app/library",
      "src/app/library/[slug]",
    ];
    for (const segment of segments) {
      for (const extension of ["tsx", "jsx", "ts", "js"]) {
        const boundary = path.join(root, segment, `loading.${extension}`);
        expect({ segment, exists: fs.existsSync(boundary) }).toEqual({ segment, exists: false });
      }
    }
  });

  it("страница не оборачивает собственный рендер в Suspense", () => {
    const page = fs.readFileSync(path.join(root, "src/app/library/[slug]/page.tsx"), "utf8");
    expect(page).not.toContain("<Suspense");
  });

  it("маршрут открыт для страниц из базы и по-прежнему предсобирает корпус", () => {
    const page = fs.readFileSync(path.join(root, "src/app/library/[slug]/page.tsx"), "utf8");
    expect(page).toContain("export const dynamicParams = true");
    expect(page).toContain("export const revalidate =");
    // Редакционный корпус обязан остаться предсобранным: двести известных
    // адресов не должны начать рисоваться на каждый запрос.
    expect(page).toContain("generateStaticParams");
    expect(page).toContain("approvedLibraryEntries().map");
  });

  it("прокси больше не держит список адресов Библиотеки", () => {
    const proxy = fs.readFileSync(path.join(root, "src/proxy.ts"), "utf8");
    expect(proxy).not.toContain("VALID_LIBRARY_SLUGS");
    expect(proxy).not.toContain("unknownLibrarySlug");
    // Но общий запрет на выпиленные услуги никуда не делся.
    expect(proxy).toContain("unknownProductSlug(pathname)");
  });
});
