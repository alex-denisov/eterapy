import fs from "node:fs";
import path from "node:path";

const adminShell = fs.readFileSync(path.join(process.cwd(), "src/app/admin/admin-shell.tsx"), "utf8");
const softCss = fs.readFileSync(path.join(process.cwd(), "src/app/v4-soft.css"), "utf8");
const notificationSettings = fs.readFileSync(
  path.join(process.cwd(), "src/components/notifications/notification-settings.tsx"),
  "utf8",
);
const notificationBell = fs.readFileSync(path.join(process.cwd(), "src/components/notification-bell.tsx"), "utf8");
const slotPicker = fs.readFileSync(path.join(process.cwd(), "src/app/practitioners/[slug]/slot-picker.tsx"), "utf8");
const videoRoom = fs.readFileSync(path.join(process.cwd(), "src/components/video/video-room.tsx"), "utf8");

describe("v4 uncovered product surfaces", () => {
  it("moves admin shell onto the same Soft Clarity system as the app shell", () => {
    expect(adminShell).toContain("soft-clarity-page soft-admin-shell");
    expect(adminShell).toContain("soft-admin-sidebar");
    expect(adminShell).toContain("soft-admin-nav-link");
    expect(adminShell).toContain("soft-admin-mobile-nav");
    expect(softCss).toContain(".soft-admin-shell");
    expect(softCss).toContain(".soft-notification-popover");
  });

  it("keeps notification and support surfaces vendor-neutral and localized", () => {
    expect(notificationSettings).not.toContain("EVENT_META");
    expect(notificationSettings).not.toContain('icon: "ℹ️"');
    expect(notificationBell).toContain("soft-notification-trigger");
    expect(notificationBell).toContain("soft-notification-popover");
  });

  it("avoids render-time clock reads in booking and video edge states", () => {
    expect(slotPicker).toContain("const [nowMs, setNowMs] = useState(() => Date.now())");
    expect(slotPicker).toContain("slotDate.getTime() - nowMs");
    expect(slotPicker).not.toContain("slotDate.getTime() - Date.now()");
    expect(videoRoom).toContain("window.setTimeout");
    expect(videoRoom).toContain("useCallback");
  });
});
