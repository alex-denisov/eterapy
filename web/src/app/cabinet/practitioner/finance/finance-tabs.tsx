import Link from "next/link";
import { appUrl } from "@/lib/subdomain";

// B466 — «Финансы» 4-tab switcher (Баланс · Тариф · Реквизиты · Отчёты).
// URL-addressable (?tab=) so drill-downs and notifications can deep-link.

export type FinanceTabKey = "balance" | "tariff" | "requisites" | "reports";

export const FINANCE_TABS: Array<{ key: FinanceTabKey; label: string }> = [
  { key: "balance", label: "Баланс" },
  { key: "tariff", label: "Тариф" },
  { key: "requisites", label: "Реквизиты" },
  { key: "reports", label: "Отчёты" },
];

export function FinanceTabs({ active }: { active: FinanceTabKey }) {
  return (
    <div
      className="mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1"
      data-testid="practitioner-finance-tabs"
    >
      {FINANCE_TABS.map((tab) => (
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
