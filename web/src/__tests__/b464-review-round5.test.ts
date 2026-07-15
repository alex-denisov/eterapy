import fs from "node:fs";
import path from "node:path";
import {
  daysWord,
  effectivePracticeStreak,
  pluralRu,
} from "@/lib/streak-display";
import {
  SUPPORT_SESSION_INACTIVITY_MS,
  canContinueSupportSession,
  canReuseSupportSession,
  isSupportSessionStale,
  supportSessionPreview,
} from "@/lib/support-sessions";

// B464 round-5 — owner staging re-review 2026-07-03 (14 items). Source
// assertions follow the project convention: grep the shipped source for the
// load-bearing fragments so a regression flips the suite red.

const root = process.cwd();
function read(rel: string): string {
  return fs.readFileSync(path.join(root, "src", rel), "utf8");
}

// ── #1/#2 · mobile bar + «Ещё» sheet live OUTSIDE the blurred header ─────────
describe("R14 items 1-2 — landing mobile bar is viewport-fixed", () => {
  it("renders the bar and sheet as header siblings (backdrop-filter containing block fix)", () => {
    const header = read("components/header.tsx");
    const headerClose = header.indexOf("</header>");
    expect(headerClose).toBeGreaterThan(-1);
    // The fixed bar + sheet markup must come AFTER the header element closes.
    expect(header.indexOf('data-testid="landing-mobile-nav"')).toBeGreaterThan(headerClose);
    expect(header.indexOf('data-testid="landing-mobile-sheet"')).toBeGreaterThan(headerClose);
  });

  it("gives the landing page bottom clearance for the fixed bar", () => {
    const css = read("app/v4-soft.css");
    expect(css).toContain('body:has([data-testid="landing-mobile-nav"])');
    expect(css).toContain("padding-bottom: calc(3.5rem + env(safe-area-inset-bottom, 0px))");
  });
});

// ── #3 · /products chips strip follows the scroll-spy ────────────────────────
describe("R13 item 3 — catalog chip strip auto-scrolls to the active chip", () => {
  it("scrolls the strip itself (not the page) when the active section changes", () => {
    const catalog = read("components/products/service-catalog.tsx");
    expect(catalog).toContain("navRef");
    expect(catalog).toContain(".soft-catalog-chip.is-active");
    expect(catalog).toContain("nav.scrollTo({ left:");
    expect(catalog).not.toContain("chip.scrollIntoView");
  });
});

// ── #4 · «Открыть …» + «Картой» in one compact row ───────────────────────────
describe("R13 item 4 — purchase controls one-row layout", () => {
  it("uses the nowrap purchase row with a compact mobile label", () => {
    const controls = read("components/products/product-purchase-controls.tsx");
    expect(controls).toContain("soft-purchase-row");
    expect(controls).toContain("Открыть за ${creditCost}");
    expect(controls).toContain("min-w-0 flex-1 justify-center");
    const css = read("app/v4-soft.css");
    expect(css).toContain(".soft-purchase-row");
    expect(css).toContain("flex-wrap: nowrap");
  });
});

// ── #5 · deep-report result footer follows the tarot-style triage only ───────
describe("R13 item 5 — deep-report recommendations moved to the result view", () => {
  it("renders the shared triage on the result view and does not show the stale depth ladder", () => {
    const actions = read("components/products/deep-report-actions.tsx");
    expect(actions).toContain('testId="deep-report-triage"');
    expect(actions).not.toContain("<FullQuestionBundleOffer");
    expect(actions).not.toContain("Выберите глубину");
  });
});

