import fs from "node:fs";
import path from "node:path";

const source = (relativePath: string) => fs.readFileSync(path.join(process.cwd(), relativePath), "utf8");

describe("G16 — practitioner header hides «Новый разбор»", () => {
  it("gates the new-dialogue CTA by client class (not staff, not practitioner)", () => {
    const header = source("src/components/header.tsx");
    expect(header).toContain("const showNewDialogueCta = isAuthenticated && !isStaff && !isPractitioner;");
    // Mobile «Начать диалог» reuses the same gate so practitioners never see it.
    expect(header).toContain("{showNewDialogueCta && (");
  });

  it("shows practitioners a money-only balance without clarity credits", () => {
    const header = source("src/components/header.tsx");
    expect(header).toContain("const showPractitionerMoneyBalance = isAuthenticated && isPractitioner;");
    expect(header).toContain("header-money-balance");
    expect(header).toContain('href={appUrl("/practitioner/earnings")}');
    expect(header).toContain('fetch("/api/practitioner/balance")');
    expect(header).toContain("practitionerBalanceKopecks");
  });
});

describe("G12 — action-history «все элементы карты» readable cards", () => {
  it("renders a full-width break-words body with a description fallback", () => {
    const page = source("src/app/cabinet/diary/page.tsx");
    expect(page).toContain("const previewBody = item.bodyMarkdown?.trim();");
    expect(page).toContain("[overflow-wrap:anywhere]");
    // single-column card, body no longer trapped in a narrow flex track
    expect(page).toContain("soft-card flex flex-col gap-4 p-5 md:p-6");
  });
});

describe("G13 — credits sells paid products with prices", () => {
  it("uses the real ₽ price and keeps the badge on one line", () => {
    const page = source("src/app/cabinet/wallet/page.tsx");
    expect(page).toContain("getProductPriceKopecks");
    expect(page).toContain("creditsWord");
    expect(page).toContain("priceKopecks");
    expect(page).toContain("shrink-0 whitespace-nowrap");
    // purchasable products surface the price as the badge headline
    expect(page).toContain("${priceRub} ₽");
  });

  it("Z4 dependency: does not reopen circle or pair through a Premium special case", () => {
    const page = source("src/app/cabinet/wallet/page.tsx");

    expect(page).toContain("plan?.includedProducts.forEach");
    expect(page).not.toContain('subscriptionProducts.add("circle")');
    expect(page).not.toContain('subscriptionProducts.add("pair")');
  });
});

describe("G15 — billing card faces, top-up, and history", () => {
  it("darkens the card gradient and shadows the number for legibility", () => {
    const page = source("src/app/cabinet/billing/page.tsx");
    expect(page).toContain("linear-gradient(135deg, #4a2122");
    expect(page).toContain("textShadow");
  });

  it("Z1-Ф1: drops the ₽ top-up field — billing manages cards + subscription only", () => {
    const page = source("src/app/cabinet/billing/page.tsx");
    // The client ₽ balance rail is removed: no top-up input, no balance state.
    expect(page).not.toContain("topUpRaw");
    expect(page).not.toContain('data-testid="client-topup-amount"');
    // Saved-card management stays — it's the card rail for sessions/subscriptions.
    expect(page).toContain('data-testid="client-saved-cards"');
    expect(page).toContain("handleSetDefaultCard");
  });

  it("drops the confusing up/down arrows from history for a colored dot", () => {
    const table = source("src/components/cabinet/billing-history-table.tsx");
    expect(table).not.toContain("ArrowUp");
    expect(table).not.toContain("ArrowDown");
    expect(table).toContain("size-2 shrink-0 rounded-full");
    // compact segmented direction filter instead of the old oversized chip row
    expect(table).toContain("inline-flex shrink-0 rounded-full border");
  });
});

describe("G14 — Практика ясности full three-beat mechanic", () => {
  it("adds a daily-card library helper that answers the user-authored question", () => {
    const lib = source("src/lib/daily-card.ts");
    expect(lib).toContain("export async function generatePracticeResponseForQuestion");
    expect(lib).toContain("GENERIC_PRACTICE_RESPONSE");
    expect(lib).toContain("export function dailyCardUserQuestion");
  });

  it("exposes a reflect action on the daily-card API that grants the reward once", () => {
    const route = source("src/app/api/cabinet/daily-card/route.ts");
    expect(route).toContain('payload?.action === "reflect"');
    expect(route).toContain("generatePracticeResponseForQuestion");
    expect(route).toContain("userQuestion: question");
  });

  it("renders the calendar as a real Mon→Sun week with future days", () => {
    const page = source("src/app/cabinet/practice/page.tsx");
    expect(page).toContain("loadWeekStrip");
    expect(page).toContain("isFuture");
    expect(page).toContain("WEEKDAY_RU_SHORT");
  });

  it("lets the user write their own вопрос дня and request взгляд + шаг", () => {
    const actions = source("src/components/cabinet/daily-practice-actions.tsx");
    expect(actions).toContain('action: "reflect"');
    expect(actions).toContain("Получить взгляд и шаг");
    expect(actions).toContain("ваш вопрос дня");
    expect(actions).toContain("practice-suggested-prompt");
  });
});
