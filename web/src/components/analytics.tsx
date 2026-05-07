/**
 * Внешняя аналитика: Яндекс.Метрика + Google Analytics.
 * Подключается через Script (Next.js) для SSR-safe загрузки.
 * ID счётчиков берутся из env: YANDEX_METRIKA_ID, GA_MEASUREMENT_ID
 */
"use client";

import { useEffect } from "react";
import Script from "next/script";

const YANDEX_ID = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID;
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

export function Analytics() {
  useEffect(() => {
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
  }, []);

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
