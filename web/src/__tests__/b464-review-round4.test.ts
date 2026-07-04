import fs from "node:fs";
import path from "node:path";
import { toCabinetPathname } from "@/lib/subdomain";
import { DIARY_PIN_CHANGED_EVENT } from "@/lib/diary-pin";

// B464 review round 4 (owner staging walkthrough 2026-07-02, 18 items).
// Behaviour tests for the pure logic + source assertions locking the UI fixes.

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, "..", rel), "utf8");

// ── R1 · item 1 — the cabinet service bridge must show on EVERY cabinet page ──
describe("R1 item 1 — app-area detection covers all cabinet pages", () => {
  it("maps the cabinet-only routes (incl. new /invite and /support) to /cabinet form", () => {
    expect(toCabinetPathname("/invite")).toBe("/cabinet/invite");
    expect(toCabinetPathname("/support")).toBe("/cabinet/support");
    expect(toCabinetPathname("/chat")).toBe("/cabinet/chat");
    expect(toCabinetPathname("/results/abc")).toBe("/cabinet/results/abc");
    expect(toCabinetPathname("/diary")).toBe("/cabinet/diary");
  });

  it("does NOT hijack routes that also exist on the main domain", () => {
    // /modalities and /practitioners are public landing routes — mapping them
    // would strip the landing nav on those pages.
    expect(toCabinetPathname("/modalities")).toBe("/modalities");
    expect(toCabinetPathname("/practitioners")).toBe("/practitioners");
  });

  it("header detects the app/admin host via configured domains (staging-safe)", () => {
    const header = read("components/header.tsx");
    // `staging.app.eterapy.com` does not start with "app." — the naive prefix
    // check broke the bridge on staging. Detection goes through getSubdomain().
    expect(header).not.toContain('hostname.startsWith("app.")');
    expect(header).not.toContain('hostname.startsWith("admin.")');
    expect(header).toContain("getSubdomain(hostname)");
  });
});

// ── R1 · item 8 — sidebar diary lock reflects PIN state and is clickable ──
describe("R1 item 8 — sidebar diary lock", () => {
  it("exports a change event so the sidebar can track PIN set/disable live", () => {
    expect(DIARY_PIN_CHANGED_EVENT).toBe("eterapy:diary-pin-changed");
  });

  it("renders LockOpen without a PIN and Lock with one, links to the PIN setup", () => {
    const shell = read("components/cabinet/cabinet-shell.tsx");
    expect(shell).toContain("hasDiaryPinStored");
    expect(shell).toContain("DIARY_PIN_CHANGED_EVENT");
    expect(shell).toContain("LockOpen");
    expect(shell).toContain("/diary?pin=setup");
    // The lock is its own link (desktop), not a decorative glyph inside the row link.
    expect(shell).toContain("app-shell-diary-lock");
  });
});

