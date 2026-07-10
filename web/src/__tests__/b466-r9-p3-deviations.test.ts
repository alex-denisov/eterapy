import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 R9-4 P3-детали — резолюции owner-развилок (2026-07-10):
//   1. «Парная» → реальные форматы сессий (individual/couple/family) на лендинге,
//      в суперадминке, в кабинете практика, в «Записать» и карточке сессии.
//   2. «Записать» → сворачиваемый необязательный комментарий на мобиле.
//   3. «Сессия» → РАБОЧИЙ per-session AI-разбор on/off (не имитация).
//   4. «Перенести» → сетка свободных слотов дня (реальный /api/slots/available).

const CAL = "src/app/cabinet/practitioner/calendar";

describe("item 1 — форматы сессий: schema + shared editor", () => {
  it("schema adds Practitioner.formats + Booking.format + BookingProposal.format", () => {
    const schema = source("prisma/schema.prisma");
    expect(schema).toMatch(/formats\s+String\[\]\s+@default\(\["individual"\]\)/);
    // Booking + BookingProposal each get an optional single-format column.
    expect(schema).toMatch(/\/\/ B466\/B480: формат сессии[\s\S]*?format\s+String\?/);
    expect(schema).toMatch(/\/\/ B466\/B480: формат предлагаемой сессии[\s\S]*?format\s+String\?/);
  });

  it("ships a migration for the three format columns", () => {
    const mig = source("prisma/migrations/20260710120000_b466_session_formats/migration.sql");
    expect(mig).toContain('ADD COLUMN IF NOT EXISTS "formats" TEXT[]');
    expect(mig).toMatch(/ALTER TABLE "bookings"[\s\S]*ADD COLUMN IF NOT EXISTS "format" TEXT/);
    expect(mig).toMatch(/ALTER TABLE "booking_proposals"[\s\S]*ADD COLUMN IF NOT EXISTS "format" TEXT/);
  });

  it("SessionFormatsField locks individual on and toggles couple/family", () => {
    const field = source("src/components/practitioner/session-formats-field.tsx");
    expect(field).toContain("Форматы сессий");
    expect(field).toContain('if (id === "individual") return');
    expect(field).toContain("data-testid=\"session-formats-field\"");
    // note that price is not affected (owner: «ничего в механиках нового»)
    expect(field).toContain("На цену не влияет");
  });

  it("cabinet profile editor + superadmin modal both render the formats field & persist", () => {
    const editor = source("src/app/cabinet/practitioner/profile/profile-editor.tsx");
    expect(editor).toContain("SessionFormatsField");
    expect(editor).toContain('formData.append("formats"');

    const modal = source("src/app/admin/users/user-edit-modal.tsx");
    expect(modal).toContain("SessionFormatsField");
    expect(modal).toContain("ppatch.formats = formats");

    // both persist paths normalise via the shared lib
    expect(source("src/app/api/practitioner/profile/route.ts")).toContain("normalizeOfferedFormats(data.formats)");
    expect(source("src/app/api/admin/practitioners/[id]/profile/route.ts")).toContain("normalizeOfferedFormats(formats)");
  });

  it("landing profile shows offered formats only when more than individual", () => {
    const page = source("src/app/practitioners/[slug]/page.tsx");
    expect(page).toContain("offeredFormatOptions(p.formats)");
    expect(page).toContain('f.id !== "individual"');
    expect(page).toContain('data-testid="practitioner-formats"');
  });
});

