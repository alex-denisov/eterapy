import Link from "next/link";
import { appUrl } from "@/lib/subdomain";

// B466 — «Финансы» вкладки.
// Мобайл (approved R9-4): 4 вкладки Баланс · Тариф · Реквизиты · Отчёты
// (Движение/Чеки на мобиле — drill-down роуты).
// Десктоп (approved R9-5 -finance-v2, owner ROUND 4 #3): 6 вкладок —
// Баланс · Тариф · Реквизиты · Движение · Отчёты · Чеки.

export type FinanceTabKey = "balance" | "tariff" | "requisites" | "movements" | "reports" | "receipts";

// Мобильный набор (drives finance-mobile.tsx segment) — не менять состав.
export const FINANCE_TABS: Array<{ key: FinanceTabKey; label: string }> = [
  { key: "balance", label: "Баланс" },
  { key: "tariff", label: "Тариф" },
  { key: "requisites", label: "Реквизиты" },
  { key: "reports", label: "Отчёты" },
];

// Десктопный набор — 6 вкладок по -finance-v2.
export const FINANCE_DESKTOP_TABS: Array<{ key: FinanceTabKey; label: string }> = [
  { key: "balance", label: "Баланс" },
  { key: "tariff", label: "Тариф" },
  { key: "requisites", label: "Реквизиты" },
  { key: "movements", label: "Движение" },
  { key: "reports", label: "Отчёты" },
  { key: "receipts", label: "Чеки" },
];

export function FinanceTabs({ active }: { active: FinanceTabKey }) {
  return (
    <div
      className="mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1"
      data-testid="practitioner-finance-tabs"
    >
      {FINANCE_DESKTOP_TABS.map((tab) => (
        <Link
          key={tab.key}
          href={appUrl(`/practitioner/finance?tab=${tab.key}`)}
          className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
            active === tab.key ? "soft-select-pill" : "text-[var(--soft-ink-soft)] hover:text-foreground"
          }`}
          aria-current={active === tab.key ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
