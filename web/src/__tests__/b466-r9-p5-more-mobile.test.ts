import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9-4 P5 — мобильный кластер «Ещё» 1-в-1 по mockups practitioner-more-*.
// Паттерн: page.tsx рендерит pcab-screen (md:hidden, data-pcab-top) + прежний
// десктоп (hidden md:block); серверные загрузчики переиспользуются.
// Этот батч: hub + reviews + ethics + crisis (чистый серверный контент).

const PRAC = "src/app/cabinet/practitioner";

describe("R9 P5 — «Ещё» hub (more)", () => {
  const page = () => source(`${PRAC}/more/page.tsx`);

  it("renders a mobile hub with profile card + grouped rows, desktop hidden", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-more-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toContain('data-testid="more-profile-card-mobile"');
    expect(src).toContain("HubRowMobile");
    expect(src).toContain('data-testid="more-logout-mobile"');
    expect(src).toMatch(/hidden[^"]*md:block/);
  });

  it("hub rows link the practice + account destinations", () => {
    const src = page();
    expect(src).toContain('appUrl("/practitioner/ai-usage")');
    expect(src).toContain('appUrl("/practitioner/services")');
    expect(src).toContain('appUrl("/practitioner/reviews")');
    expect(src).toContain('appUrl("/practitioner/invite")');
    expect(src).toContain('appUrl("/practitioner/ethics")');
    expect(src).toContain('appUrl("/practitioner/settings")');
  });
});

describe("R9 P5 — Отзывы (reviews)", () => {
  const page = () => source(`${PRAC}/reviews/page.tsx`);

  it("renders a mobile screen with score summary, distribution bars and review cards", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-reviews-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toContain("pcab-revsum");
    expect(src).toContain("pcab-revfill"); // распределение оценок
    // B466 R9-5: карточки отзывов вынесены в reviews-list.tsx (пагинация по 5 + «Ещё»).
    expect(source(`${PRAC}/reviews/reviews-list.tsx`)).toContain("pcab-rev-text");
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-reviews-page"'); // прежний десктоп-testid
  });
});

describe("R9 P5 — Этика и безопасность (ethics)", () => {
  const page = () => source(`${PRAC}/ethics/page.tsx`);

  it("renders a mobile screen with sections + code/crisis rows, desktop hidden", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-ethics-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toContain('data-testid="ethics-code-row-mobile"');
    expect(src).toContain('data-testid="ethics-crisis-row-mobile"');
    expect(src).toMatch(/hidden[^"]*md:block/);
  });
});

describe("R9 P5 — Кризис-протокол (crisis)", () => {
  const page = () => source(`${PRAC}/crisis/page.tsx`);

  it("renders a mobile screen with the 112 call, risk signs, steps and contacts", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-crisis-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toContain('data-testid="crisis-call-mobile"');
    expect(src).toContain('href="tel:112"');
    expect(src).toContain("pcab-steps");
    expect(src).toContain("RISK_SIGNS.map"); // переиспользует данные десктопа
    expect(src).toMatch(/hidden[^"]*md:block/);
  });
});

describe("R9 P5 — cockpit CSS (hub + reviews + crisis, platform fonts)", () => {
  const css = () => source("src/app/cabinet/practitioner-cockpit.css");

  it("defines the hub profile card, review summary and crisis primitives", () => {
    const styles = css();
    expect(styles).toContain(".pcab-pcard");
    expect(styles).toContain(".pcab-tierchip");
    expect(styles).toContain(".pcab-revsum");
    expect(styles).toContain(".pcab-revfill");
    expect(styles).toContain(".pcab-call");
    expect(styles).toContain(".pcab-step-n");
  });

  it("uses platform tokens/fonts — no mockup Google fonts leak", () => {
    const styles = css();
    expect(styles).toMatch(/\.pcab-revnum\s*\{[^}]*font-family:\s*var\(--font-heading\)/);
    expect(styles).not.toContain("Lora");
    expect(styles).not.toContain("Geist");
  });
});
