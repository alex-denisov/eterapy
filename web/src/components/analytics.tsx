/**
 * Внешняя аналитика: Яндекс.Метрика + Google Analytics.
 * Скрипты загружаются только после согласия пользователя (GDPR/ФЗ-152).
 */
"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { getCookieConsent } from "./cookie-banner";

const YANDEX_ID = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function Analytics() {
  const [consented, setConsented] = useState(false);

  useEffect(() => {
    if (getCookieConsent() === "all") setConsented(true);

    function onConsentChange() {
      if (getCookieConsent() === "all") setConsented(true);
    }
    window.addEventListener("eterapy:cookie-consent-changed", onConsentChange);
    return () => window.removeEventListener("eterapy:cookie-consent-changed", onConsentChange);
  }, []);

  useEffect(() => {
    if (!consented) return;

    function send(eventName: string, params: Record<string, string>) {
      const win = window as typeof window & {
        gtag?: (...args: unknown[]) => void;
        ym?: (id: string, method: string, event: string, params?: Record<string, string>) => void;
      };
      win.gtag?.("event", eventName, params);
      if (YANDEX_ID) win.ym?.(YANDEX_ID, "reachGoal", eventName, params);
    }

    function onCustom(event: Event) {
      const detail = event instanceof CustomEvent ? event.detail : null;
      if (!detail?.event) return;
      const { event: eventName, ...params } = detail as { event: string } & Record<string, string>;
      send(eventName, params);
    }

    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-analytics-event]")
        : null;
      if (!target?.dataset.analyticsEvent) return;
      send(target.dataset.analyticsEvent, {
        surface: target.dataset.analyticsSurface ?? "global",
        target: target.dataset.analyticsTarget ?? target.getAttribute("href") ?? "",
      });
    }

    window.addEventListener("eterapy:analytics", onCustom);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("eterapy:analytics", onCustom);
      document.removeEventListener("click", onClick);
    };
  }, [consented]);

  if (!consented) return null;

  return (
    <>
      {/* Яндекс.Метрика */}
      {YANDEX_ID && (
        <>
          <Script
            id="yandex-metrika"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
                m[i].l=1*new Date();
                for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
                k=e.createElement(t);a=e.getElementsByTagName(t)[0];k.async=1;k.src=r;a.parentNode.insertBefore(k,a)})
                (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");

                ym(${YANDEX_ID}, "init", {
                  clickmap: true,
                  trackLinks: true,
                  accurateTrackBounce: true,
                  webvisor: true,
                  ecommerce: "dataLayer"
                });
              `,
            }}
          />
          <noscript>
            <div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`https://mc.yandex.ru/watch/${YANDEX_ID}`}
                style={{ position: "absolute", left: "-9999px" }}
                alt=""
              />
            </div>
          </noscript>
        </>
      )}

      {/* Google Analytics 4 */}
      {GA_ID && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
            strategy="afterInteractive"
          />
          <Script
            id="google-analytics"
            strategy="afterInteractive"
            dangerouslySetInnerHTML={{
              __html: `
                window.dataLayer = window.dataLayer || [];
                function gtag(){dataLayer.push(arguments);}
                gtag('js', new Date());
                gtag('config', '${GA_ID}', {
                  page_path: window.location.pathname,
                  send_page_view: true
                });
              `,
            }}
          />
        </>
      )}
    </>
  );
}
