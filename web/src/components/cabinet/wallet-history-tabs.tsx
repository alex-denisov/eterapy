"use client";

import { useState } from "react";

/**
 * B602 · «История операций» — один блок, две вкладки.
 *
 * Владелец просил объединить историю платежей и историю операций с баллами в
 * ОДИН блок. Плоским списком это сделать нельзя: покупка пакета порождает две
 * записи в разных таблицах — рублёвую (`CreditLedgerEntry`) и балльную
 * (`ClarityCreditLedgerEntry`), — и объединённый список показал бы каждую
 * покупку дважды: «+790 ₽» и «+5 баллов». Это хуже, чем два блока.
 *
 * Вкладки дают один блок на странице и один смысл в каждый момент времени.
 * Обе ветки рендерятся всегда и лишь скрываются — так внутренние «показать
 * ещё» не сбрасываются при переключении, а тесты видят оба узла.
 */
export function WalletHistoryTabs({
  credits,
  money,
}: {
  credits: React.ReactNode;
  money: React.ReactNode;
}) {
  const [tab, setTab] = useState<"credits" | "money">("credits");

  return (
    <div data-testid="wallet-history-tabs">
      <div className="mb-3 inline-flex rounded-full border border-[var(--soft-paper-edge)] p-0.5" role="tablist">
        {([
          ["credits", "Баллы"],
          ["money", "Деньги"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className="min-h-9 rounded-full px-4 text-[13px] font-semibold transition-colors"
            data-testid={`wallet-history-tab-${key}`}
            style={
              tab === key
                ? { background: "var(--soft-terracotta)", color: "#FFFCF5" }
                : { color: "var(--soft-ink-soft)" }
            }
          >
            {label}
          </button>
        ))}
      </div>
      <div hidden={tab !== "credits"}>{credits}</div>
      <div hidden={tab !== "money"}>{money}</div>
    </div>
  );
}
