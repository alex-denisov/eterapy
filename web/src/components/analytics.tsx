/**
 * Внешняя аналитика: Яндекс.Метрика.
 * Скрипты загружаются только после согласия пользователя (GDPR/ФЗ-152).
 *
 * B579 (owner 2026-07-26): Google Analytics снят целиком — передача данных
 * пользователей в GA в РФ под запретом. Снят не только тег: убраны переменная
 * сборки, загрузчик `public/analytics/ga.js` и хост `googletagmanager.com` из
 * `script-src`. Оставленный хост в CSP означал бы, что счётчик можно вернуть
 * одной переменной окружения, а запрет — не про переменную.
 */
"use client";

import { useEffect, useState } from "react";
import Script from "next/script";
import { getCookieConsent } from "./cookie-banner";
import { track } from "@/lib/analytics";
import { ADMIN_DOMAIN, APP_DOMAIN } from "@/lib/env";

const YANDEX_ID = process.env.NEXT_PUBLIC_YANDEX_METRIKA_ID;

/**
 * Админская поверхность — отдельный поддомен в проде и путь `/admin` там, где
 * поддомены выключены (локальная разработка). Проверка клиентская: читать
 * заголовки в корневом layout нельзя, это сделало бы динамическими все 340+
 * пререндеренных страниц.
 */
function isAdminSurface(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.hostname === ADMIN_DOMAIN
    || window.location.pathname === "/admin"
    || window.location.pathname.startsWith("/admin/");
}

/**
 * B568: авторизованная поверхность — кабинет и Mini App. Аналитика здесь
 * нужна (это и есть продуктовое поведение), но вебвизор — нет: он пишет сам
 * документ, то есть дневник, разборы и переписку. Счётчик поднимается,
 * запись сеанса не включается.
 */
function isAuthorizedSurface(): boolean {
  if (typeof window === "undefined") return false;
  const { hostname, pathname } = window.location;
  return hostname === APP_DOMAIN
    || pathname === "/cabinet" || pathname.startsWith("/cabinet/")
    || pathname === "/miniapp" || pathname.startsWith("/miniapp/");
}

export function Analytics() {
  // Defer reading the persisted consent until after hydration so the
  // server-rendered tree (consented=false → null) matches the first
  // client render, eliminating React #418 hydration mismatches on
  // sessions that have already accepted analytics cookies.
  const [consented, setConsented] = useState(false);
  // B568: вебвизор решается той же поверхностью, что и подъём счётчика, и
  // читается после гидратации — до неё `window` знать нечего.
  const [webvisorAllowed, setWebvisorAllowed] = useState(false);
  useEffect(() => {
    // B523: в админке внешнюю аналитику не поднимаем вовсе — админские URL
    // несут идентификаторы пользователей, а сессии администраторов искажают
    // продуктовые воронки.
    //
    // B568: в КАБИНЕТЕ поднимаем — там она и нужна. Раньше она там молча не
    // работала: счётчики вставлялись инлайном, а nonce-политика инлайн режет.
    // Теперь оба грузятся файлами со своего origin (`/analytics/*.js`), а
    // адрес страницы уходит к ним вычищенным от идентификаторов.
    if (isAdminSurface()) return;
    // Intentional post-mount sync — keeps SSR and the first client
    // render at consented=false (null tree) and only flips after
    // hydration. Prevents the React #418 mismatch on sessions that
    // had already accepted analytics cookies.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWebvisorAllowed(!isAuthorizedSurface());
    if (getCookieConsent() === "all") setConsented(true);
  }, []);

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-analytics-event]")
        : null;
      if (!target?.dataset.analyticsEvent) return;

      const href = target.getAttribute("href") ?? "";
      const analyticsTarget = target.dataset.analyticsTarget ?? href;
      track({
        event: target.dataset.analyticsEvent,
        surface: target.dataset.analyticsSurface ?? "global",
        dialogueId: target.dataset.analyticsDialogueId,
        properties: {
          target: analyticsTarget,
          product: target.dataset.analyticsProduct,
          ctaRole: target.dataset.analyticsCtaRole,
          offerId: target.dataset.analyticsOfferId,
          offerReason: target.dataset.analyticsOfferReason,
          priceRub: target.dataset.analyticsPriceRub,
          creditCost: target.dataset.analyticsCreditCost,
        },
      });
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  useEffect(() => {
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
        ym?: (id: string, method: string, event: string, params?: Record<string, string>) => void;
      };
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
        product: target.dataset.analyticsProduct ?? "",
        cta_role: target.dataset.analyticsCtaRole ?? "",
        offer_id: target.dataset.analyticsOfferId ?? "",
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
      {/* B568: правило вычистки адреса грузится первым и отдельно — счётчик
          читает его через `window.eterapyScrubAnalyticsUrl`. */}
      {YANDEX_ID && (
        <Script id="eterapy-analytics-scrub" src="/analytics/scrub.js" strategy="afterInteractive" />
      )}

      {/* Яндекс.Метрика */}
      {YANDEX_ID && (
        <>
          <Script
            id="yandex-metrika"
            src="/analytics/metrika.js"
            strategy="afterInteractive"
            data-eterapy-metrika-id={YANDEX_ID}
            data-eterapy-webvisor={webvisorAllowed ? "1" : "0"}
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
    </>
  );
}
