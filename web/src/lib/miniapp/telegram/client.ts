import { shouldShowMiniAppBackButton } from "@/lib/miniapp";

type Insets = { top?: number; right?: number; bottom?: number; left?: number };
type TelegramEvent = "safeAreaChanged" | "contentSafeAreaChanged" | "viewportChanged" | "themeChanged";

type TelegramBackButton = {
  show: () => void; hide: () => void;
  onClick: (callback: () => void) => void;
  offClick: (callback: () => void) => void;
};

/** B529: исход окна оплаты звёздами. */
export type TelegramInvoiceStatus = "paid" | "cancelled" | "failed" | "pending";

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
  /** B529: доступен с Bot API 6.1; на старых клиентах отсутствует. */
  openInvoice?: (url: string, callback?: (status: TelegramInvoiceStatus) => void) => void;
};

/**
 * B529: открыть счёт в звёздах.
 *
 * Возвращает исход окна оплаты. `paid` НЕ означает, что покупка уже выдана:
 * права начисляет вебхук `successful_payment` на сервере, а не этот колбэк —
 * клиенту верить в вопросах денег нельзя. Поэтому на `paid` экран перечитывает
 * состояние с сервера, а не рисует успех сам.
 */
export async function openTelegramInvoice(url: string): Promise<TelegramInvoiceStatus> {
  const webApp = await loadTelegramSdk();
  if (!webApp?.openInvoice) return "failed";
  return new Promise((resolve) => {
    try {
      webApp.openInvoice?.(url, (status) => resolve(status));
    } catch {
      resolve("failed");
    }
  });
}

/** Внутри ли мы Telegram: там цифровые покупки идут только звёздами. */
export function insideTelegram(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(currentWebApp()?.initData);
}

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

// B573 (owner 2026-07-22): «экран не переходит к полю под клавиатурой».
// В Telegram WebApp клавиатура не меняет `window.innerHeight`, поэтому браузер
// не считает поле перекрытым и штатного автоскролла не происходит вовсе. Ждать
// от каждой формы своего обработчика бессмысленно — поведение принадлежит
// оболочке, а не форме, поэтому подъезд живёт здесь, рядом с замером клавиатуры.
function isTextEntry(node: EventTarget | null): node is HTMLElement {
  if (!node || !(node instanceof HTMLElement)) return false;
  if (node instanceof HTMLTextAreaElement) return true;
  if (node instanceof HTMLInputElement) {
    // `button`/`checkbox`/`radio` фокусируются, но клавиатуру не поднимают.
    return !["button", "checkbox", "radio", "submit", "reset", "range", "color", "file"].includes(node.type);
  }
  return node.isContentEditable;
}

// Живой чат (`.soft-chat-screen`) уже прибит к вьюпорту своим CSS-контрактом
// (B561): тред ограничен по высоте, композер прижат снизу. `scrollIntoView`
// там дёргает весь фрейм вверх — этот дефект уже ловили в companion-chat-panel.
function revealBelongsToShell(field: HTMLElement): boolean {
  return !field.closest(".soft-chat-screen");
}

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

  // Поле, в котором стоит курсор. Держим ссылку, потому что подъезжать нужно не
  // в момент фокуса (клавиатуры ещё нет и мерить нечего), а когда вьюпорт
  // сообщил о её появлении.
  let focusedField: HTMLElement | null = null;
  let revealTimer = 0;

  const revealFocusedField = () => {
    revealTimer = 0;
    const field = focusedField;
    if (!field || !field.isConnected) return;
    if (document.documentElement.dataset.miniappKeyboardOpen !== "true") return;
    if (!revealBelongsToShell(field)) return;
    field.scrollIntoView({ block: "center", behavior: "smooth" });
  };

  const scheduleReveal = () => {
    if (revealTimer) window.clearTimeout(revealTimer);
    // Клавиатура выезжает анимацией, и `viewportChanged` приходит несколько раз
    // подряд. Один отложенный подъезд вместо скачка на каждое событие.
    revealTimer = window.setTimeout(revealFocusedField, 120);
  };

  const onFocusIn = (event: FocusEvent) => {
    focusedField = isTextEntry(event.target) ? (event.target as HTMLElement) : null;
    if (focusedField) scheduleReveal();
  };
  const onFocusOut = () => { focusedField = null; };

  const onViewport = () => {
    syncViewport(webApp, stableHeight);
    if (focusedField) scheduleReveal();
  };
  const events: TelegramEvent[] = ["safeAreaChanged", "contentSafeAreaChanged", "viewportChanged", "themeChanged"];

  try { webApp.ready?.(); webApp.expand?.(); } catch { /* old client */ }
  syncViewport(webApp, stableHeight);
  for (const event of events) webApp.onEvent?.(event, onViewport);
  window.visualViewport?.addEventListener("resize", onViewport);
  window.visualViewport?.addEventListener("scroll", onViewport);
  window.addEventListener("resize", onViewport);
  document.addEventListener("focusin", onFocusIn);
  document.addEventListener("focusout", onFocusOut);
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
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("focusout", onFocusOut);
      if (revealTimer) window.clearTimeout(revealTimer);
      focusedField = null;
      delete document.documentElement.dataset.miniappKeyboardOpen;
      try { webApp.BackButton?.offClick(onBack); } catch { /* old client */ }
    },
  };
}
