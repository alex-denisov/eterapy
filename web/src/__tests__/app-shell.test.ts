import fs from "node:fs";
import path from "node:path";

const shell = fs.readFileSync(path.join(process.cwd(), "src/components/cabinet/cabinet-shell.tsx"), "utf8");
const clientCabinet = fs.readFileSync(path.join(process.cwd(), "src/app/cabinet/page.tsx"), "utf8");

describe("v5 app shell", () => {
  it("exposes stable test ids for role-based browser walkthroughs", () => {
    expect(shell).toContain('data-testid="app-shell"');
    expect(shell).toContain('data-testid="app-shell-sidebar"');
    expect(shell).toContain('data-testid="app-shell-mobile-nav"');
    expect(shell).toContain('data-testid="app-shell-main"');
  });

  it("uses v5 tokenized shell styling", () => {
    expect(shell).toContain("soft-clarity-page soft-app-shell");
    expect(shell).toContain("soft-shell soft-app-layout");
    expect(shell).toContain("soft-app-sidebar-card");
    expect(shell).toContain("soft-app-mobile-nav");
    expect(shell).toContain("rounded-[var(--soft-radius-md)]");
    expect(shell).toContain("sticky top-16");
    expect(shell).toContain("duration-[var(--motion-base)]");
  });

  it("normalizes stripped app-subdomain paths before marking active navigation", () => {
    expect(shell).toContain("toCabinetPathname(pathname)");
    // Hydration-safe activePathname: empty before mount (server &
    // first client render agree), real pathname after mount.
    expect(shell).toContain('const activePathname = hydrated ? toCabinetPathname(pathname) : "";');
    expect(shell).toContain("normActive.startsWith(normItem)");
  });

  it("keeps product actions inside the app cabinet instead of sending clients to the landing", () => {
    expect(clientCabinet).toContain('mainUrl("/checkin")');
    // X11: product actions point to the single in-cabinet funnel (/credits),
    // not the removed duplicate /products and not the landing.
    expect(clientCabinet).toContain('appUrl("/wallet")');
    expect(shell).not.toContain('appUrl("/practice")');
    expect(shell).toContain('appUrl("/wallet")');
    expect(clientCabinet).toContain('appUrl("/diary")');
    expect(clientCabinet).toContain('data-testid="client-map-preview"');
    // Product CTAs on cabinet homepage must stay in-cabinet (not link to eterapy.com/products/...)
    expect(clientCabinet).not.toContain('mainUrl("/products/seven-days")');
    expect(clientCabinet).not.toContain('mainUrl("/products/deep-report")');
  });

  it("uses explicit B376 mobile tabs with a More destination", () => {
    expect(shell).toContain("const mobileTabs =");
    expect(shell).toContain('label: "Главная"');
    expect(shell).toContain('label: "Дневник"');
    expect(shell).toContain('label: "Кошелёк"');
    expect(shell).toContain('label: "Ещё"');
    expect(shell).toContain("data-testid={item.label");
    expect(shell).toContain('"app-shell-mobile-more"');
    expect(shell).not.toContain("nav.slice(0, 4)");
  });

  it("shows subscription label (not role) in sidebar header per v4.2 design", () => {
    const layout = fs.readFileSync(path.join(process.cwd(), "src/app/cabinet/layout.tsx"), "utf8");
    // Layout must fetch active subscription and derive a label
    expect(layout).toContain("db.userSubscription.findFirst");
    expect(layout).toContain('subscriptionLabel={subLabel}');
    // Shell must accept and display subscriptionLabel prop
    expect(shell).toContain("subscriptionLabel");
    expect(shell).toContain("displaySubLabel");
    // Shell avatar should use serif heading font
    expect(shell).toContain('font-heading-v4');
  });
});
