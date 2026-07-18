import {
  detectMiniAppPlatform,
  shouldShowMiniAppBackButton,
  MINIAPP_INLINE_SCRIPT,
  MINIAPP_STORAGE_KEY,
  MINIAPP_ATTR,
} from "@/lib/miniapp";

describe("B381 — mini-app shell detection", () => {
  describe("detectMiniAppPlatform", () => {
    it("returns null for a regular browser tab", () => {
      expect(
        detectMiniAppPlatform({
          search: "?utm_source=google",
          hash: "",
          userAgent: "Mozilla/5.0 (iPhone) Safari",
        }),
      ).toBeNull();
    });

    it("honours the explicit ?miniapp= override (QA/deep-links)", () => {
      expect(detectMiniAppPlatform({ search: "?miniapp=telegram" })).toBe("telegram");
      expect(detectMiniAppPlatform({ search: "?miniapp=vk" })).toBe("vk");
      expect(detectMiniAppPlatform({ search: "?miniapp=max" })).toBe("max");
    });

    it("ignores an unknown ?miniapp= value", () => {
      expect(detectMiniAppPlatform({ search: "?miniapp=whatsapp" })).toBeNull();
    });

    it("detects Telegram via live SDK initData", () => {
      expect(detectMiniAppPlatform({ hasTelegramWebApp: true })).toBe("telegram");
    });

    it("detects Telegram via tgWebApp* launch-hash markers", () => {
      expect(detectMiniAppPlatform({ hash: "#tgWebAppData=abc&tgWebAppVersion=7.0" })).toBe("telegram");
      expect(detectMiniAppPlatform({ hash: "#tgWebAppPlatform=ios" })).toBe("telegram");
      expect(detectMiniAppPlatform({ hash: "#tgWebAppStartParam=ref_42" })).toBe("telegram");
    });

    it("detects Telegram via in-app browser UA", () => {
      expect(
        detectMiniAppPlatform({ userAgent: "Mozilla/5.0 ... Telegram-Android/10.0" }),
      ).toBe("telegram");
    });

    it("detects VK via the vk-bridge global or vk_* launch params", () => {
      expect(detectMiniAppPlatform({ hasVkBridge: true })).toBe("vk");
      expect(detectMiniAppPlatform({ search: "?vk_app_id=51234567&vk_user_id=9" })).toBe("vk");
      expect(detectMiniAppPlatform({ search: "?sign=x&vk_platform=mobile_web" })).toBe("vk");
    });

    it("detects MAX only via an explicit launch marker (stub)", () => {
      expect(detectMiniAppPlatform({ search: "?max_app=1" })).toBe("max");
      // No UA false positive — "MAX" appearing elsewhere must not trip it.
      expect(detectMiniAppPlatform({ userAgent: "Mozilla/5.0 ThunderMAX/2" })).toBeNull();
    });

    it("carries a prior detection forward for in-app SPA navigation", () => {
      expect(detectMiniAppPlatform({ search: "", hash: "", stored: "telegram" })).toBe("telegram");
      // Fresh markers win over stale storage.
      expect(detectMiniAppPlatform({ search: "?miniapp=vk", stored: "telegram" })).toBe("vk");
      // Garbage in storage is ignored.
      expect(detectMiniAppPlatform({ stored: "garbage" })).toBeNull();
    });

    it("prioritises Telegram over VK when both markers somehow co-exist", () => {
      expect(
        detectMiniAppPlatform({ hash: "#tgWebAppData=x", search: "?vk_app_id=1" }),
      ).toBe("telegram");
    });
  });

  describe("shouldShowMiniAppBackButton", () => {
    it("hides the back button on home/root surfaces", () => {
      for (const root of ["/", "/miniapp", "/miniapp/", "/cabinet", "/cabinet/", "/login", "/checkin"]) {
        expect(shouldShowMiniAppBackButton(root)).toBe(false);
      }
    });

    it("shows the back button on deeper routes", () => {
      for (const path of ["/miniapp/services", "/products/tarot", "/cabinet/diary", "/library/x", "/practitioners/anna"]) {
        expect(shouldShowMiniAppBackButton(path)).toBe(true);
      }
    });

    it("treats trailing slashes as equivalent", () => {
      expect(shouldShowMiniAppBackButton("/cabinet/diary/")).toBe(true);
      expect(shouldShowMiniAppBackButton("/login/")).toBe(false);
    });

    it("returns false for an empty pathname", () => {
      expect(shouldShowMiniAppBackButton("")).toBe(false);
    });
  });

  describe("MINIAPP_INLINE_SCRIPT — pre-paint mirror stays in sync", () => {
    it("references the same storage key and html attribute as the module", () => {
      expect(MINIAPP_INLINE_SCRIPT).toContain(MINIAPP_STORAGE_KEY);
      expect(MINIAPP_INLINE_SCRIPT).toContain(MINIAPP_ATTR);
    });

    it("checks every platform marker the TS detector checks", () => {
      expect(MINIAPP_INLINE_SCRIPT).toContain("tgWebApp");
      expect(MINIAPP_INLINE_SCRIPT).toContain("vk_app_id");
      expect(MINIAPP_INLINE_SCRIPT).toContain("vk_platform");
      expect(MINIAPP_INLINE_SCRIPT).toContain("max_app");
      expect(MINIAPP_INLINE_SCRIPT).toContain("miniapp");
    });

    it("is self-contained and guarded (IIFE wrapped in try/catch)", () => {
      expect(MINIAPP_INLINE_SCRIPT).toMatch(/^\(function\(\)\{try\{/);
      expect(MINIAPP_INLINE_SCRIPT.trimEnd()).toMatch(/\}\)\(\);$/);
      expect(MINIAPP_INLINE_SCRIPT).toContain("catch(e)");
    });
  });
});
