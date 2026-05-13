import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B215 practitioner precheck links and widgets", () => {
  it("adds the public practitioner precheck route with attribution and booking continuation", () => {
    const page = source("src/app/p/[slug]/precheck/page.tsx");
    const form = source("src/app/p/[slug]/precheck/precheck-form.tsx");
    const profile = source("src/app/practitioners/[slug]/page.tsx");

    expect(page).toContain("PractitionerStatus.ACTIVE");
    expect(page).toContain("Предразбор перед встречей");
    expect(page).toContain("robots: { index: false, follow: false }");
    expect(form).toContain("/api/attribution/touch");
    expect(form).toContain("partnerId");
    expect(form).toContain("/api/dialogues");
    expect(form).toContain("practitioner_precheck_created");
    expect(form).toContain("data-testid=\"precheck-summary\"");
    expect(form).toContain("precheck-booking-continue");
    expect(profile).toContain("precheck-booking-context");
  });

  it("exposes practitioner link kit with QR, Telegram deeplink, and script widget", () => {
    const services = source("src/app/cabinet/practitioner/services/page.tsx");
    const links = source("src/lib/practitioner-links.ts");
    const widgetRoute = source("src/app/api/widgets/practitioner-precheck.js/route.ts");

    expect(services).toContain("practitioner-acquisition-kit");
    expect(services).toContain("QRCode.toDataURL");
    expect(services).toContain("practitionerTelegramStartUrl");
    expect(services).toContain("practitionerWidgetSnippet");
    expect(links).toContain("/p/${encodeURIComponent(slug)}/precheck");
    expect(links).toContain("practitioner-precheck.js");
    expect(links).toContain("practitioner_");
    expect(widgetRoute).toContain("application/javascript");
    expect(widgetRoute).toContain("embedded-widget");
    expect(widgetRoute).toContain("practitioner_widget_rendered");
  });

  it("marks booking requests as channel conversions", () => {
    const bookings = source("src/app/api/bookings/route.ts");

    expect(bookings).toContain("markChannelConversion");
    expect(bookings).toContain('conversionType: "booking_requested"');
  });
});
