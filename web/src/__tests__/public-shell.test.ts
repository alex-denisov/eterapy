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
    expect(header).toContain('data-testid="public-shell-header"');
    expect(source("src/components/footer.tsx")).toContain('data-testid="public-shell-footer"');
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