// ── R2 · item 15 — dialogs are Soft Clarity by default; review/complaint rules ──
describe("R2 item 15 — dialog theme + feedback validation", () => {
  it("ui/dialog defaults to the light Soft Clarity surface (dark theme retired)", () => {
    const dialog = read("components/ui/dialog.tsx");
    expect(dialog).not.toContain("bg-popover");
    expect(dialog).not.toContain("brand-midnight");
    expect(dialog).not.toContain("brand-warm-gold");
    expect(dialog).toContain("--soft-paper-card");
    expect(dialog).toContain("--soft-bordeaux");
  });

  it("review comment is required at ≤3★ and capped, shared client+server", async () => {
    const { reviewValidationError, reviewCommentRequired, REVIEW_TEXT_MAX } = await import("@/lib/session-feedback");
    expect(reviewCommentRequired(3)).toBe(true);
    expect(reviewCommentRequired(4)).toBe(false);
    expect(reviewValidationError(0, "")).toMatch(/оценку/i);
    expect(reviewValidationError(2, "")).toMatch(/что пошло не так/);
    expect(reviewValidationError(2, "коротко")).toMatch(/что пошло не так/);
    expect(reviewValidationError(2, "достаточно подробный комментарий")).toBeNull();
    expect(reviewValidationError(5, "")).toBeNull();
    expect(reviewValidationError(5, "а".repeat(REVIEW_TEXT_MAX + 1))).toMatch(/до 800/);
    const api = read("app/api/reviews/route.ts");
    expect(api).toContain("reviewValidationError");
  });

  it("complaint requires a reason, 20–1000 chars, shared client+server", async () => {
    const { complaintValidationError, COMPLAINT_DESCRIPTION_MAX } = await import("@/lib/session-feedback");
    expect(complaintValidationError("", "какое-то длинное описание ситуации")).toMatch(/причину/);
    expect(complaintValidationError("OTHER", "мало")).toMatch(/минимум 20/);
    expect(complaintValidationError("OTHER", "б".repeat(COMPLAINT_DESCRIPTION_MAX + 1))).toMatch(/до 1000/);
    expect(complaintValidationError("OTHER", "нормальное подробное описание ситуации")).toBeNull();
    const api = read("app/api/complaints/route.ts");
    expect(api).toContain("complaintValidationError");
  });

  it("complaint reasons are a select with no pre-picked value; old theme classes gone", () => {
    const complaint = read("components/complaint-modal.tsx");
    expect(complaint).toContain("<select");
    expect(complaint).toContain('value=""');
    expect(complaint).not.toContain("premium-input");
    expect(complaint).not.toContain("brand-soft-gold");
    const review = read("components/review-modal.tsx");
    expect(review).not.toContain("text-navy");
    expect(review).toContain("REVIEW_TEXT_MAX");
  });
});

// ── R3 · item 14 — empty «Предстоящие» invites the next session ──
describe("R3 item 14 — bookings empty upcoming tab", () => {
  it("renders the invite block instead of «Здесь пока пусто» on the upcoming tab", () => {
    const bookings = read("app/cabinet/bookings/page.tsx");
    expect(bookings).toContain('filter === "upcoming" ? (');
    expect(bookings).toContain("<InviteBlock hasPast={pastDone.length > 0} />");
    // The bottom invite no longer duplicates on the upcoming tab.
    expect(bookings).toContain('!hasUpcoming && filter !== "upcoming"');
    // The invite copy adapts: continue vs first meeting.
    expect(bookings).toContain("Хотите продолжить работу со специалистом?");
    expect(bookings).toContain("Иногда живой разговор помогает больше всего");
  });
});

// ── R4 · items 9·10 — ONE PIN control (modal), no duplicated CTAs ──
describe("R4 items 9·10 — diary PIN control", () => {
  it("the gate only guards; set/change/disable live in the modal control", () => {
    const gate = read("components/cabinet/diary-pin-gate.tsx");
    expect(gate).not.toContain("Закрыть дневник PIN-кодом");
    expect(gate).not.toContain("diary-pin-enable-cta");
    expect(gate).not.toContain("PIN включён · отключить");
    const control = read("components/cabinet/diary-pin-control.tsx");
    expect(control).toContain("diary-pin-modal");
    expect(control).toContain("Сменить PIN-код");
    expect(control).toContain("Отключить PIN-код");
    expect(control).toContain("notifyDiaryPinChanged");
    expect(control).toContain("autoOpen");
  });

  it("the old inline-form button is gone and the page has no duplicate «Задать вопрос»", () => {
    expect(fs.existsSync(path.join(__dirname, "..", "components/cabinet/diary-pin-button.tsx"))).toBe(false);
    const diary = read("app/cabinet/diary/page.tsx");
    expect(diary).toContain("DiaryPinControl");
    expect(diary).toContain('pin === "setup"');
    // item 10: the header-dialogue-cta carries «Задать вопрос»; the page keeps
    // it only in the empty state, not as a second header button.
    const headerBlock = diary.slice(0, diary.indexOf("diary-habit-hero"));
    expect(headerBlock).not.toContain("Задать вопрос");
  });
});

