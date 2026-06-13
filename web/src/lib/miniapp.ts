// B381 (M26): mini-app shell detection.
//
// When the site is opened inside a messenger mini-app (Telegram WebApp, VK Mini
// App, MAX) the messenger already draws its own native header (app title +
// close/back). Rendering the site header/footer on top of that produces a
// "double header" and wastes vertical space on a phone. This module is the
// single source of truth for *which* shell we are in; the React provider
// (`components/miniapp-provider.tsx`) and the pre-paint inline script below both
// consume the same markers.
//
// Open decision (B381): Telegram is wired with the real SDK; VK and MAX are
// detection-only stubs — they get the lean layout but no native-button wiring
// yet. Add the VK/MAX SDKs in a later block.

export type MiniAppPlatform = "telegram" | "vk" | "max";

const PLATFORMS: readonly MiniAppPlatform[] = ["telegram", "vk", "max"];

/** sessionStorage key — keeps the lean layout across in-app SPA navigations,
 *  because messengers only stamp their markers on the *initial* launch URL. */
export const MINIAPP_STORAGE_KEY = "eterapy:miniapp";

/** html attribute toggled pre-paint (inline script) and post-mount (provider). */
export const MINIAPP_ATTR = "data-miniapp";

export interface MiniAppDetectInput {
  /** window.location.search (e.g. "?vk_app_id=123"). */
  search?: string;
  /** window.location.hash (e.g. "#tgWebAppData=..."). */
  hash?: string;
  /** navigator.userAgent. */
  userAgent?: string;
  /** Boolean(window.Telegram?.WebApp?.initData) — set once the TG SDK loads. */
  hasTelegramWebApp?: boolean;
  /** Boolean(window.vkBridge) — set when the VK bridge global is present. */
  hasVkBridge?: boolean;
  /** Persisted value from a previous detection in the same session. */
  stored?: string | null;
}

function isPlatform(value: string | null | undefined): value is MiniAppPlatform {
  return value != null && (PLATFORMS as readonly string[]).includes(value);
}

/**
 * Decide which mini-app shell (if any) the current page is running inside.
 * Pure and deterministic so it can be unit-tested and shared with the inline
 * pre-paint script. Returns `null` for a regular browser tab.
 */
export function detectMiniAppPlatform(input: MiniAppDetectInput): MiniAppPlatform | null {
  const {
    search = "",
    hash = "",
    userAgent = "",
    hasTelegramWebApp = false,
    hasVkBridge = false,
    stored = null,
  } = input;

  // 1. Explicit override — used by our own deep-links and QA/Playwright.
  const forced = new URLSearchParams(search).get("miniapp");
  if (isPlatform(forced)) return forced;

  // 2. Telegram: live SDK initData, the tgWebApp* markers Telegram appends to
  //    the launch URL hash, or its in-app browser UA.
  if (hasTelegramWebApp) return "telegram";
  if (/tgWebApp(Data|Platform|Version|StartParam)/.test(hash)) return "telegram";
  if (/Telegram/i.test(userAgent)) return "telegram";

  // 3. VK Mini App: the vk-bridge global, or the signed vk_* launch params.
  if (hasVkBridge) return "vk";
  if (/[?&]vk_app_id=/.test(search) || /[?&]vk_platform=/.test(search)) return "vk";

  // 4. MAX (VK messenger) — stub: explicit launch marker only, to avoid UA
  //    false positives until the real SDK is wired.
  if (/[?&]max_app=/.test(search)) return "max";

  // 5. Carry a prior detection forward (sessionStorage) for in-app navigation.
  if (isPlatform(stored)) return stored;

  return null;
}

// B390: deep-link start-параметр. Telegram кладёт startapp в хеш запуска как
// tgWebAppStartParam; наш override/web-вариант — ?startapp= или ?start=.
export function getMiniAppStartParam(input: { search?: string; hash?: string }): string | null {
  const { search = "", hash = "" } = input;
  const qs = new URLSearchParams(search);
  const direct = qs.get("startapp") ?? qs.get("start") ?? qs.get("tgWebAppStartParam");
  if (direct) return direct;
  const fromHash = hash.match(/tgWebAppStartParam=([^&]+)/);
  if (fromHash) {
    try {
      return decodeURIComponent(fromHash[1]);
    } catch {
      return fromHash[1];
    }
  }
  return null;
}

export type MiniAppDeepLink = { kind: "library"; slug: string } | null;

// Разбор deep-link-параметра в навигационную цель. «lib-<slug>» → карточка
// библиотеки (всё после префикса — слаг, он url-safe).
export function parseMiniAppDeepLink(param: string | null): MiniAppDeepLink {
  if (!param) return null;
  if (param.startsWith("lib-")) {
    const slug = param.slice(4).trim();
    if (/^[a-z0-9-]+$/.test(slug)) return { kind: "library", slug };
  }
  return null;
}

export function deepLinkToPath(link: MiniAppDeepLink): string | null {
  if (!link) return null;
  if (link.kind === "library") return `/library/${link.slug}`;
  return null;
}

const BACK_BUTTON_ROOT_PATHS: readonly string[] = [
  "/",
  "/cabinet",
  "/cabinet/",
  "/login",
  "/checkin",
];

/**
 * Whether the messenger's native Back button should be shown for a route.
 * Hidden on the "home" surfaces (landing, cabinet root, login, check-in entry)
 * where there is nothing meaningful to go back to; shown everywhere else so the
 * native button maps to `history.back()`.
 */
export function shouldShowMiniAppBackButton(pathname: string): boolean {
  if (!pathname) return false;
  const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") || "/" : pathname;
  return !BACK_BUTTON_ROOT_PATHS.some((root) => {
    const r = root.length > 1 ? root.replace(/\/+$/, "") : root;
    return normalized === r;
  });
}

/**
 * Compact, dependency-free mirror of `detectMiniAppPlatform` that runs in
 * `<head>` before first paint, so the lean layout has no flash-of-header. It
 * sets the html `data-miniapp` attribute (CSS hides `[data-site-chrome]`) and
 * persists the result. Kept in sync with the markers above — see the b381 test.
 */
export const MINIAPP_INLINE_SCRIPT = `(function(){try{
var d=document.documentElement,loc=window.location,qs=loc.search||"",hash=loc.hash||"",p=null;
var f=new URLSearchParams(qs).get("miniapp");
if(f==="telegram"||f==="vk"||f==="max"){p=f;}
else if(/tgWebApp(Data|Platform|Version|StartParam)/.test(hash)){p="telegram";}
else if(/[?&]vk_app_id=/.test(qs)||/[?&]vk_platform=/.test(qs)){p="vk";}
else if(/[?&]max_app=/.test(qs)){p="max";}
if(!p){try{var s=window.sessionStorage.getItem("${MINIAPP_STORAGE_KEY}");if(s==="telegram"||s==="vk"||s==="max"){p=s;}}catch(e){}}
if(p){d.setAttribute("${MINIAPP_ATTR}",p);try{window.sessionStorage.setItem("${MINIAPP_STORAGE_KEY}",p);}catch(e){}}
}catch(e){}})();`;
