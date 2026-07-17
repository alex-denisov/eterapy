"use client";

import { useCallback, useEffect, useState } from "react";
import { ADMIN_COUNTS_CHANGED_EVENT } from "@/lib/admin-counts-events";

// INC-065 (round 2): the sidebar badges were computed once in the server
// layout and never refreshed — cancelling a booking or resolving a complaint
// left stale numbers until a full reload. Same live-refresh contract as the
// balance chip: in-tab change event, focus, visibilitychange and a modest
// backstop poll.
const COUNTS_POLL_MS = 60_000;

export function useAdminNavCounts(initial?: Record<string, number>) {
  const [counts, setCounts] = useState<Record<string, number> | undefined>(initial);

  const refresh = useCallback(() => {
    fetch("/api/admin/nav-counts", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d === "object" && !("error" in d)) setCounts(d as Record<string, number>);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(ADMIN_COUNTS_CHANGED_EVENT, handler);
    window.addEventListener("focus", handler);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(refresh, COUNTS_POLL_MS);
    return () => {
      window.removeEventListener(ADMIN_COUNTS_CHANGED_EVENT, handler);
      window.removeEventListener("focus", handler);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [refresh]);

  return counts;
}
