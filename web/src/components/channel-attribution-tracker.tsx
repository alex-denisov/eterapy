"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

function first(searchParams: URLSearchParams, ...keys: string[]) {
  for (const key of keys) {
    const value = searchParams.get(key);
    if (value) return value;
  }
  return null;
}

export function ChannelAttributionTracker() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    const query = searchParams.toString();
    const entryPath = query ? `${pathname}?${query}` : pathname;
    const payload = {
      source: first(searchParams, "source", "from"),
      channel: first(searchParams, "channel"),
      entryPath,
      utmSource: first(searchParams, "utm_source"),
      utmMedium: first(searchParams, "utm_medium"),
      utmCampaign: first(searchParams, "utm_campaign"),
      utmContent: first(searchParams, "utm_content"),
      utmTerm: first(searchParams, "utm_term"),
      referralToken: first(searchParams, "ref", "token"),
      practitionerId: first(searchParams, "practitionerId", "practitioner_id"),
      practitionerSlug: first(searchParams, "practitioner", "practitioner_slug"),
      partnerId: first(searchParams, "partner", "partner_id"),
      widgetId: first(searchParams, "widget", "widget_id"),
      entryProduct: first(searchParams, "entry", "product", "nextProduct"),
    };

    void fetch("/api/attribution/touch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      keepalive: true,
    }).then(() => {
      window.dispatchEvent(new CustomEvent("eterapy:analytics", {
        detail: {
          event: "channel_touch_recorded",
          surface: "global_attribution",
          source: payload.source ?? payload.utmSource ?? "direct",
          channel: payload.channel ?? payload.utmMedium ?? "web",
          entryProduct: payload.entryProduct ?? "",
        },
      }));
    }).catch(() => undefined);
  }, [pathname, searchParams]);

  return null;
}
