"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  detectMiniAppPlatform,
  shouldShowMiniAppBackButton,
  MINIAPP_STORAGE_KEY,
  MINIAPP_ATTR,
  type MiniAppPlatform,
} from "@/lib/miniapp";

interface MiniAppState {
  platform: MiniAppPlatform | null;
  isMiniApp: boolean;
}

const MiniAppContext = createContext<MiniAppState>({ platform: null, isMiniApp: false });

/** Read the current mini-app shell. `isMiniApp` is false in a normal tab. */
export function useMiniApp(): MiniAppState {
  return useContext(MiniAppContext);
}

// Minimal slice of the Telegram WebApp API we rely on. The full SDK is loaded
// from telegram.org on demand; everything is feature-detected and guarded
// because methods are version-gated and may be absent in older clients.
interface TelegramBackButton {
  show: () => void;
  hide: () => void;
  onClick: (cb: () => void) => void;
  offClick: (cb: () => void) => void;
}
interface TelegramWebApp {
  initData?: string;
  ready?: () => void;
  expand?: () => void;
  BackButton?: TelegramBackButton;
}

function getTelegramWebApp(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

const TELEGRAM_SDK_SRC = "https://telegram.org/js/telegram-web-app.js";

function loadTelegramSdk(): Promise<TelegramWebApp | undefined> {
  return new Promise((resolve) => {
    const existing = getTelegramWebApp();
    if (existing) {
      resolve(existing);
      return;
    }
    const prior = document.querySelector<HTMLScriptElement>(`script[src="${TELEGRAM_SDK_SRC}"]`);
    if (prior) {
      prior.addEventListener("load", () => resolve(getTelegramWebApp()), { once: true });
      prior.addEventListener("error", () => resolve(undefined), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = TELEGRAM_SDK_SRC;
    script.async = true;
    script.addEventListener("load", () => resolve(getTelegramWebApp()), { once: true });
    script.addEventListener("error", () => resolve(undefined), { once: true });
    document.head.appendChild(script);
  });
}

export function MiniAppProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<MiniAppPlatform | null>(null);
  const pathname = usePathname();

  // Detect once on mount and remember it for the rest of the session.
  useEffect(() => {
    const win = window as unknown as { Telegram?: { WebApp?: { initData?: string } }; vkBridge?: unknown };
    let stored: string | null = null;
    try {
      stored = window.sessionStorage.getItem(MINIAPP_STORAGE_KEY);
    } catch {
      stored = null;
    }
    const detected = detectMiniAppPlatform({
      search: window.location.search,
      hash: window.location.hash,
      userAgent: navigator.userAgent,
      hasTelegramWebApp: Boolean(win.Telegram?.WebApp?.initData),
      hasVkBridge: Boolean(win.vkBridge),
      stored,
    });
    if (!detected) return;
    document.documentElement.setAttribute(MINIAPP_ATTR, detected);
    try {
      window.sessionStorage.setItem(MINIAPP_STORAGE_KEY, detected);
    } catch {
      // ignore — private mode / storage disabled; attribute is enough.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot platform latch after detection
    setPlatform(detected);
  }, []);

  // Telegram lifecycle: claim the viewport (ready/expand). VK/MAX are stubs.
  useEffect(() => {
    if (platform !== "telegram") return;
    let cancelled = false;
    loadTelegramSdk().then((wa) => {
      if (cancelled || !wa) return;
      try {
        wa.ready?.();
        wa.expand?.();
      } catch {
        // older clients may lack these — the lean layout still applies.
      }
    });
    return () => {
      cancelled = true;
    };
  }, [platform]);

  // Map the native Telegram Back button to browser history, toggling its
  // visibility per route so "home" surfaces stay clean.
  useEffect(() => {
    if (platform !== "telegram") return;
    const wa = getTelegramWebApp();
    const back = wa?.BackButton;
    if (!back) return;
    const onClick = () => window.history.back();
    try {
      back.onClick(onClick);
      if (shouldShowMiniAppBackButton(pathname)) back.show();
      else back.hide();
    } catch {
      // version-gated — ignore.
    }
    return () => {
      try {
        back.offClick(onClick);
      } catch {
        // ignore
      }
    };
  }, [platform, pathname]);

  return (
    <MiniAppContext.Provider value={{ platform, isMiniApp: platform !== null }}>
      {children}
    </MiniAppContext.Provider>
  );
}
