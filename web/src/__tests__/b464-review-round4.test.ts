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
