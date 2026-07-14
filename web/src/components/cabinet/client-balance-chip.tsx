"use client";

import Link from "next/link";
import { Sparkles } from "lucide-react";
import { appUrl } from "@/lib/subdomain";
import { formatPoints } from "@/lib/points";
import { useClarityCreditBalance } from "@/components/use-clarity-credit-balance";

// B512 §3.3 — persistent мобильный чип баллов в верхней панели кабинета
// (слева от колокольчика). Честная доступность баланса на каждой странице,
// без таймеров и давления; при нуле превращается в спокойный «Пополнить».
export function ClientBalanceChip() {
  const credits = useClarityCreditBalance(true);
  return (
    <Link
      href={appUrl("/wallet")}
      prefetch={false}
      data-testid="client-mobile-balance-chip"
      aria-label={`Баллы: ${formatPoints(credits)}`}
      className="inline-flex h-[34px] items-center gap-1.5 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3 text-[12.5px] font-bold leading-none tabular-nums text-[var(--soft-terracotta-dark)] shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]"
    >
      <Sparkles className="size-[13px] shrink-0 text-[var(--soft-terracotta)]" aria-hidden="true" />
      {credits > 0 ? (
        <span className="whitespace-nowrap">{formatPoints(credits)}</span>
      ) : (
        <span className="text-[11.5px]" data-testid="client-mobile-chip-topup">Пополнить</span>
      )}
    </Link>
  );
}