// ── R5 · items 6·11 — вопрос дня is the full ritual on Главная + Дневник ──
describe("R5 items 6·11 — functional вопрос дня", () => {
  it("Главная renders the full ritual (textarea → взгляд+шаг), not a bare mark-done", () => {
    const home = read("app/cabinet/page.tsx");
    expect(home).toContain('variant="full"');
    expect(home).toContain("initialReflection={dailyCard.reflectionText}");
    expect(home).toContain("dailyCardBeats");
    // The lifecycle is explained: stored in the diary + weekly summary.
    expect(home).toContain("итог недели");
  });

  it("Дневник habit hero renders the same full ritual", () => {
    const diary = read("app/cabinet/diary/page.tsx");
    expect(diary).toContain('variant="full"');
    expect(diary).toContain("initialReflection={dailyCard.reflectionText}");
  });

  it("practice actions use plain soft-buttons (hover contrast fix)", () => {
    const actions = read("components/cabinet/daily-practice-actions.tsx");
    expect(actions).not.toContain('from "@/components/ui/button"');
    expect(actions).toContain('className={done ? "soft-button soft-button-ghost" : "soft-button soft-button-primary"}');
  });
});

// ── R6 · items 2·3·4·5 — the home page runs on the recommendation engine ──
describe("R6 items 2-5 — engine-driven Главная", () => {
  it("hero, nudge, diary card and practitioner plan come from cabinet-recommendations", () => {
    const home = read("app/cabinet/page.tsx");
    expect(home).toContain("buildHeroAction(signals, seed)");
    expect(home).toContain("buildServiceNudge(signals, seed)");
    expect(home).toContain("buildDiaryCard(signals, seed)");
    expect(home).toContain("planPractitionerCard(signals)");
    expect(home).toContain("daySeed(userId, now)");
    // Booking-aware practitioner card: continue-with-the-same-specialist mode.
    expect(home).toContain('data-practitioner-mode="continue"');
    expect(home).toContain("Записаться снова");
  });

  it("«ваши результаты» merge dialogues + product разборы, meta = datetime → category", () => {
    const home = read("app/cabinet/page.tsx");
    expect(home).toContain("db.productResult.findMany");
    expect(home).toContain("resultWhen(item.when)");
    expect(home).toContain("PRODUCT_LABELS[r.productKey]");
    // datetime carries minutes and comes BEFORE the category label.
    expect(home).toContain('hour: "2-digit", minute: "2-digit"');
    expect(home).toContain("{resultWhen(item.when)} · {item.label}");
  });

  it("the self topic label reads «Про себя», not «Я и опоры»", () => {
    const router = read("lib/dialogue-router.ts");
    expect(router).toContain('self: "Про себя"');
  });
});

