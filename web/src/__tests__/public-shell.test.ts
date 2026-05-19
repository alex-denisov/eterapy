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
    expect(header.indexOf('label: "Библиотека"')).toBeLessThan(header.indexOf('label: "Специалисты"'));
    expect(header).toContain('label: "Практика"');
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
    expect(header).toContain("Главная кабинета");
    expect(header).toContain("Кредиты ясности");
    expect(header).toContain("Подписка и оплата");
    expect(footer).toContain("soft-footer-columns");
    expect(footer).toContain('title: "Бесплатно"');
    expect(footer).toContain('title: "Психология"');
    expect(footer).toContain('title: "Эзотерика"');
    expect(footer).toContain('title: "Социальное и обучение"');
    expect(softCss).toContain(".soft-user-menu");
    expect(softCss).toContain("repeat(auto-fit, minmax(160px, 1fr))");
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
