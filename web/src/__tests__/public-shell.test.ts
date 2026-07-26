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
    const navModel = source("src/lib/nav-model.ts");

    // B464 IB0: «Задать вопрос» is the free entry CTA, not a nav label.
    expect(header).not.toContain('label: "Задать вопрос"');
    expect(header).toContain('href={mainUrl("/checkin")}');
    expect(header).toContain("Задать вопрос");
    // The landing nav lives in the shared model now; «Продукты» → «Разобрать».
    expect(navModel.indexOf('label: "Разобрать"')).toBeLessThan(navModel.indexOf('label: "Библиотека"'));
    expect(navModel).toContain('label: "Разобрать"');
    expect(navModel).not.toContain('label: "Продукты"');
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
    // B464 IB3: «Подписка и оплата» merged into «Кошелёк»; «Приглашения» added.
    expect(header).not.toContain("Подписка и оплата");
    expect(header).toContain("Приглашения");
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

    // The logged-in client cluster (balance + help + bell + avatar + CTA)
    // overflows 360px, so below md the desktop CTA «Задать вопрос» and the help
    // icon collapse — the state-aware mobile bottom bar carries them instead
    // (B464 IB0 retired the burger).
    expect(header).toContain('className="soft-header-cta soft-header-cta-primary hidden md:inline-flex"');
    expect(header).toContain('className="soft-user-icon hidden md:inline-flex"');
    // The bottom bar keeps the actions reachable: «Вопрос» (→ /checkin) as a
    // tab and «Поддержка» inside the «Ещё» sheet.
    expect(header).toContain('data-testid="landing-mobile-nav"');
    expect(header).toContain("Задать вопрос");
  });

  it("defers session and host-specific header branches until after mount", () => {
    const header = source("src/components/header.tsx");

    expect(header).toContain("const [mounted, setMounted] = useState(false)");
    expect(header).toContain('setMounted(true)');
    expect(header).toContain('const isAuthenticated = mounted && status === "authenticated" && !!session');
    // B464 round-4 #1: host detection is mounted-gated AND goes through the
    // configured domains (getSubdomain) so staging.app.eterapy.com matches too.
    expect(header).toContain('const subdomain = mounted ? getSubdomain(hostname) : "main"');
    expect(header).toContain('const isAdminHost = subdomain === "admin"');
    expect(header).toContain('const isAppHost = subdomain === "app"');
    expect(header).toContain("toCabinetPathname(pathname)");
    expect(header).toContain('cabinetPathname.startsWith("/cabinet")');
  });
});
