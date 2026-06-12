import fs from "node:fs";
import path from "node:path";

function source(relativePath: string) {
  return fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");
}

describe("v5 public shell", () => {
  it("uses a scalable Dialogue Halo logo instead of the legacy svg logo", () => {
    const header = source("src/components/header.tsx");
    const footer = source("src/components/footer.tsx");
    const brand = source("src/components/brand/brand-mark.tsx");

    expect(brand).toContain("function HaloSymbol");
    expect(brand).toContain("function VectorBrandLogo");
    // The brand mark must be rendered as CSS conic-gradient (v4 design), not as a next/image PNG.
    expect(brand).not.toContain('from "next/image"');
    expect(brand).not.toContain("brandAssets.logos");
    expect(brand).toContain("conic-gradient");
    expect(header).toContain("<VectorBrandLogo");
    expect(footer).toContain("<BrandLogo");
    expect(header).not.toContain('src="/logo.svg"');
  });

  it("keeps public navigation question-first", () => {
    const header = source("src/components/header.tsx");

    expect(header).not.toContain('label: "Задать вопрос"');
    expect(header).toContain('href={mainUrl("/checkin")}');
    expect(header).toContain("Начать диалог");
    expect(header.indexOf('label: "Продукты"')).toBeLessThan(header.indexOf('label: "Библиотека"'));
    expect(header).toContain('label: "Продукты"');
    expect(header).toContain('data-testid="public-shell-header"');
    expect(source("src/components/footer.tsx")).toContain('data-testid="public-shell-footer"');
  });

  it("uses the v4.2 logged-in navigation and footer taxonomy", () => {
    const header = source("src/components/header.tsx");
    const footer = source("src/components/footer.tsx");
    const softCss = source("src/app/v4-soft.css");

    expect(header).toContain("useClarityCreditBalance");
    expect(header).toContain("soft-user-pill");
    expect(header).toContain("soft-user-icon");
    // T11: dropdown mirrors the real CLIENT_NAV cabinet sidebar one-to-one.
    expect(header).toContain('label: "Главная"');
    // M26/B369: «Моя карта» + «История разборов» слиты в «Дневник».
    expect(header).toContain("Дневник");
    expect(header).toContain("Кошелёк");
    // B365 (M26): header balance pill reads «Баланс: N баллов».
    expect(header).toContain("Баланс:");
    // B375: практика живёт блоком на дашборде — отдельного nav-пункта нет.
    expect(header).not.toContain("Ежедневная практика");
    expect(header).toContain("Подписка и оплата");
    expect(footer).toContain("soft-footer-columns");
    // B380 (M26): footer condensed 5 → 4 thematic columns aligned to the
    // catalogue groups; free entries are communicated on each product page,
    // not implied by a footer column.
    expect(footer).toContain('title: "Разборы"');
    expect(footer).toContain('title: "Эзотерика"');
    expect(footer).toContain('title: "Платформа"');
    expect(footer).toContain('title: "Помощь"');
    // The footer must NOT reintroduce the misleading price-based columns.
    expect(footer).not.toContain('title: "Бесплатно"');
    expect(footer).not.toContain('title: "Платные разборы"');
    // B380: dead routes are removed from footer navigation ahead of B373.
    expect(footer).not.toContain('mainUrl("/products/circle")');
    expect(footer).not.toContain('mainUrl("/products/seven-days")');
    expect(footer).not.toContain('mainUrl("/products/clarity-practice")');
    expect(footer).not.toContain('mainUrl("/products/my-map")');
    expect(softCss).toContain(".soft-user-menu");
    expect(softCss).toContain("soft-footer-columns");
  });

  it("keeps the authenticated right cluster inside a 360px viewport", () => {
    const header = source("src/components/header.tsx");

    // The logged-in client cluster (balance + help + bell + avatar + CTA +
    // burger) overflowed 360px and produced horizontal scroll. Below md the
    // CTA «Новый разбор» and the help icon must collapse — both are
    // duplicated inside the burger menu («Начать диалог» / «Помощь»).
    expect(header).toContain('className="soft-header-cta soft-header-cta-primary hidden md:inline-flex"');
    expect(header).toContain('className="soft-user-icon hidden md:inline-flex"');
    // The mobile burger menu keeps both actions reachable.
    expect(header).toContain("Помощь");
    expect(header).toContain("Начать диалог");
  });

  it("defers session and host-specific header branches until after mount", () => {
    const header = source("src/components/header.tsx");

    expect(header).toContain("const [mounted, setMounted] = useState(false)");
    expect(header).toContain('setMounted(true)');
    expect(header).toContain('const isAuthenticated = mounted && status === "authenticated" && !!session');
    expect(header).toContain('const isAdminHost = mounted && hostname.startsWith("admin.")');
    expect(header).toContain('const isAppHost = mounted && hostname.startsWith("app.")');
    expect(header).toContain("toCabinetPathname(pathname)");
    expect(header).toContain('cabinetPathname.startsWith("/cabinet")');
  });
});
