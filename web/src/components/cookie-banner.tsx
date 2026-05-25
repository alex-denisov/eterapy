"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";

const CONSENT_KEY = "eterapy_cookie_consent";

export type CookieConsent = "all" | "necessary" | null;

export function getCookieConsent(): CookieConsent {
  if (typeof window === "undefined") return null;
  const val = localStorage.getItem(CONSENT_KEY);
  if (val === "all" || val === "necessary") return val;
  return null;
}

export function setCookieConsent(value: "all" | "necessary") {
  localStorage.setItem(CONSENT_KEY, value);
}

function subscribeToCookieConsent(callback: () => void) {
  window.addEventListener("eterapy:cookie-consent-changed", callback);
  window.addEventListener("storage", callback);

  return () => {
    window.removeEventListener("eterapy:cookie-consent-changed", callback);
    window.removeEventListener("storage", callback);
  };
}

function getCookieConsentSnapshot() {
  return getCookieConsent() ?? "missing";
}

export function CookieBanner() {
  const consent = useSyncExternalStore(subscribeToCookieConsent, getCookieConsentSnapshot, () => "pending");
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    // Intentional post-mount toggle — defers the banner to after
    // hydration so server (`pending`/null) and the first client render
    // emit the same tree. The single cascading render is required and
    // far cheaper than a hydration mismatch (React #418).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHydrated(true);
  }, []);

  function accept() {
    setCookieConsent("all");
    window.dispatchEvent(new Event("eterapy:cookie-consent-changed"));
  }

  function necessary() {
    setCookieConsent("necessary");
    window.dispatchEvent(new Event("eterapy:cookie-consent-changed"));
  }

  // Render nothing until after hydration to keep SSR and the first
  // client render identical (server returns "pending" → null).
  if (!hydrated || consent !== "missing") return null;

  return (
    <div
      role="dialog"
      aria-label="Настройки cookies"
      className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-4 md:px-6"
    >
      <div className="mx-auto max-w-5xl flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground leading-relaxed">
          Мы используем{" "}
          <strong className="text-foreground">необходимые cookies</strong>{" "}
          для аутентификации, а также{" "}
          <strong className="text-foreground">аналитические cookies</strong>{" "}
          (Яндекс.Метрика, Google Analytics) для улучшения сервиса — только с вашего согласия.{" "}
          <Link href="/legal/privacy" className="underline hover:no-underline">
            Политика конфиденциальности
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={necessary}
            className="rounded-full border border-border px-4 py-2 text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
          >
            Только необходимые
          </button>
          <button
            onClick={accept}
            className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Принять все
          </button>
        </div>
      </div>
    </div>
  );
}
