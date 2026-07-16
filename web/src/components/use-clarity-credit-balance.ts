"use client";

import { useCallback, useEffect, useState } from "react";
import { BALANCE_CHANGED_EVENT } from "@/lib/balance-events";

// INC-065: sidebar counters felt frozen because the balance chip only refreshed
// on mount and on the in-tab BALANCE_CHANGED_EVENT — never on a timer and never
// when the user returned to a backgrounded tab. Poll modestly and re-sync on
// focus/visibility so a change made elsewhere (another tab, a purchase, an
// admin adjustment) shows up without a manual reload.
const BALANCE_POLL_MS = 60_000;

// B512 — shared clarity-credit balance hook. Extracted from header.tsx so the
// cabinet-shell mobile balance chip and the header pill read from one source
// (confirmed credits from /api/billing/transactions, live-refreshed on
// BALANCE_CHANGED_EVENT) and can never drift.
export function useClarityCreditBalance(enabled: boolean) {
  const [credits, setCredits] = useState(0);

  const refresh = useCallback(() => {
    if (!enabled) return;
    fetch("/api/billing/transactions", { cache: "no-store" })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        // B512 R1-3 — единственный источник истины: серверный баланс
        // (getClarityCreditBalance по ПОЛНОМУ леджеру). Суммирование последних
        // 50 записей из ответа расходилось с реальным балансом и оставлено
        // только как fallback для кэшированных старых ответов.
        if (typeof d?.clarityCreditBalance === "number") {
          setCredits(Math.max(0, d.clarityCreditBalance));
          return;
        }
        const balance = Array.isArray(d?.clarityCredits)
          ? d.clarityCredits
              .filter((entry: { status?: string }) => entry.status === "confirmed")
              .reduce((sum: number, entry: { amount?: number }) => sum + (entry.amount ?? 0), 0)
          : 0;
        setCredits(Math.max(0, balance));
      })
      .catch(() => {});
  }, [enabled]);

  useEffect(() => { refresh(); }, [refresh]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    const handler = () => refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };
    window.addEventListener(BALANCE_CHANGED_EVENT, handler);
    window.addEventListener("focus", handler);
    document.addEventListener("visibilitychange", onVisible);
    // Modest poll as a backstop when the tab stays open and idle.
    const interval = window.setInterval(refresh, BALANCE_POLL_MS);
    return () => {
      window.removeEventListener(BALANCE_CHANGED_EVENT, handler);
      window.removeEventListener("focus", handler);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, [refresh, enabled]);

  return enabled ? credits : 0;
}
