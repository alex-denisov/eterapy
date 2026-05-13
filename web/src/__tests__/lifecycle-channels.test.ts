import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

describe("B214 PWA and lifecycle channels", () => {
  it("adds lifecycle notification events to schema, preferences, email, web, and Telegram delivery", () => {
    const schema = source("prisma/schema.prisma");
    const migration = source("prisma/migrations/20260513145500_add_lifecycle_notification_events/migration.sql");
    const events = source("src/lib/notification-events.ts");
    const email = source("src/lib/email-send.ts");
    const delivery = source("src/lib/notification-delivery.ts");
    const bell = source("src/components/notification-bell.tsx");

    for (const event of [
      "ABANDONED_CHECKOUT",
      "REPORT_READY",
      "PARTNER_COMPLETED",
      "CIRCLE_READY",
      "ROUTE_REMINDER",
      "WEEKLY_DIGEST",
      "PRACTITIONER_DIGEST",
      "COMPLIANCE_ALERT",
    ]) {
      expect(schema).toContain(event);
      expect(migration).toContain(event);
      expect(events).toContain(event);
      expect(email).toContain(event);
      expect(delivery).toContain(event);
      expect(bell).toContain(event);
    }

    expect(events).toContain("DEFAULT_EMAIL_EVENTS");
    expect(delivery).toContain("case \"ABANDONED_CHECKOUT\"");
    expect(delivery).toContain("case \"COMPLIANCE_ALERT\"");
  });

  it("keeps lifecycle messages behind notification preferences and quiet hours", () => {
    const notifications = source("src/lib/notifications.ts");

    expect(notifications).toContain("isEnabled");
    expect(notifications).toContain("getUserQuietHours");
    expect(notifications).toContain("getQuietHoursDelayMs");
    expect(notifications).toContain("queueNotificationDelivery");
    expect(notifications).toContain("channel !== \"TELEGRAM\"");
  });

  it("adds a mobile PWA install prompt with analytics and local dismissal", () => {
    const provider = source("src/components/providers.tsx");
    const prompt = source("src/components/pwa-install-prompt.tsx");

    expect(provider).toContain("PWAInstallPrompt");
    expect(prompt).toContain("beforeinstallprompt");
    expect(prompt).toContain("data-testid=\"pwa-install-prompt\"");
    expect(prompt).toContain("eterapy:pwa-install-dismissed");
    expect(prompt).toContain("pwa_install_prompt_closed");
    expect(prompt).toContain("display-mode: standalone");
  });
});