describe("item 1 — «Записать» carries the format into the booking", () => {
  it("proposals API validates the format against offered + stores it", () => {
    const api = source("src/app/api/practitioner/proposals/route.ts");
    expect(api).toContain("normalizeBookingFormat(body?.format, practitioner.formats)");
    expect(api).toMatch(/data:\s*\{[\s\S]*format,[\s\S]*\}/);
  });

  it("propose forms (mobile + desktop) send a format", () => {
    const mobile = source(`${CAL}/propose/propose-mobile.tsx`);
    expect(mobile).toContain("offeredFormatOptions(formats)");
    expect(mobile).toContain('data-testid="propose-formats"');
    expect(mobile).toMatch(/body: JSON.stringify\(\{[^}]*format,/);
    // no more «скоро» toast — the segment is real now
    expect(mobile).not.toContain("Парные сессии — скоро");

    const desktop = source(`${CAL}/propose/propose-form.tsx`);
    expect(desktop).toContain('data-testid="practitioner-propose-formats"');
    expect(desktop).toMatch(/body: JSON.stringify\(\{[^}]*format,/);
  });

  it("booking creation copies proposal.format onto the booking", () => {
    const api = source("src/app/api/bookings/route.ts");
    expect(api).toContain("format: true"); // selected from the proposal
    expect(api).toContain("proposal?.format ? { format: proposal.format }");
  });

  it("session card chips render the real booking format, not a hardcoded label", () => {
    const mobile = source(`${CAL}/booking/[id]/booking-mobile.tsx`);
    expect(mobile).toContain("{formatLabel}");
    expect(mobile).not.toContain('pcab-ctag">Индивидуальная<');
    const page = source(`${CAL}/booking/[id]/page.tsx`);
    expect(page).toContain("sessionFormatLabel(booking.format)");
    expect(page).not.toContain("`Индивидуальная сессия · ${durationMin} мин`");
  });
});

describe("item 2 — сворачиваемый комментарий на мобильном «Записать»", () => {
  it("propose-mobile has a collapsible optional comment that posts message", () => {
    const mobile = source(`${CAL}/propose/propose-mobile.tsx`);
    expect(mobile).toContain('data-testid="propose-comment-toggle"');
    expect(mobile).toContain('data-testid="propose-comment"');
    expect(mobile).toContain("commentOpen");
    expect(mobile).toMatch(/body: JSON.stringify\(\{[^}]*message: message.trim\(\)/);
  });

  it("cockpit CSS defines the compact comment toggle + textarea", () => {
    const css = source("src/app/cabinet/practitioner-cockpit.css");
    expect(css).toContain(".pcab-addcomment");
    expect(css).toContain(".pcab-commentarea");
  });
});

describe("item 3 — РАБОЧИЙ per-session AI-разбор", () => {
  it("booking-ai-toggle PATCHes the real ai-settings endpoint with {bookingId, enabled}", () => {
    const toggle = source(`${CAL}/booking/[id]/booking-ai-toggle.tsx`);
    expect(toggle).toContain('"use client"');
    expect(toggle).toContain("/api/practitioner/ai-settings");
    expect(toggle).toMatch(/JSON.stringify\(\{ bookingId, enabled: next \}\)/);
    expect(toggle).toContain('data-testid="practitioner-booking-ai-switch"');
  });

  it("booking-mobile mounts the toggle for upcoming/in-progress sessions", () => {
    const mobile = source(`${CAL}/booking/[id]/booking-mobile.tsx`);
    expect(mobile).toContain("BookingAiToggle");
    expect(mobile).toContain("initialEnabled={aiAnalysisEnabled}");
  });

  it("the booking page resolves the effective per-session flag (null → practitioner default)", () => {
    const page = source(`${CAL}/booking/[id]/page.tsx`);
    expect(page).toContain("booking.aiAnalysisEnabled ?? practitioner.aiAutoAnalyze");
  });
});

describe("item 4 — сетка свободных слотов в «Перенести»", () => {
  it("reschedule-mobile fetches real day availability and renders a slot grid", () => {
    const mobile = source(`${CAL}/booking/[id]/reschedule/reschedule-mobile.tsx`);
    expect(mobile).toContain("/api/slots/available?practitionerId=");
    expect(mobile).toContain('data-testid="reschedule-slots"');
    expect(mobile).toContain('data-testid="reschedule-slots-empty"');
    // selecting a slot drives the submit — no more free-form datetime-local for the new time
    expect(mobile).toContain("setSelectedIso(s.startAt)");
    expect(mobile).toMatch(/proposedStartAt: selectedIso/);
  });

  it("reschedule page passes practitionerId + durationMin so the grid can query", () => {
    const page = source(`${CAL}/booking/[id]/reschedule/page.tsx`);
    expect(page).toContain("practitionerId={practitioner.id}");
    expect(page).toContain("durationMin={durationMin}");
  });

  it("cockpit CSS defines the 4-col slot grid (mockup .slots/.slot)", () => {
    const css = source("src/app/cabinet/practitioner-cockpit.css");
    expect(css).toMatch(/\.pcab-slots\s*\{[^}]*repeat\(4, 1fr\)/);
    expect(css).toContain(".pcab-slot.active");
  });
});
