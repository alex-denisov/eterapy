import fs from "node:fs";
import path from "node:path";

const source = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// B466 — «Календарь» (Расписание · Заявки · Доступность) + B480/B481/B484.

describe("B466 practitioner «Календарь»", () => {
  it("keeps the 3-tab switcher and redirects the legacy routes", () => {
    const tabs = source("src/app/cabinet/practitioner/calendar/calendar-tabs.tsx");
    for (const label of ["Расписание", "Заявки", "Доступность"]) expect(tabs).toContain(label);
    expect(source("src/app/cabinet/practitioner/schedule/page.tsx")).toContain("calendar?tab=availability");
    expect(source("src/app/cabinet/practitioner/requests/page.tsx")).toContain("calendar?tab=requests");
  });

  it("availability keeps prices read-only — only duration toggles (owner fix #1)", () => {
    const availability = source("src/app/cabinet/practitioner/calendar/availability-client.tsx");
    expect(availability).toContain("PriceRatesViewer");
    expect(availability).toContain("Стоимость здесь не редактируется");
  });

  it("gates «Войти» to the 30-minute window on the booking card", () => {
    const bookingPage = source("src/app/cabinet/practitioner/calendar/booking/[id]/page.tsx");
    expect(bookingPage).toContain("canJoinBooking");
    expect(bookingPage).toContain("откроется за 30 мин до начала");
  });
});

describe("B480 practitioner-proposed booking («Записать»)", () => {
  it("proposes only to own clients at the fixed rate price", () => {
    const api = source("src/app/api/practitioner/proposals/route.ts");
    expect(api).toContain("Записать можно только клиента");
    expect(api).toContain("priceRate.findUnique");
    expect(api).toContain("BOOKING_PROPOSED");
  });

  it("client accept flows through POST /api/bookings with server-side proposal price", () => {
    const bookings = source("src/app/api/bookings/route.ts");
    expect(bookings).toContain("proposalId");
    expect(bookings).toContain("effectivePriceOverride = proposal ? proposal.priceRub");
    expect(bookings).toContain('status: "ACCEPTED", bookingId: created.id');
  });
});

describe("B481 reschedule/cancel requests", () => {
  it("resolves requests by the opposite side with waivable late penalty", () => {
    const resolveRoute = source("src/app/api/bookings/[id]/change-requests/[requestId]/route.ts");
    expect(resolveRoute).toContain("resolverFor");
    expect(resolveRoute).toContain("waivePenalty");
    expect(resolveRoute).toContain("chargeCancellationPenalty");
    expect(resolveRoute).toContain("BOOKING_CHANGE_RESOLVED");
  });

  it("gives the client перенос/отмена controls with modal warnings", () => {
    const controls = source("src/app/cabinet/bookings/booking-change-controls.tsx");
    expect(controls).toContain("Запросить отмену");
    expect(controls).toContain("Запросить перенос");
    // B466 round-8 #8: prominent amber late-cancel penalty warning (50%, waivable).
    expect(controls).toContain("booking-late-cancel-warning");
    expect(controls).toContain("DEFAULT_LATE_CANCEL_PENALTY_PERCENT");
    expect(controls).toContain("простить штраф");
    expect(controls).toContain("Подтвердить перенос");
  });
});

describe("B484 practitioner cancellation policy", () => {
  it("records who cancelled and always releases the client's money", () => {
    const patchRoute = source("src/app/api/bookings/[id]/route.ts");
    expect(patchRoute).toContain("cancelledBy");
    expect(patchRoute).toContain("cancelSessionHold");
    expect(patchRoute).toContain("refundSessionForBooking");
  });

  it("warns the practitioner about reliability, not a fine", () => {
    const cancelPage = source("src/app/cabinet/practitioner/calendar/booking/[id]/cancel/page.tsx");
    expect(cancelPage).toContain("Клиент получит полный возврат");
    expect(cancelPage).toContain("надёжность");
    expect(cancelPage).not.toContain("штраф для практика");
  });
});