// ── #6 · вопрос дня: live streak, instant week strip, human copy ─────────────
describe("R15 item 6 — daily question streak logic and copy", () => {
  it("effectivePracticeStreak keeps the streak only when last done today/yesterday (UTC)", () => {
    const now = new Date("2026-07-03T10:00:00Z");
    expect(effectivePracticeStreak(3, new Date("2026-07-03T05:00:00Z"), now)).toBe(3);
    expect(effectivePracticeStreak(3, new Date("2026-07-02T23:59:00Z"), now)).toBe(3);
    // Broken chain — stale count must read as 0.
    expect(effectivePracticeStreak(1, new Date("2026-06-25T10:00:00Z"), now)).toBe(0);
    expect(effectivePracticeStreak(5, new Date("2026-07-01T10:00:00Z"), now)).toBe(0);
    expect(effectivePracticeStreak(0, new Date("2026-07-03T09:00:00Z"), now)).toBe(0);
    expect(effectivePracticeStreak(2, null, now)).toBe(0);
  });

  it("daysWord declines день/дня/дней including 11-14 and 21", () => {
    expect(daysWord(1)).toBe("день");
    expect(daysWord(2)).toBe("дня");
    expect(daysWord(5)).toBe("дней");
    expect(daysWord(11)).toBe("дней");
    expect(daysWord(14)).toBe("дней");
    expect(daysWord(21)).toBe("день");
    expect(pluralRu(3, ["балл", "балла", "баллов"])).toBe("балла");
  });

  it("home hides the streak badge without a live streak and speaks without «вехи»", () => {
    const home = read("app/cabinet/page.tsx");
    expect(home).toContain("effectivePracticeStreak(practiceStreak.count, practiceStreak.lastDoneDate");
    expect(home).toContain("{liveStreak > 0 && (");
    expect(home).not.toContain("вехи:");
    expect(home).toContain("Ответы сохраняются в Дневнике — их видите только вы.");
    expect(home).toContain("За регулярность приходят баллы");
  });

  it("marking the day refreshes the server-rendered week strip immediately", () => {
    const actions = read("components/cabinet/daily-practice-actions.tsx");
    expect(actions.split("router.refresh()").length - 1).toBe(2);
    expect(actions).not.toContain("баллы приходят на вехах");
    expect(actions).toContain("это первый день вашей серии");
  });

  it("diary and practice hide their streak counters when the chain is broken", () => {
    const diary = read("app/cabinet/diary/page.tsx");
    const practice = read("app/cabinet/practice/page.tsx");
    expect(diary).toContain("effectivePracticeStreak(practiceStreak.count, practiceStreak.lastDoneDate)");
    expect(practice).toContain("effectivePracticeStreak(practiceStreak.count, practiceStreak.lastDoneDate)");
    expect(practice).toContain("daysWord(practiceStreak.count)");
  });
});

// ── #7 · PIN disable requires the current PIN ────────────────────────────────
describe("R16 item 7 — diary PIN disable confirms with the current PIN", () => {
  it("verifies the entered PIN against the stored hash before removing it", () => {
    const control = read("components/cabinet/diary-pin-control.tsx");
    expect(control).toContain("verifyDiaryPin");
    expect(control).toContain('data-testid="diary-pin-disable-current"');
    expect(control).toContain("Неверный PIN");
    // The confirm view is a form so Enter submits the PIN check.
    expect(control).toContain('<form onSubmit={handleDisable}');
  });
});

// ── #8/#9/#10 · wallet cleanups ──────────────────────────────────────────────
describe("R13 items 8-10 — wallet copy and headings", () => {
  it("pack cards no longer duplicate the heading with «+N баллов на продукты каталога»", () => {
    const wallet = read("app/cabinet/wallet/page.tsx");
    expect(wallet).not.toContain("на продукты каталога");
  });

  it("the billing section has ONE heading per block (no wrapper eyebrow+h2 stack)", () => {
    const wallet = read("app/cabinet/wallet/page.tsx");
    expect(wallet).not.toContain("Подписка и карты");
    expect(wallet).not.toContain('className="soft-eyebrow">подписка и платежи');
    const panel = read("components/cabinet/billing-panel.tsx");
    expect(panel).toContain("Ваш тариф —");
    expect(panel).not.toContain('soft-eyebrow">подписка</p>');
  });

  it("plan prices never wrap (nbsp + nowrap)", () => {
    const panel = read("components/cabinet/billing-panel.tsx");
    expect(panel).toContain("whitespace-nowrap");
    expect(panel).toMatch(/\{priceRub\}(?:&nbsp;|\{" "\})₽/);
  });
});

// ── #12 · no terracotta outline on support inputs ────────────────────────────
describe("R13 item 12 — support inputs keep a calm focus", () => {
  it("suppresses the global terracotta :focus-visible outline on the support page", () => {
    const tokens = read("app/v5-tokens.css");
    expect(tokens).toContain('[data-testid="cabinet-support-page"] input:focus-visible');
    expect(tokens).toContain('[data-testid="cabinet-support-page"] textarea:focus-visible');
    expect(tokens).toContain('[data-testid="cabinet-support-page"] select:focus-visible');
  });
});

// ── #11 · settings hub (superseded by round-6 #1) ────────────────────────────
describe("R20 item 1 — settings hub of icon rows", () => {
  it("renders the nudge + icon-row sections and keeps every handler", () => {
    const settings = read("app/cabinet/settings/settings-client.tsx");
    expect(settings).toContain("function SettingsHubRow(");
    expect(settings).toContain('data-testid="settings-about-nudge"');
    // Section ids preserved.
    for (const id of [
      "settings-group-profile",
      "settings-group-security",
      "settings-group-notifications",
      "settings-group-danger",
    ]) {
      expect(settings).toMatch(new RegExp(`(data-testid|testId)="${id}"`));
    }
    // Handlers preserved 1:1.
    for (const handler of [
      "handleSaveProfile",
      "handleSavePassword",
      "handleSetPasswordRequest",
      "handleUnlinkProvider",
      "handleDeleteAccount",
    ]) {
      expect(settings).toContain(handler);
    }
  });
});

