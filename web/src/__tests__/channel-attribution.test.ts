import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B213 channel attribution model", () => {
  it("adds a durable channel attribution ledger with first, last, and conversion touch fields", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260513143000_add_channel_attributions/migration.sql");

    expect(schema).toContain("model ChannelAttribution");
    expect(schema).toContain("visitorHash");
    expect(schema).toContain("utmSource");
    expect(schema).toContain("referralToken");
    expect(schema).toContain("practitionerId");
    expect(schema).toContain("partnerId");
    expect(schema).toContain("widgetId");
    expect(schema).toContain("entryProduct");
    expect(schema).toContain("firstTouchAt");
    expect(schema).toContain("lastTouchAt");
    expect(schema).toContain("conversionAt");
    expect(migration).toContain("CREATE TABLE \"channel_attributions\"");
    expect(migration).toContain("\"first_entry_path\"");
    expect(migration).toContain("\"last_entry_path\"");
  });

  it("records web entries through a global tracker and API without blocking UX", () => {
    const provider = source("src/components/providers.tsx");
    const tracker = source("src/components/channel-attribution-tracker.tsx");
    const route = source("src/app/api/attribution/touch/route.ts");

    expect(provider).toContain("ChannelAttributionTracker");
    expect(provider).toContain("Suspense");
    expect(tracker).toContain("/api/attribution/touch");
    expect(tracker).toContain("utm_source");
    expect(tracker).toContain("practitionerId");
    expect(tracker).toContain("widgetId");
    expect(tracker).toContain("channel_touch_recorded");
    expect(route).toContain("CHANNEL_ATTRIBUTION_COOKIE");
    expect(route).toContain("recordChannelTouch");
  });

  it("attaches share visits and key conversions to the same attribution model", () => {
    const shareVisit = source("src/app/api/share/visit/route.ts");
    const register = source("src/app/api/auth/register/route.ts");
    const dialogues = source("src/app/api/dialogues/route.ts");
    const helper = source("src/lib/channel-attribution.ts");

    expect(shareVisit).toContain("recordChannelTouch");
    expect(register).toContain("markChannelConversion");
    expect(register).toContain('conversionType: "registration"');
    expect(dialogues).toContain('conversionType: "dialogue_created"');
    expect(source("src/app/api/bookings/route.ts")).toContain('conversionType: "booking_requested"');
    expect(helper).toContain("recordChannelTouch");
    expect(helper).toContain("markChannelConversion");
    expect(helper).toContain("firstEntryPath");
    expect(helper).toContain("lastEntryPath");
  });
});
