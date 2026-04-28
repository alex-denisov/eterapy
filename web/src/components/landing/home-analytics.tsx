"use client";

import { useEffect } from "react";

function emitAnalyticsEvent(event: string, payload: Record<string, string> = {}) {
  window.dispatchEvent(new CustomEvent("eterapy:analytics", {
    detail: {
      event,
      ...payload,
    },
  }));
}

export function HomeAnalytics() {
  useEffect(() => {
    emitAnalyticsEvent("home_viewed", { surface: "public_home" });

    function onClick(event: MouseEvent) {
      const target = event.target instanceof Element
        ? event.target.closest<HTMLElement>("[data-analytics-event]")
        : null;
      if (!target?.dataset.analyticsEvent) return;

      emitAnalyticsEvent(target.dataset.analyticsEvent, {
        surface: target.dataset.analyticsSurface ?? "public_home",
        target: target.dataset.analyticsTarget ?? target.getAttribute("href") ?? "",
      });
    }

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return null;
}