// ── #13 · staged support centre + chat sessions ──────────────────────────────
describe("R18 item 13 — staged support centre", () => {
  it("starts with ONLY the knowledge-base search; categories appear after a search", () => {
    const center = read("components/support/support-help-center.tsx");
    expect(center).toContain("Поиск по базе знаний");
    // Round-6 #3: categories appear after a search AND stay while a category is
    // picked (so the block survives an emptied query).
    expect(center).toContain("{(searched || category) && (");
    expect(center).toContain("Не нашли нужный вопрос? Выберите из категории ниже");
    // Escalation only once a category is chosen.
    expect(center).toContain("{category && (");
    expect(center).toContain("Не нашли ответ на свой вопрос?");
    expect(center).not.toContain("Всё ещё остались вопросы?");
  });

  it("keeps at most one FAQ item open at a time", () => {
    const center = read("components/support/support-help-center.tsx");
    expect(center).toContain("function FaqAccordion(");
    expect(center).toContain("const [openId, setOpenId] = useState<string | null>(null)");
    expect(center).toContain("setOpenId(open ? null : item.id)");
  });

  it("escalation cards: mailto · inline form · chat gated to sensitive topics", () => {
    const center = read("components/support/support-help-center.tsx");
    expect(center).toContain('href="mailto:support@eterapy.com"');
    expect(center).toContain('data-testid="support-open-form"');
    expect(center).toContain('data-testid="support-open-chat"');
    expect(center).toContain("{allowsChat && (");
    expect(center).toContain("SupportRequestForm");
    const form = read("components/support/support-request-form.tsx");
    expect(form).toContain("DETAILS_MIN = 20");
    expect(form).toContain("DETAILS_MAX = 1000");
    expect(form).toContain("newSession: true");
  });
});

describe("R18 item 13 — support chat sessions", () => {
  it("session helpers: 30-min inactivity timeout, latest-only continue", () => {
    const now = new Date("2026-07-03T12:00:00Z");
    const fresh = new Date(now.getTime() - 10 * 60 * 1000);
    const stale = new Date(now.getTime() - SUPPORT_SESSION_INACTIVITY_MS - 1000);
    expect(isSupportSessionStale(fresh, now)).toBe(false);
    expect(isSupportSessionStale(stale, now)).toBe(true);
    expect(canReuseSupportSession("OPEN", fresh, now)).toBe(true);
    expect(canReuseSupportSession("OPEN", stale, now)).toBe(false);
    expect(canReuseSupportSession("CLOSED", fresh, now)).toBe(false);
    expect(canContinueSupportSession("a", "a")).toBe(true);
    expect(canContinueSupportSession("a", "b")).toBe(false);
    expect(canContinueSupportSession("a", null)).toBe(false);
    expect(supportSessionPreview("  Проблема   с оплатой  ")).toBe("Проблема с оплатой");
    expect(supportSessionPreview(null)).toBe("Обращение в поддержку");
  });

  it("the messages API resolves sessions: continue latest-only, reopen, new session", () => {
    const route = read("app/api/support/messages/route.ts");
    expect(route).toContain("resolveConversation");
    expect(route).toContain("NOT_LATEST_SESSION");
    expect(route).toContain("newSession");
    expect(route).toContain("conversationId: z.string().trim().min(1).optional()");
    expect(route).toContain('searchParams.get("conversationId")');
  });

  it("the conversations API lists sessions and lazily closes stale ones", () => {
    const route = read("app/api/support/conversations/route.ts");
    expect(route).toContain("isSupportSessionStale");
    expect(route).toContain('status: "CLOSED", closedAt: now');
    expect(route).toContain("canContinue: c.id === latestId");
  });

  it("closed sessions can be reopened by superadmin before replying", () => {
    const adminThread = read("app/api/admin/support/conversations/[id]/route.ts");
    expect(adminThread).toContain('z.enum(["OPEN", "CLOSED"])');
    expect(adminThread).toContain('error: "Сначала переоткройте обращение"');
    expect(adminThread).toContain('role: "STAFF"');
  });

  it("the chat widget auto-starts with no sessions and offers view/continue with history", () => {
    const chat = read("components/support/support-chat.tsx");
    expect(chat).toContain('data-testid="support-chat-picker"');
    expect(chat).toContain('data-testid="support-chat-new-session"');
    expect(chat).toContain("s.canContinue");
    expect(chat).toContain("/api/support/conversations");
    expect(chat).toContain("30 минут сессия закрывается");
  });
});