// ── R7 · item 7 — missions complete on real actions with clear goals ──
describe("R7 item 7 — first-steps goal set", () => {
  it("«Рассказать о себе» requires ≥2 meaningful profile fields", async () => {
    const { extendedProfileMissionReady } = await import("@/lib/missions");
    expect(extendedProfileMissionReady({})).toBe(false);
    expect(extendedProfileMissionReady({ occupation: "дизайнер" })).toBe(false);
    expect(extendedProfileMissionReady({ birthDate: new Date("1990-01-01"), aiGoals: ["career"] })).toBe(true);
    expect(extendedProfileMissionReady({ birthPlace: "Москва", maritalStatus: "married" })).toBe(true);
    expect(extendedProfileMissionReady({ birthPlace: "  ", aiGoals: [] })).toBe(false);
  });

  it("only the invite mission can be self-reported from the browser", async () => {
    const { SELF_REPORTABLE_MISSIONS } = await import("@/lib/missions");
    expect(SELF_REPORTABLE_MISSIONS).toEqual(["invite_shared"]);
    const api = read("app/api/cabinet/missions/route.ts");
    expect(api).toContain("SELF_REPORTABLE_MISSIONS.includes");
    expect(api).toContain("Эта цель начисляется автоматически");
  });

  it("the invite card reports the share on copy AND on Telegram", () => {
    const card = read("components/cabinet/invite-link-card.tsx");
    expect(card).toContain('missionKey: "invite_shared"');
    expect(card.split("reportShareMission()").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("a bare name save no longer completes «Рассказать о себе»; extended save is gated", () => {
    expect(read("app/api/auth/update-profile/route.ts")).not.toContain("completeMission");
    const extended = read("app/api/auth/extended-profile/route.ts");
    expect(extended).toContain("extendedProfileMissionReady(saved)");
  });

  it("goal descriptions name the exact completing action", async () => {
    const { ONBOARDING_MISSIONS } = await import("@/lib/missions");
    const byKey = Object.fromEntries(ONBOARDING_MISSIONS.map((m) => [m.key, m]));
    expect(byKey.first_practice.description).toContain("Засчитывается именно запись");
    expect(byKey.complete_profile.description).toContain("минимум два поля");
    expect(byKey.invite_shared.description).toContain("баллы придут вам обоим");
    // No unexplained jargon in titles.
    expect(byKey.first_product.title).not.toContain("формат");
  });
});

// ── R8 · item 12 — diary lists: principle, filters, compact 4+ещё ──
describe("R8 item 12 — diary lists", () => {
  it("journal explains its principle and reveals 4 at a time", () => {
    const diary = read("app/cabinet/diary/page.tsx");
    expect(diary).toContain("Здесь каждый день, когда вы отвечали на вопрос дня");
    expect(diary).toContain("<RevealList");
    // Entries distinguish the user's own question from the suggested prompt.
    expect(diary).toContain('entry.own ? "ваш вопрос" : "вопрос дня"');
  });

  it("topic chips are links that filter the list and preserve state", () => {
    const diary = read("app/cabinet/diary/page.tsx");
    expect(diary).toContain("diaryHref({ topic: topic.value, hidden: wantHidden })");
    expect(diary).toContain('data-testid="diary-topic-all"');
    expect(diary).toContain('item.kind === "dialogue" && item.topic === activeTopic');
  });

  it("the observation offers one optional action and asks nothing", () => {
    const diary = read("app/cabinet/diary/page.tsx");
    expect(diary).toContain("это просто наблюдение — можно ничего не делать");
    expect(diary).toContain('data-testid="diary-observation-cta"');
  });

  it("items render as compact rows inside ONE card (no gappy card stack)", () => {
    const diary = read("app/cabinet/diary/page.tsx");
    expect(diary).toContain('data-testid="diary-items-section"');
    expect(diary).toContain("divide-y divide-[var(--soft-paper-edge)]");
    expect(diary).toContain("line-clamp-2");
    expect(diary).not.toContain("SoftMarkdown");
  });
});

// ── R9 · item 13 — Кошелёк per blueprint: no catalog, calm history ──
describe("R9 item 13 — wallet money hub", () => {
  it("drops the spend catalog and keeps a slim bridge to the landing «Услуги»", () => {
    const wallet = read("app/cabinet/wallet/page.tsx");
    expect(wallet).not.toContain("Платные форматы и услуги");
    expect(wallet).not.toContain("credits-paid-recommendations");
    expect(wallet).not.toContain("ProductPurchaseControls");
    expect(wallet).toContain('data-testid="wallet-spend-bridge"');
    expect(wallet).toContain("Открыть каталог услуг");
  });

  it("histories render as calm rows, recent 4 + показать ещё", () => {
    const wallet = read("app/cabinet/wallet/page.tsx");
    const table = read("components/cabinet/billing-history-table.tsx");
    expect(wallet).toContain("<RevealList");
    expect(table).toContain("<RevealList");
    expect(table).not.toContain("<table");
    expect(table).not.toContain("billing-history-sort");
  });
});

// ── R10 · item 16 — Настройки: grouped rows on one scroll ──
describe("R10 item 16 — settings grouped rows", () => {
  it("replaces the tabs with anchored section groups", () => {
    const settings = read("app/cabinet/settings/settings-client.tsx");
    expect(settings).not.toContain("setActiveTab");
    expect(settings).toContain('data-testid="settings-anchors"');
    // Round-5 #11: groups render through <SettingsGroup testId=…> which sets
    // data-testid at runtime — assert the id regardless of the prop spelling.
    for (const id of ["settings-group-profile", "settings-group-about", "settings-group-security", "settings-group-notifications", "settings-group-danger"]) {
      expect(settings).toMatch(new RegExp(`(data-testid|testId)="${id}"`));
    }
    // Handlers and security testids preserved.
    expect(settings).toMatch(/(data-testid|testId)="linked-login-methods"/);
    expect(settings).toContain('data-testid="set-password-panel"');
    expect(settings).toContain("/api/auth/set-password-request");
    // Old-theme premium-input select is gone.
    expect(settings).not.toContain("premium-input");
  });
});

// ── R11 · item 18 — Центр поддержки + telegram-чат ──
describe("R11 item 18 — support centre", () => {
  it("the search card is the «Центр поддержки» hero with a clickable right-side loupe", () => {
    const center = read("components/support/support-help-center.tsx");
    expect(center).toContain("Центр поддержки");
    expect(center).toContain('data-testid="support-search-submit"');
    // The loupe sits AFTER the input in the form (right side).
    expect(center.indexOf("support-search-input")).toBeLessThan(center.indexOf("support-search-submit"));
    // Calm focus: wrapper focus-within + the global terracotta outline suppressed.
    expect(center).toContain("focus-within:border-[var(--soft-bordeaux)]/40");
    expect(center).toContain("focus-visible:outline-none");
  });

  // Round-5 #13 superseded the random 5: категория показывает детерминированный
  // список (первые 5 + «Показать ещё вопросы» ДОБАВЛЯЕТ следующие).
  it("a picked theme lists its questions deterministically with an additive «показать ещё»", async () => {
    const { listThemeQuestions } = await import("@/lib/support-faq");
    const pool = listThemeQuestions("finance");
    expect(pool.length).toBeGreaterThan(0);
    expect(pool.every((q) => q.cat === "payments")).toBe(true);
    expect(listThemeQuestions("finance").map((q) => q.id)).toEqual(pool.map((q) => q.id));
    const center = read("components/support/support-help-center.tsx");
    expect(center).toContain("listThemeQuestions");
    expect(center).toContain('data-testid="support-theme-questions"');
    expect(center).toContain("Показать ещё вопросы");
    expect(center).toContain("setVisibleCount((count) => count + THEME_PAGE)");
  });

  it("category cards gate escalation; chat only for sensitive topics", async () => {
    const center = read("components/support/support-help-center.tsx");
    // ONE categories grid drives suggestions and escalation gating.
    expect(center.split("SUPPORT_CATEGORIES.map").length - 1).toBe(1);
    expect(center).toContain("Не нашли нужный вопрос? Выберите из категории ниже");
    const { categoryAllowsChat } = await import("@/lib/support-faq");
    expect(categoryAllowsChat("finance")).toBe(true);
    expect(categoryAllowsChat("technical")).toBe(false);
  });

  it("the chat is Telegram-like: day separators, tailed bubbles, round send, Enter-to-send", () => {
    const chat = read("components/support/support-chat.tsx");
    expect(chat).toContain('data-testid="support-chat-day"');
    expect(chat).toContain("rounded-[16px_16px_4px_16px]");
    expect(chat).toContain('aria-label="Отправить сообщение"');
    expect(chat).toContain('event.key === "Enter" && !event.shiftKey');
    expect(chat).toContain("groupByDay");
  });
});

// ── R1 · item 17 — «Помощь» uses the question-mark glyph like the header ──
describe("R1 item 17 — Помощь icon is a question mark", () => {
  it("sidebar and nav-icon map use CircleHelp, not LifeBuoy", () => {
    const shell = read("components/cabinet/cabinet-shell.tsx");
    const icons = read("components/nav/nav-icons.ts");
    expect(shell).toContain("CircleHelp");
    expect(shell).not.toContain("LifeBuoy");
    expect(icons).toContain("support: CircleHelp");
    expect(icons).not.toContain("LifeBuoy");
  });
});
