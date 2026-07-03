"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { mainUrl } from "@/lib/subdomain";

const CONSENT_KEY = "eterapy_cookie_consent";

export type CookieConsent = "all" | "necessary" | null;

// #12: the consent is stored in a cookie on the REGISTRABLE domain (e.g.
// `.eterapy.com`) so it is shared across the landing (eterapy.com) and the
// cabinet (app.eterapy.com). localStorage was per-origin, which is why the
// banner appeared again in the cabinet. localStorage is kept as a same-origin
// fallback + migration source so already-consented users aren't re-prompted.
function consentCookieDomain(): string | undefined {
  if (typeof window === "undefined") return undefined;
  const host = window.location.hostname;
  if (host === "localhost" || /^[0-9.]+$/.test(host)) return undefined;
  const parts = host.split(".");
  if (parts.length < 2) return undefined;
  return `.${parts.slice(-2).join(".")}`;
}

function readConsentCookie(): CookieConsent {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(/(?:^|;\s*)eterapy_cookie_consent=(all|necessary)/);
  return match ? (match[1] as CookieConsent) : null;
}

function writeConsentCookie(value: "all" | "necessary") {
  if (typeof document === "undefined") return;
  const domain = consentCookieDomain();
  const maxAge = 60 * 60 * 24 * 365;
  const secure = window.location.protocol === "https:" ? "; secure" : "";
  document.cookie = `${CONSENT_KEY}=${value}; path=/; max-age=${maxAge}; samesite=lax${domain ? `; domain=${domain}` : ""}${secure}`;
}

export function getCookieConsent(): CookieConsent {
  if (typeof window === "undefined") return null;
  const cookie = readConsentCookie();
  if (cookie) return cookie;
  try {
    const val = localStorage.getItem(CONSENT_KEY);
    if (val === "all" || val === "necessary") return val;
  } catch {
    // private mode — ignore
  }
  return null;
}

export function setCookieConsent(value: "all" | "necessary") {
  writeConsentCookie(value);
  try {
    localStorage.setItem(CONSENT_KEY, value);
  } catch {
    // private mode — cookie is enough
  }
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
  const pathname = usePathname();
  useEffect(() => {
    // #12: migrate a legacy per-origin localStorage consent into the shared
    // parent-domain cookie, so the banner doesn't reappear on the app subdomain.
    if (!readConsentCookie()) {
      try {
        const legacy = localStorage.getItem(CONSENT_KEY);
        if (legacy === "all" || legacy === "necessary") writeConsentCookie(legacy);
      } catch {
        // private mode — ignore
      }
    }
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
  if (!hydrated || consent !== "missing" || pathname.startsWith("/admin")) return null;

  return (
    // B395: тёплая «стеклянная» плашка в стиле iOS — полупрозрачный фон +
    // backdrop-blur, компактная, плавает над контентом и помещается на мобильном
    // экране. Раньше использовала корневую (тёмную) shadcn-тему — отсюда тёмная
    // полоса поверх кремовой страницы. Теперь на токенах --soft-*.
    <div
      role="dialog"
      aria-label="Настройки cookies"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 px-3"
      style={{ paddingBottom: "max(0.6rem, env(safe-area-inset-bottom))" }}
    >
      <div
        className="pointer-events-auto mx-auto flex max-w-xl flex-wrap items-center justify-between gap-x-4 gap-y-2 border px-4 py-2.5"
        style={{
          borderRadius: "1.5rem",
          background: "color-mix(in srgb, var(--soft-paper-card) 70%, transparent)",
          borderColor: "color-mix(in srgb, var(--soft-bordeaux) 10%, transparent)",
          backdropFilter: "blur(24px) saturate(1.8)",
          WebkitBackdropFilter: "blur(24px) saturate(1.8)",
          boxShadow: "0 10px 36px -16px rgba(60,30,20,0.4)",
          color: "var(--soft-ink)",
        }}
      >
        <p className="min-w-0 flex-1 text-xs" style={{ color: "var(--soft-ink-soft)" }}>
          Cookies для входа и аналитики.{" "}
          {/* B464 round-4: absolute main-domain URL — a relative href on the
              app subdomain made Next prefetch /legal/privacy?_rsc, which the
              proxy redirects cross-origin → a CORS console error on EVERY
              cabinet page for consent-less visitors. */}
          <Link
            href={mainUrl("/legal/privacy")}
            className="underline underline-offset-2 hover:no-underline"
            style={{ color: "var(--soft-bordeaux)" }}
          >
            Подробнее
          </Link>
        </p>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={necessary}
            className="rounded-full px-3 py-1.5 text-[13px] font-medium transition-opacity hover:opacity-70"
            style={{ color: "var(--soft-ink-soft)" }}
          >
            Только нужные
          </button>
          <button
            onClick={accept}
            className="soft-button soft-button-primary"
            style={{ minHeight: "2rem", padding: "0.35rem 1rem", fontSize: "0.8125rem" }}
          >
            Принять
          </button>
        </div>
      </div>
    </div>
  );
}
