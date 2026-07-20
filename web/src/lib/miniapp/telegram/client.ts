import { shouldShowMiniAppBackButton } from "@/lib/miniapp";

type Insets = { top?: number; right?: number; bottom?: number; left?: number };
type TelegramEvent = "safeAreaChanged" | "contentSafeAreaChanged" | "viewportChanged" | "themeChanged";

type TelegramBackButton = {
  show: () => void; hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
};

export type TelegramWebApp = {
  initData?: string;
  initDataUnsafe?: { user?: { first_name?: string } };
  colorScheme?: "light" | "dark";
  safeAreaInset?: Insets;
  contentSafeAreaInset?: Insets;
  viewportHeight?: number;
  viewportStableHeight?: number;
  ready?: () => void;
  expand?: () => void;
  BackButton?: TelegramBackButton;
  onEvent?: (event: TelegramEvent, callback: () => void) => void;
  offEvent?: (event: TelegramEvent, callback: () => void) => void;
};

const TELEGRAM_SDK_SRC = "https://telegram.org/js/telegram-web-app.js";

function currentWebApp(): TelegramWebApp | undefined {
  return (window as unknown as { Telegram?: { WebApp?: TelegramWebApp } }).Telegram?.WebApp;
}

export function loadTelegramSdk(): Promise<TelegramWebApp | undefined> {
  return new Promise((resolve) => {
    const ready = currentWebApp();
    if (ready) return resolve(ready);
    const prior = document.querySelector<HTMLScriptElement>(`script[src="${TELEGRAM_SDK_SRC}"]`);
    if (prior) {
      prior.addEventListener("load", () => resolve(currentWebApp()), { once: true });
      prior.addEventListener("error", () => resolve(undefined), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.src = TELEGRAM_SDK_SRC;
    script.async = true;
    script.addEventListener("load", () => resolve(currentWebApp()), { once: true });
    script.addEventListener("error", () => resolve(undefined), { once: true });
    document.head.appendChild(script);
  });
}

function px(value: number | undefined): string {
  return `${Math.max(0, value ?? 0)}px`;
}

function syncViewport(webApp: TelegramWebApp, stableHeight: number): void {
  const root = document.documentElement;
  const safe = webApp.safeAreaInset ?? {};
  const content = webApp.contentSafeAreaInset ?? {};
  const telegramHeight = webApp.viewportHeight ?? webApp.viewportStableHeight ?? window.innerHeight;
  const visualHeight = window.visualViewport?.height ?? window.innerHeight;
  const keyboardHeight = stableHeight - visualHeight;
  const viewportHeight = Math.max(240, Math.round(keyboardHeight > 120 ? Math.min(telegramHeight, visualHeight) : telegramHeight));
  root.style.setProperty("--miniapp-safe-top", px(Math.max(safe.top ?? 0, content.top ?? 0)));
  root.style.setProperty("--miniapp-safe-right", px(Math.max(safe.right ?? 0, content.right ?? 0)));
  root.style.setProperty("--miniapp-safe-bottom", px(Math.max(safe.bottom ?? 0, content.bottom ?? 0)));
  root.style.setProperty("--miniapp-safe-left", px(Math.max(safe.left ?? 0, content.left ?? 0)));
  root.style.setProperty("--miniapp-viewport-height", px(viewportHeight));
  root.dataset.miniappKeyboardOpen = keyboardHeight > 120 ? "true" : "false";
  root.dataset.miniappTheme = webApp.colorScheme ?? "dark";
}

export type TelegramRuntime = {
  updatePath: (pathname: string) => void;
  dispose: () => void;
};

export async function createTelegramRuntime(initialPathname: string): Promise<TelegramRuntime | null> {
  const webApp = await loadTelegramSdk();
  if (!webApp) return null;
  const stableHeight = Math.max(
    webApp.viewportStableHeight ?? 0,
    webApp.viewportHeight ?? 0,
    window.visualViewport?.height ?? 0,
    window.innerHeight,
  );
  const onBack = () => window.history.back();
  const onViewport = () => syncViewport(webApp, stableHeight);
  const events: TelegramEvent[] = ["safeAreaChanged", "contentSafeAreaChanged", "viewportChanged", "themeChanged"];

  try { webApp.ready?.(); webApp.expand?.(); } catch { /* old client */ }
  syncViewport(webApp, stableHeight);
  for (const event of events) webApp.onEvent?.(event, onViewport);
  window.visualViewport?.addEventListener("resize", onViewport);
  window.visualViewport?.addEventListener("scroll", onViewport);
  window.addEventListener("resize", onViewport);
  webApp.BackButton?.onClick(onBack);

  const updatePath = (pathname: string) => {
    try {
      if (shouldShowMiniAppBackButton(pathname)) webApp.BackButton?.show();
      else webApp.BackButton?.hide();
    } catch { /* version-gated */ }
  };
  updatePath(initialPathname);

  return {
    updatePath,
    dispose: () => {
      for (const event of events) webApp.offEvent?.(event, onViewport);
      window.visualViewport?.removeEventListener("resize", onViewport);
      window.visualViewport?.removeEventListener("scroll", onViewport);
      window.removeEventListener("resize", onViewport);
      delete document.documentElement.dataset.miniappKeyboardOpen;
      try { webApp.BackButton?.offClick(onBack); } catch { /* old client */ }
    },
  };
}
