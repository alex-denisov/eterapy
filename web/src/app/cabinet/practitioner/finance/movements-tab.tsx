import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, Lock } from "lucide-react";
import { appUrl } from "@/lib/subdomain";
import { loadPractitionerFinance, type FinanceMovement } from "./finance-data";

// B466 R9-5 desktop — «Финансы → Движение средств» как отдельная вкладка
// (owner ROUND 4 #3в: «Движение» сразу после «Реквизиты»). Переиспользует тот же
// серверный загрузчик, что и мобильный drill-down /finance/movements; фильтры
// ведут на ?tab=movements&filter= (URL-адресуемо). Удержания живут здесь.

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "earnings", label: "Зачисления" },
  { key: "payouts", label: "Выплаты" },
  { key: "holds", label: "Удержания" },
] as const;

type FilterKey = (typeof FILTERS)[number]["key"];

const KIND_BY_FILTER: Record<Exclude<FilterKey, "all">, FinanceMovement["kind"]> = {
  earnings: "earning",
  payouts: "payout",
  holds: "hold",
};

const MONTH_FMT = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "Europe/Moscow" });
const DAY_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });

export function normalizeMovementsFilter(raw: string | undefined): FilterKey {
  return FILTERS.some((f) => f.key === raw) ? (raw as FilterKey) : "all";
}

export async function MovementsTab({ practitionerId, filter }: { practitionerId: string; filter: FilterKey }) {
  const data = await loadPractitionerFinance(practitionerId);
  const filtered =
    filter === "all"
      ? data.movements
      : data.movements.filter((m) => m.kind === KIND_BY_FILTER[filter as Exclude<FilterKey, "all">]);

  const byMonth = new Map<string, FinanceMovement[]>();
  for (const movement of filtered) {
    const key = MONTH_FMT.format(movement.date);
    byMonth.set(key, [...(byMonth.get(key) ?? []), movement]);
  }

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="practitioner-finance-movements-tab">
      {/* Фильтры Все · Зачисления · Выплаты · Удержания */}
      <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={appUrl(`/practitioner/finance?tab=movements${f.key === "all" ? "" : `&filter=${f.key}`}`)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              filter === f.key ? "soft-select-pill" : "text-[var(--soft-ink-soft)] hover:text-foreground"
            }`}
            aria-current={filter === f.key ? "page" : undefined}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {byMonth.size === 0 ? (
        <p className="text-sm text-[var(--soft-ink-faint)]">
          {filter === "holds"
            ? "Активных удержаний нет — hold снимается автоматически после периода удержания по тарифу."
            : "Операций пока нет — они появятся после первой завершённой сессии."}
        </p>
      ) : (
        [...byMonth.entries()].map(([month, rows]) => (
          <section key={month}>
            <p className="soft-eyebrow mb-2.5 capitalize">{month}</p>
            <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
              {rows.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-3.5 py-3">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
                    style={
                      m.kind === "earning"
                        ? { background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }
                        : m.kind === "hold"
                          ? { background: "var(--soft-amber-bg,#F2E2C2)", color: "var(--soft-amber-ink,#6E5114)" }
                          : { background: "var(--soft-paper-deep)", color: "var(--soft-ink-soft)" }
                    }
                  >
                    {m.kind === "earning" ? (
                      <ArrowUpRight className="h-4 w-4" />
                    ) : m.kind === "hold" ? (
                      <Lock className="h-[15px] w-[15px]" />
                    ) : (
                      <ArrowDownLeft className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{m.label}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--soft-ink-faint)]">
                      {DAY_FMT.format(m.date)} · {m.sublabel}
                    </p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span
                      className={`block font-heading text-sm font-semibold tabular-nums ${
                        m.kind === "earning"
                          ? "text-[var(--soft-sage-ink,#4B6146)]"
                          : m.kind === "hold"
                            ? "text-[var(--soft-amber-ink,#6E5114)]"
                            : "text-[var(--soft-ink-soft)]"
                      }`}
                    >
                      {m.kind === "earning" ? "+" : "−"}
                      {m.amountRub.toLocaleString("ru")} ₽
                    </span>
                    {m.kind === "hold" && <span className="block text-[10px] text-[var(--soft-ink-faint)]">на удержании</span>}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
