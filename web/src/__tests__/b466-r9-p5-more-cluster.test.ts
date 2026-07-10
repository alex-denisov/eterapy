import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9 «Ещё» (батч 2) — информационные экраны кластера 1-в-1 по mockups
// practitioner-more-verification / -more-ethics-code / -more-invite.
// Паттерн: page.tsx рендерит pcab-screen (md:hidden, data-pcab-top) + прежний
// десктоп (hidden md:block); серверные загрузчики переиспользуются.
// Owner R9: без встроенного PDF-вьюера и скачивания PDF (кнопка «Скачать» из
// макета кодекса НЕ отгружена); документ-оферта остаётся ссылкой на /legal.

const PRAC = "src/app/cabinet/practitioner";

describe("R9 «Ещё» — Верификация (verification)", () => {
  const page = () => source(`${PRAC}/verification/page.tsx`);

  it("renders a mobile status banner + benefits, desktop hidden", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-verification-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toContain('data-testid="practitioner-verification-status-mobile"');
    expect(src).toContain("pcab-summary");
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-verification-page"'); // прежний десктоп-testid
  });

  it("reuses the real request-based mechanic (no fabricated per-document steps)", () => {
    const src = page();
    // Честный статус — реальная карточка заявки, а не фейковые «Личность подтверждено».
    expect(src).toContain("VerificationRequestCard");
    expect(src).toContain("Подтверждено");
    expect(src).toContain("На проверке");
    expect(src).toContain("Не пройдена");
    // Макет рисует пошаговый статус документов — мы его НЕ выдумываем.
    expect(src).not.toContain("act-review");
  });
});

describe("R9 «Ещё» — Этический кодекс (ethics/code)", () => {
  const page = () => source(`${PRAC}/ethics/code/page.tsx`);

  it("renders a mobile document with clauses + accepted summary, desktop hidden", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-ethics-code-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toContain("pcab-doc-body");
    expect(src).toContain("pcab-clause");
    expect(src).toContain("PRINCIPLES.map"); // канонический контент переиспользуется
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-ethics-code-page"');
  });

  it("drops the mockup download button (owner R9: no PDF download/viewer)", () => {
    const src = page();
    expect(src).toContain("pcab-topbar-spacer"); // место кнопки «Скачать» → spacer
    expect(src).not.toContain('aria-label="Скачать"'); // нет download-кнопки макета
  });
});

describe("R9 «Ещё» — Приглашения (invite)", () => {
  const page = () => source(`${PRAC}/invite/page.tsx`);
  const panel = () => source(`${PRAC}/invite/invite-panel.tsx`);

  it("page renders the pcab mobile tree with matrix-derived hero rates, desktop hidden", () => {
    const src = page();
    expect(src).toContain('data-testid="practitioner-invite-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toContain('variant="pcab"');
    expect(src).toContain("heroRates={heroRates}");
    // Ставки из матрицы комиссий (code == matrix), не хардкод в JSX.
    expect(src).toContain("BYOC_LADDER.practitioner_pro");
    expect(src).toContain("PLATFORM_COMMISSION_BY_TIER.practitioner_pro");
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-invite-page"');
  });

  it("panel pcab variant renders hero + link card + copy/share + stats + steps", () => {
    const src = panel();
    expect(src).toContain('variant === "pcab"');
    expect(src).toContain("pcab-inv-hero");
    expect(src).toContain("pcab-linkcard");
    expect(src).toContain('data-testid="invite-copy-mobile"');
    expect(src).toContain("pcab-inv-steps");
    expect(src).toContain("приглашено");
    expect(src).toContain("активных клиентов");
    expect(src).toContain("navigator.share"); // «Поделиться» c fallback на копирование
  });

  it("keeps the desktop panel (create form + table) unchanged for md and up", () => {
    const src = page();
    // Десктоп рендерит панель без variant — форма создания + таблица приглашений.
    expect(src).toContain("<PractitionerInvitePanel initialInvites={invitesForPanel} />");
  });
});

describe("R9 «Ещё» — cockpit CSS (doc + invite hero, platform fonts)", () => {
  const css = () => source("src/app/cabinet/practitioner-cockpit.css");

  it("defines the document clause + invite hero/steps primitives", () => {
    const styles = css();
    expect(styles).toContain(".pcab-doc-body");
    expect(styles).toContain(".pcab-clause-n");
    expect(styles).toContain(".pcab-inv-hero");
    expect(styles).toContain(".pcab-rate-box");
    expect(styles).toContain(".pcab-inv-steps");
  });

  it("uses platform heading font for the document title (no mockup Google fonts)", () => {
    const styles = css();
    expect(styles).toMatch(/\.pcab-doc-title\s*\{[^}]*font-family:\s*var\(--font-heading\)/);
    expect(styles).not.toContain("Lora");
    expect(styles).not.toContain("Geist");
  });
});
