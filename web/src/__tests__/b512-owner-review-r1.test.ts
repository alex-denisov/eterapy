import fs from "node:fs";
import path from "node:path";
import { normalizeMarkdownLists, parseMarkdownBlocks } from "@/lib/markdown";

// B512 — owner review round-1 (2026-07-15), 12 пунктов. Тикет:
// docs/v5-release/tasks/tickets/B512-client-cabinet-new-visual.md (work-log).

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("R1-1 — /results/[id] = оригинальная страница результата", () => {
  const page = source("src/app/cabinet/results/[id]/page.tsx");

  it("redirects restore-capable products to the original product page", () => {
    expect(page).toContain("READING_RESTORE_KEYS");
    expect(page).toContain("redirect(mainUrl(`/products/${result.productKey}?reading=${result.id}`))");
    expect(page).toContain('"deep-report": (id) => `/products/deep-report?resultId=${id}`');
    expect(page).toContain('"chat-analysis": (id) => `/products/chat-analysis?analysis=${id}`');
    for (const key of ["surname-origin", "family-questions", "tarot", "human-design", "horoscope", "compatibility-by-date"]) {
      expect(page).toContain(`"${key}"`);
    }
  });

  it("drops the txt-download and mounts PDF+share actions", () => {
    // Старый «Скачать текстом» был data:text/plain-ссылкой — её больше нет.
    expect(page).not.toContain("data:text/plain");
    expect(page).toContain("ResultExportActions");
  });

  it("export actions: PDF goes through mainUrl (app-поддомен переписал бы путь), share is native/copy", () => {
    const actions = source("src/components/products/result-export-actions.tsx");
    expect(actions).toContain("mainUrl(`/products/print/${resultId}`)");
    expect(actions).toContain("navigator.share");
    expect(actions).toContain("navigator.clipboard.writeText");
    expect(actions).not.toContain("data:text/plain");
  });

  it("SymbolicResultScaffold renders the actions on every symbolic result", () => {
    const scaffold = source("src/components/products/symbolic-result-scaffold.tsx");
    expect(scaffold).toContain("ResultExportActions");
    expect(scaffold).toContain("resultId");
  });
});

describe("R1-3 — единый источник баланса", () => {
  it("transactions API returns the server-computed balance", () => {
    const route = source("src/app/api/billing/transactions/route.ts");
    expect(route).toContain("getClarityCreditBalance");
    expect(route).toContain("clarityCreditBalance");
  });

  it("the shared hook prefers the server balance over client-side summing", () => {
    const hook = source("src/components/use-clarity-credit-balance.ts");
    expect(hook).toContain("d?.clarityCreditBalance");
  });
});

describe("R1-4 — клиентский сайдбар sticky как у практика", () => {
  it("both cabinets share the full-bleed sticky sidebar column", () => {
    const shell = source("src/components/cabinet/cabinet-shell.tsx");
    expect(shell).toContain('className="soft-app-sidebar-col hidden shrink-0 md:block"');
    expect(shell).not.toContain("sticky top-16 hidden shrink-0 self-start md:flex");
    const css = source("src/app/v4-soft.css");
    expect(css).toContain('.soft-app-shell[data-shell-role="CLIENT"] .soft-app-layout');
  });
});

describe("R1-5/6/10 — Главная: реордер, PIN-strip, CTA «первых шагов»", () => {
  const home = source("src/app/cabinet/page.tsx");

  it("B602: управление PIN осталось только в «Дневнике»", () => {
    // Владелец 2026-07-27 снял строку с Главной вместе с приватными блоками.
    expect(home).not.toContain("HomePinStrip");
    const control = source("src/components/cabinet/diary-pin-control.tsx");
    expect(control).toContain("renderTrigger");
    expect(source("src/app/cabinet/diary/page.tsx")).toContain("DiaryPinControl");
  });

  it("«первые шаги» carries an explicit expand CTA", () => {
    expect(home).toContain('data-testid="client-first-steps-cta"');
    expect(home).toContain("Показать шаги");
  });
});

describe("R1-7/8/9 — Дневник", () => {
  it("journal strip: last 7 days as square cards with a detail panel", () => {
    const diary = source("src/app/cabinet/diary/page.tsx");
    expect(diary).toContain("JournalCardsStrip");
    expect(diary).toContain("listJournalEntries(userId, 7)");
    const strip = source("src/components/cabinet/journal-cards-strip.tsx");
    expect(strip).toContain('data-testid="diary-journal-card"');
    expect(strip).toContain('data-testid="diary-journal-detail"');
    expect(strip).toContain("aspect-square");
  });

  it("вопрос дня rotates dynamic hints (not a single static prompt)", () => {
    const actions = source("src/components/cabinet/daily-practice-actions.tsx");
    expect(actions).toContain("REFLECTION_HINTS");
    expect(actions).toContain("useRotatingPlaceholder");
    expect(actions).toContain("Нужна подсказка? «{currentHint}»");
  });
});

