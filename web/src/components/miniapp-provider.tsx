"use client";

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import {
  detectMiniAppPlatform,
  MINIAPP_STORAGE_KEY,
  MINIAPP_ATTR,
  type MiniAppPlatform,
} from "@/lib/miniapp";
import { createTelegramRuntime, type TelegramRuntime } from "@/lib/miniapp/telegram/client";

interface MiniAppState {
  platform: MiniAppPlatform | null;
  isMiniApp: boolean;
}

const MiniAppContext = createContext<MiniAppState>({ platform: null, isMiniApp: false });

/** Read the current mini-app shell. `isMiniApp` is false in a normal tab. */
export function useMiniApp(): MiniAppState {
  return useContext(MiniAppContext);
}

export function MiniAppProvider({ children }: { children: ReactNode }) {
  const [platform, setPlatform] = useState<MiniAppPlatform | null>(null);
  const pathname = usePathname();
  const initialPathname = useRef(pathname);
  const telegramRuntime = useRef<TelegramRuntime | null>(null);

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

  // B527: one runtime owns Telegram SDK lifecycle, safe areas and native Back.
  // It awaits a delayed SDK before registering BackButton, fixing KE-006.
  useEffect(() => {
    if (platform !== "telegram") return;
    let cancelled = false;
    createTelegramRuntime(initialPathname.current).then((runtime) => {
      if (cancelled) runtime?.dispose();
      else telegramRuntime.current = runtime;
    });
    return () => {
      cancelled = true;
      telegramRuntime.current?.dispose();
      telegramRuntime.current = null;
    };
  }, [platform]);

  useEffect(() => {
    telegramRuntime.current?.updatePath(pathname);
  }, [pathname]);

  return (
    <MiniAppContext.Provider value={{ platform, isMiniApp: platform !== null }}>
      {children}
    </MiniAppContext.Provider>
  );
}
