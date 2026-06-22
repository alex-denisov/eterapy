"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { formatPoints } from "@/lib/points";
import { onCompanionSession, type CompanionSessionSnapshot } from "@/lib/companion-session-events";

// Issue #5: the hero price pill (data-testid="product-hero-price") is shown only
// until оказание услуги starts. Once a paid session opens, the live countdown
// timer takes its exact place; the price disappears (we never show the price once
// the service is running). On reaching 00:00 the timer stays at 00:00 until the
// client pays to extend (the panel re-broadcasts a fresh expiresAt on extend).

function formatRemaining(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = Math.floor(total / 60);
  const ss = total % 60;
  return `${mm.toString().padStart(2, "0")}:${ss.toString().padStart(2, "0")}`;
}

export type ChatHeroPriceProps = {
  authed: boolean;
  priceLabel: string;
  costCredits: number;
};

export function ChatHeroPrice({ authed, priceLabel, costCredits }: ChatHeroPriceProps) {
  const [session, setSession] = useState<CompanionSessionSnapshot>({ started: false, expiresAt: null });
  const [remainingMs, setRemainingMs] = useState(0);

  useEffect(() => onCompanionSession(setSession), []);

  // Run an independent 1s countdown off the broadcast expiresAt; clamps at 0 and
  // stays there (00:00) until a fresh expiresAt arrives via extend.
  useEffect(() => {
    if (!session.started) return;
    const expiry = session.expiresAt ? new Date(session.expiresAt).getTime() : 0;
    const tick = () => setRemainingMs(expiry - Date.now());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [session.started, session.expiresAt]);

  if (session.started) {
    return (
      <span
        className="soft-badge soft-badge-warm inline-flex shrink-0 items-center gap-1.5 tabular-nums"
        data-testid="companion-timer"
        aria-label="Время сессии"
      >
        <Clock className="size-3.5" aria-hidden="true" />
        {formatRemaining(remainingMs)}
      </span>
    );
  }

  if (authed) {
    return (
      <span
        className="flex shrink-0 flex-col items-end rounded-2xl px-3.5 py-1.5 leading-none text-[var(--soft-bordeaux)]"
        style={{ background: "var(--soft-apricot)" }}
        data-testid="product-hero-price"
      >
        <span className="text-lg font-semibold">{formatPoints(costCredits)}</span>
        <span className="mt-0.5 text-[10.5px] font-medium opacity-65">или {priceLabel}</span>
      </span>
    );
  }

  return (
    <span
      className="shrink-0 rounded-full px-3.5 py-1.5 text-lg font-semibold leading-none text-[var(--soft-bordeaux)]"
      style={{ background: "var(--soft-apricot)" }}
      data-testid="product-hero-price"
    >
      {priceLabel}
    </span>
  );
}