describe("R1-11 — «Семейные вопросы» upgrade", () => {
  it("expert prompt: full section map + client-history requirement + list discipline", () => {
    const prompts = source("src/lib/ai-gateway/prompts.ts");
    const familyBlock = prompts.slice(
      prompts.indexOf('"product-family-questions"'),
      prompts.indexOf('"product-human-design"'),
    );
    expect(familyBlock).toContain("## Прямой ответ");
    expect(familyBlock).toContain("Скрытые лояльности и незакрытые счета");
    expect(familyBlock).toContain("Практики прерывания на 14 дней");
    expect(familyBlock).toContain("### Как проверить у себя");
    expect(familyBlock).toContain("историю тем клиента");
    expect(familyBlock).toContain("Списки оформляй строго в markdown");
  });

  it("segmented generation: headings + quality floor + layer sub-structure", () => {
    const lib = source("src/lib/symbolic-products.ts");
    expect(lib).toContain('if (input.productKey === "family-questions") {');
    expect(lib).toContain("Контрсценарий: как не уйти в противоположность");
    expect(lib).toContain("FAMILY_LAYER_HEADINGS");
    expect(lib).toContain('"family-questions": 6_000');
    expect(lib).toContain("clientContextNote");
  });

  it("route feeds the client's own topic/разбор history into the prompt", () => {
    const route = source("src/app/api/products/symbolic/route.ts");
    expect(route).toContain("buildFamilyClientContext");
    expect(route).toContain("ИСТОРИЯ ТЕМ КЛИЕНТА");
    // Списание: paywall-only + атомарный consume уже покрыты b451-тестами.
    expect(route).toContain("consumeProductEntitlementForUse(tx, userId, productKey)");
  });

  it("direct-answer heading gets the family-specific display title", () => {
    const scaffold = source("src/components/products/symbolic-result-scaffold.tsx");
    expect(scaffold).toContain('"family-questions": "Главный вывод карты рода"');
  });
});

describe("R1-11d — markdown lists render correctly", () => {
  it("does NOT split dash-as-тире sentences into fake bullets", () => {
    const text = "Правило рода - не говорить о чувствах - держится уже три поколения.";
    expect(normalizeMarkdownLists(text)).toBe(text);
    const blocks = parseMarkdownBlocks(text);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe("paragraph");
  });

  it("still expands inline numbered enumerations and • bullets", () => {
    const numbered = parseMarkdownBlocks("Шаги: 1. Назвать сценарий 2. Проверить у себя 3. Выбрать замену");
    const numberedList = numbered.find((block) => block.type === "list");
    expect(numberedList && numberedList.type === "list" ? numberedList.items.length : 0).toBe(3);

    const bullets = parseMarkdownBlocks("Итог: • роль спасателя • запрет на просьбы");
    const bulletList = bullets.find((block) => block.type === "list");
    expect(bulletList && bulletList.type === "list" ? bulletList.items.length : 0).toBe(2);
  });

  it("keeps line-start hyphen bullets working", () => {
    const blocks = parseMarkdownBlocks("- один\n- два");
    expect(blocks[0].type).toBe("list");
  });
});

describe("R1-12 — поблочный PIN-blur на Главной", () => {
  it("gate component: blur + per-block unlock, no global unlock write", () => {
    const gate = source("src/components/cabinet/pin-blur-gate.tsx");
    expect(gate).toContain("blur-md");
    expect(gate).toContain("verifyDiaryPin");
    expect(gate).toContain('data-testid="pin-blur-unlock"');
    expect(gate).toContain('data-testid="pin-blur-form"');
    // Разблокировка по-блочно: метку Дневника компонент НЕ пишет.
    expect(gate).not.toContain("sessionStorage.setItem");
  });

  it("wraps the private blocks that remain on Главная", () => {
    // B602: «Ваши результаты» сняты с Главной, поэтому и гейта на них нет.
    // Оставшиеся приватные блоки по-прежнему за PIN — снятие строки управления
    // приватность не ослабило.
    const home = source("src/app/cabinet/page.tsx");
    expect(home).not.toContain('<PinBlurGate label="Ваши результаты">');
    expect(home).toContain('<PinBlurGate label="Ваш дневник">');
    expect(home).toContain('<PinBlurGate label="Что дальше по вашей теме">');
    expect(home).toContain('<PinBlurGate label="Работа со специалистом">');
  });

  it("Дневник целиком остаётся за PIN-гейтом", () => {
    const diary = source("src/app/cabinet/diary/page.tsx");
    expect(diary).toContain("<DiaryPinGate>");
  });
});

describe("R1-7 — разборы автосохраняются в Дневник", () => {
  it("diary product feed no longer requires manual savedAt", () => {
    const helper = source("src/lib/diary.ts");
    expect(helper).not.toContain("savedAt: { not: null }");
  });
});
