"use client";

import { useMemo } from "react";
import { getLedgerTypeLabel, humanizeBillingDescription } from "@/lib/billing-labels";
import { RevealList } from "@/components/cabinet/reveal-list";

interface BillingTransaction {
  id: string;
  amountRub: string | number;
  status: string;
  description: string | null;
  createdAt: string;
}

interface BillingLedgerEntry {
  id: string;
  amountRub: string | number;
  type: string;
  description: string | null;
  createdAt: string;
}

type Direction = "deposit" | "spend";

interface HistoryRow {
  id: string;
  label: string;
  amountRub: number;
  direction: Direction;
  status: string;
  createdAt: number;
}

function statusLabel(status: string): string {
  switch (status) {
    case "SUCCEEDED":
      return "Оплачено";
    case "PENDING":
      return "В обработке";
    case "CANCELED":
    case "CANCELLED":
      return "Отменён";
    case "settled":
      return "Проведено";
    default:
      return status;
  }
}

/**
 * Unified money-movement history (deposits + spends). Settled balance
 * movements come from the RUB ledger; in-flight / failed top-ups are folded in
 * from the raw transactions so the user still sees pending payments.
 *
 * B464 round-4 #13: rendered as calm list rows, latest 4 + «показать ещё» —
 * the mockup's ₽-receipts list, not a data-grid with search/sort chrome.
 */
export function BillingHistoryTable({
  transactions,
  ledger,
}: {
  transactions: BillingTransaction[];
  ledger: BillingLedgerEntry[];
}) {
  const rows = useMemo<HistoryRow[]>(() => {
    const ledgerRows: HistoryRow[] = ledger.map((entry) => {
      const amount = Number(entry.amountRub);
      return {
        id: `ledger-${entry.id}`,
        label: entry.description ? humanizeBillingDescription(entry.description) : getLedgerTypeLabel(entry.type),
        amountRub: amount,
        direction: amount >= 0 ? "deposit" : "spend",
        status: "settled",
        createdAt: new Date(entry.createdAt).getTime(),
      };
    });
    // Only surface transactions that the ledger does NOT already represent —
    // i.e. pending or failed top-ups (succeeded ones become ledger deposits).
    // Баг 5: the 1 ₽ card-verification hold is intentionally cancelled after the
    // card is saved, so it must NOT appear in history as "Отменён" — the linked
    // card itself is the confirmation (and it shows under "Мои карты").
    const pendingRows: HistoryRow[] = transactions
      .filter((t) => t.status !== "SUCCEEDED")
      .filter((t) => !/привязка (банковской )?карт/i.test(t.description ?? ""))
      .map((t) => ({
        id: `tx-${t.id}`,
        label: humanizeBillingDescription(t.description),
        amountRub: Math.abs(Number(t.amountRub)),
        direction: "deposit" as Direction,
        status: t.status,
        createdAt: new Date(t.createdAt).getTime(),
      }));
    return [...ledgerRows, ...pendingRows].sort((a, b) => b.createdAt - a.createdAt);
  }, [ledger, transactions]);

  return (
    <div data-testid="client-billing-history-table">
      {rows.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--soft-ink-faint)]">
          <p>Операций пока нет</p>
          <p className="mt-1 text-xs">Здесь будут отображаться ваши пополнения и списания</p>
        </div>
      ) : (
        <RevealList initial={4} step={4} className="divide-y divide-[var(--soft-paper-edge)]" moreLabel="Показать ещё">
          {rows.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-4 py-3 text-sm" data-testid="billing-history-rows">
              <div className="min-w-0">
                <p className="inline-flex items-center gap-2.5 font-medium text-[var(--soft-ink)]">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: row.direction === "deposit" ? "var(--soft-terracotta-dark)" : "var(--soft-bordeaux)" }}
                    aria-hidden="true"
                  />
                  <span className="break-words">{row.label}</span>
                </p>
                <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
                  {new Date(row.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })} · {statusLabel(row.status)}
                </p>
              </div>
              <span className="shrink-0 font-heading font-semibold" style={{ color: row.direction === "deposit" ? "var(--soft-terracotta-dark)" : "var(--soft-bordeaux)" }}>
                {row.amountRub >= 0 ? "+" : "−"}{Math.abs(row.amountRub).toFixed(2)} ₽
              </span>
            </div>
          ))}
        </RevealList>
      )}
    </div>
  );
}
