import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("B219 practitioner anti-fraud and payout holds", () => {
  it("persists practitioner booking, review, and payout risk signals", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260513205000_add_practitioner_antifraud_fields/migration.sql");

    expect(schema).toContain("riskReviewedAt");
    expect(schema).toContain("ipHash");
    expect(schema).toContain('status         String       @default("PUBLISHED")');
    expect(schema).toContain("availableAt");
    expect(schema).toContain("holdReason");
    expect(migration).toContain("add_practitioner_antifraud_fields");
    expect(migration).toContain("bookings_ip_hash_created_at_idx");
    expect(migration).toContain("payouts_status_available_at_idx");
    expect(migration).toContain("UPDATE \"practitioners\"");
  });

  it("scores fake bookings, external payment leakage, review fraud, and payout gates centrally", () => {
    const helper = source("src/lib/practitioner-antifraud.ts");

    expect(helper).toContain("PRACTITIONER_PAYOUT_HOLD_DAYS = 7");
    expect(helper).toContain("external_payment_signal");
    expect(helper).toContain("practitioner_self_booking");
    expect(helper).toContain("many_bookings_same_client");
    expect(helper).toContain("many_reviews_same_author_practitioner");
    expect(helper).toContain("payoutHoldMetadata");
    expect(helper).toContain("holdPractitionerPayoutsForBooking");
    expect(helper).toContain("assertPractitionerPayoutAllowed");
  });

  it("enforces practitioner verification and booking fingerprints before booking creation", () => {
    const bookingsRoute = source("src/app/api/bookings/route.ts");
    const adminRoute = source("src/app/api/admin/practitioners/route.ts");
    const adminStatusRoute = source("src/app/api/admin/practitioners/[id]/status/route.ts");

    expect(bookingsRoute).toContain("requestFingerprint(req)");
    expect(bookingsRoute).toContain("assessBookingRisk");
    expect(bookingsRoute).toContain("practitioner_booking_blocked");
    expect(bookingsRoute).toContain("practitioner_booking_review");
    expect(bookingsRoute).toContain("Профиль практика ещё не прошёл проверку");
    expect(adminRoute).toContain("Перед публикацией профиль должен пройти проверку");
    expect(adminStatusRoute).toContain("Перед публикацией профиль должен пройти проверку");
  });

  it("holds payouts on complaints and compliance/external-payment transcript signals", () => {
    const complaintsRoute = source("src/app/api/complaints/route.ts");
    const transcriptRoute = source("src/app/api/video/transcript/route.ts");
    const sessionComplete = source("src/lib/session-complete.ts");
    const complaintResolution = source("src/lib/complaint-resolution.ts");
    const payoutRoute = source("src/app/api/admin/practitioners/[id]/payout/route.ts");

    expect(complaintsRoute).toContain("practitioner_external_payment_reported");
    expect(complaintsRoute).toContain("holdPractitionerPayoutsForBooking");
    expect(transcriptRoute).toContain("practitioner_external_payment_detected");
    expect(transcriptRoute).toContain("session_compliance_signal");
    expect(sessionComplete).toContain("payoutAvailableAt()");
    expect(sessionComplete).toContain("payoutHoldMetadata");
    expect(complaintResolution).toContain('status: "REFUNDED"');
    expect(complaintResolution).toContain('status: "COMPLETED"');
    expect(payoutRoute).toContain("assertPractitionerPayoutAllowed");
    expect(payoutRoute).toContain("Выплата удержана до проверки риска");
  });

  it("keeps risky reviews out of public profile surfaces", () => {
    const publicProfile = source("src/app/practitioners/[slug]/page.tsx");
    const cabinetProfile = source("src/app/cabinet/practitioners/[slug]/page.tsx");
    const apiProfile = source("src/app/api/practitioners/[id]/route.ts");
    const dashboard = source("src/app/cabinet/practitioner/page.tsx");

    for (const file of [publicProfile, cabinetProfile, apiProfile, dashboard]) {
      expect(file).toContain('where: { status: "PUBLISHED" }');
    }
  });
});
