"use client";

import { useCallback, useEffect, useState } from "react";
import { BALANCE_CHANGED_EVENT } from "@/lib/balance-events";

// B512 — shared clarity-credit balance hook. Extracted from header.tsx so the
// cabinet-shell mobile balance chip and the header pill read from one source
// (confirmed credits from /api/billing/transactions, live-refreshed on
// BALANCE_CHANGED_EVENT) and can never drift.
export function useClarityCreditBalance(enabled: boolean) {
  const [credits, setCredits] = useState(0);

  const refresh = useCallback(() => {
    if (!enabled) return;
    fetch("/api/billing/transactions")
      .then(r => r.ok ? r.json() : null)
      .then(d => {
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
    window.addEventListener(BALANCE_CHANGED_EVENT, handler);
    return () => window.removeEventListener(BALANCE_CHANGED_EVENT, handler);
  }, [refresh, enabled]);

  return enabled ? credits : 0;
}
