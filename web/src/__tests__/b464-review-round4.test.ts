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
