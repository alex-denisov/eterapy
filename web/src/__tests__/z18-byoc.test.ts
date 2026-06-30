import fs from "node:fs";
import path from "node:path";
import {
  BYOC_LADDER,
  FOUNDING_FLAT_COMMISSION,
  commissionForSource,
  isFoundingActive,
} from "@/lib/practitioner-commission";

const root = process.cwd();

function source(relativePath: string) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

describe("Z18 BYOC practitioner client source axis", () => {
  it("resolves platform, BYOC, and founding commission rates without mixing the axes", () => {
    expect(BYOC_LADDER).toEqual({
      base: 20,
      practitioner_pro: 17,
      practitioner_pro_plus: 14,
    });
    expect(FOUNDING_FLAT_COMMISSION).toBe(12);

    expect(commissionForSource("PLATFORM", "base", true)).toBe(35);
    expect(commissionForSource("PLATFORM", "practitioner_pro", true)).toBe(30);
    expect(commissionForSource("PLATFORM", "practitioner_pro_plus", true)).toBe(25);

    expect(commissionForSource("BYOC", "base", false)).toBe(20);
    expect(commissionForSource("BYOC", "practitioner_pro", false)).toBe(17);
    expect(commissionForSource("BYOC", "practitioner_pro_plus", false)).toBe(14);
    expect(commissionForSource("BYOC", "base", true)).toBe(12);
    expect(commissionForSource("BYOC", "practitioner_pro_plus", true)).toBe(12);
  });

  it("requires both founding cohort flag and an unexpired foundingUntil", () => {
    const now = new Date("2026-06-06T12:00:00.000Z");

    expect(isFoundingActive({ isFoundingCohort: true, foundingUntil: new Date("2026-06-07T12:00:00.000Z") }, now)).toBe(true);
    expect(isFoundingActive({ isFoundingCohort: false, foundingUntil: new Date("2026-06-07T12:00:00.000Z") }, now)).toBe(false);
    expect(isFoundingActive({ isFoundingCohort: true, foundingUntil: null }, now)).toBe(false);
    expect(isFoundingActive({ isFoundingCohort: true, foundingUntil: new Date("2026-06-05T12:00:00.000Z") }, now)).toBe(false);
  });

  it("persists BYOC schema, migration, hooks, and public/practitioner surfaces", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260606160000_add_byoc_source_axis/migration.sql");
    const registerRoute = source("src/app/api/auth/register/route.ts");
    const bookingsRoute = source("src/app/api/bookings/route.ts");
    const byocLib = source("src/lib/byoc.ts");
    const applicationsRoute = source("src/app/api/admin/applications/[id]/route.ts");
    const adminPractitionerCreate = source("src/app/api/admin/practitioners/create/route.ts");
    const inviteRoute = source("src/app/api/practitioner/invites/route.ts");
    const visitRoute = source("src/app/api/practitioner/invites/visit/route.ts");
    const invitePage = source("src/app/cabinet/practitioner/invite/page.tsx");
    const publicLanding = source("src/app/p/[slug]/page.tsx");
    const practitionerNav = source("src/components/cabinet/cabinet-shell.tsx");
    const earningsPage = source("src/app/cabinet/practitioner/earnings/page.tsx");
    const adminBookings = source("src/app/admin/product/sessions/page.tsx");

    expect(schema).toContain("enum ClientSource");
    expect(schema).toContain("model PractitionerInvite");
    expect(schema).toContain("model PractitionerInviteVisit");
    expect(schema).toContain("model ClientAttribution");
    expect(schema).toContain("model ClientPractitionerLink");
    expect(schema).toContain("byocCommissionPercent");
    expect(schema).toContain("isFoundingCohort");
    expect(schema).toContain("foundingUntil");
    expect(schema).toContain("referrerPractitionerId");
    expect(schema).toMatch(/source\s+ClientSource/);
    expect(migration).toContain("CREATE TYPE \"ClientSource\"");
    expect(migration).toContain("CREATE TABLE \"practitioner_invites\"");
    expect(migration).toContain("CREATE TABLE \"client_practitioner_links\"");

    expect(byocLib).toContain("BYOC_COOKIE");
    expect(byocLib).toContain("attachByocAtRegistration");
    expect(byocLib).toContain("resolveByocBookingCommission");
    expect(byocLib).toContain("finalizeByocBookingAttribution");
    expect(byocLib).toContain("assignFoundingCohortIfEligible");
    expect(byocLib).toContain("expiresAt: addDays(now, 365)");
    expect(registerRoute).toContain("attachByocAtRegistration");
    expect(bookingsRoute).toContain("resolveByocBookingCommission");
    expect(bookingsRoute).toContain("finalizeByocBookingAttribution");
    expect(bookingsRoute).toContain("commissionPercentApplied: byocCommission.commissionPercentApplied");
    expect(applicationsRoute).toContain("assignFoundingCohortIfEligible");
    expect(adminPractitionerCreate).toContain("assignFoundingCohortIfEligible");
    expect(inviteRoute).toContain("createPractitionerInvite");
    expect(invitePage).toContain("Приведите своего клиента");
    expect(publicLanding).toContain("ByocVisitTracker");
    expect(visitRoute).toContain("recordPractitionerInviteVisit");
    expect(visitRoute).toContain("setByocCookie");
    expect(practitionerNav).toContain("/practitioner/invite");
    expect(earningsPage).toContain("source");
    expect(adminBookings).toContain("commissionPercentApplied");
  });
});
