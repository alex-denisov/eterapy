import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9 «Ещё» → Разборы и AI (mockup practitioner-ai-usage). Мобильный
// pcab-native экран: METERED-квота месяца + глобальный авто-разбор + per-session
// тумблеры + докупка пакетов (с подтверждением, round-8 #6) + авто-докупка.
// НЕ обёртка десктопного AiUsageClient — реюз ДАННЫХ и эндпоинтов ai-settings/
// ai-topup.

const PRAC = "src/app/cabinet/practitioner";

describe("R9 «Ещё» → Разборы и AI — mobile pcab screen", () => {
  const editor = () => source(`${PRAC}/ai-usage/ai-usage-mobile.tsx`);

  it("renders a dedicated pcab mobile screen (topbar «Разборы и AI», spacer)", () => {
    const src = editor();
    expect(src).toContain('data-testid="practitioner-ai-usage-mobile"');
    expect(src).toContain("data-pcab-top");
    expect(src).toMatch(/pcab-screen[^"]*md:hidden/);
    expect(src).toContain("Разборы и AI");
    expect(src).toContain("pcab-topbar-spacer");
  });

  it("quota hero shows used/included, tier name and a progress fill", () => {
    const src = editor();
    expect(src).toContain("pcab-quota");
    expect(src).toContain("practitionerTierName(quota.tier)");
    expect(src).toContain("pcab-track");
    expect(src).toContain("pcab-fill");
    expect(src).toContain("quota.resetLabel");
    expect(src).toContain("Math.round((quota.used / quota.included) * 100)");
  });

  it("global + per-session + auto-topup toggles persist via ai-settings PATCH", () => {
    const src = editor();
    expect(src).toContain("/api/practitioner/ai-settings");
    expect(src).toContain('method: "PATCH"');
    expect(src).toContain("aiAutoAnalyze: next");
    expect(src).toContain("bookingId: id, enabled: next");
    expect(src).toContain("aiAutoTopup: next");
    // per-session effective = per-session override ?? global default
    expect(src).toContain("s.aiAnalysisEnabled ?? autoAnalyze");
  });

  it("top-up packs buy via ai-topup POST with a confirm step (round-8 #6) + «выгодно» badge", () => {
    const src = editor();
    expect(src).toContain("/api/practitioner/ai-topup");
    expect(src).toContain("setConfirmUnits(pack.units)"); // тап пакета = подтверждение, не сразу списание
    expect(src).toContain('data-testid="practitioner-ai-pack-confirm-mobile"');
    expect(src).toContain('data-testid="practitioner-ai-pack-confirm-buy-mobile"');
    expect(src).toContain("pcab-pack-badge");
    expect(src).toContain("выгодно");
    expect(src).toContain("INSUFFICIENT_EARNINGS");
  });

  it("keeps the always-on transcription/compliance note", () => {
    const src = editor();
    expect(src).toContain("pcab-note");
    expect(src).toContain("всегда включены и лимит не тратят");
  });
});

describe("R9 «Ещё» → Разборы и AI — page split", () => {
  const page = () => source(`${PRAC}/ai-usage/page.tsx`);

  it("renders the pcab screen on mobile and the previous desktop tree hidden below md", () => {
    const src = page();
    expect(src).toContain("AiUsageMobile");
    expect(src).toMatch(/hidden[^"]*md:block/);
    expect(src).toContain('data-testid="practitioner-ai-usage-page"'); // прежний десктоп-testid
    // общие props для обоих деревьев (без дублей маппинга)
    expect(src).toContain("const quotaProps");
    expect(src).toContain("const upcomingProps");
  });
});
