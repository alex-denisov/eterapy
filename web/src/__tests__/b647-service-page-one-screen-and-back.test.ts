import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), "src", relativePath), "utf8");

describe("B647 — страница услуги: один экран и честный возврат", () => {
  const productPage = source("app/products/[slug]/page.tsx");
  const shell = source("components/products/product-page-shell.tsx");
  const backLink = source("components/products/product-back-link.tsx");

  it("не встраивает описательный корпус в страницу услуги", () => {
    expect(productPage).not.toContain("<ProductSeoContent");
    expect(productPage).not.toContain("product-seo-content");
  });

  it("обе шапки услуги используют один и тот же возврат", () => {
    // До B647 у компактной шапки был href="/", у широкой — href="/products":
    // одна и та же стрелка вела в разные места на разных услугах.
    expect(productPage).toContain("<ProductBackLink");
    expect(shell).toContain("<ProductBackLink");
    expect(productPage).not.toMatch(/aria-label="Назад"[\s\S]{0,200}href="\/"/);
    expect(shell).not.toMatch(/data-testid="product-hero-back"[\s\S]{0,120}href=/);
  });

  it("возврат идёт по истории, а каталог остаётся запасным адресом", () => {
    expect(backLink).toContain("router.back()");
    expect(backLink).toContain('fallback = "/products"');
    // Во вкладке, открытой прямой ссылкой из поиска, единственный шаг назад
    // увёл бы с сайта — поэтому возврат только когда возвращаться есть куда.
    expect(backLink).toContain("window.history.length <= 1");
    // `idx` — счётчик Pages Router; в App Router его нет, и условие на него
    // не выполнилось бы НИКОГДА. Запрет на код, а не на упоминание: в
    // комментарии рядом эта ловушка обязана остаться описанной.
    expect(backLink).not.toContain("idx?:");
    expect(backLink).not.toContain("?.idx");
    // Ссылка обязана работать до гидратации и при открытии в новой вкладке.
    expect(backLink).toContain("href={fallback}");
    expect(backLink).toContain("metaKey");
  });
});
