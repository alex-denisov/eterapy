export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, ChevronLeft, Lock } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { loadPractitionerFinance, type FinanceMovement } from "../finance-data";

// B466 — «Движение средств» (mockup -movements): полная история операций,
// сгруппированная по месяцам, с фильтрами Все · Зачисления · Выплаты ·
// Удержания (owner round-2 #1: удержания/холды живут именно здесь).

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

const MONTH_FMT = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});

const DAY_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Moscow",
});

export default async function FinanceMovementsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { id: true },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const { filter: rawFilter } = await searchParams;
  const filter: FilterKey = FILTERS.some((f) => f.key === rawFilter) ? (rawFilter as FilterKey) : "all";

  const data = await loadPractitionerFinance(practitioner.id);
  const filtered = filter === "all"
    ? data.movements
    : data.movements.filter((m) => m.kind === KIND_BY_FILTER[filter as Exclude<FilterKey, "all">]);

  const byMonth = new Map<string, FinanceMovement[]>();
  for (const movement of filtered) {
    const key = MONTH_FMT.format(movement.date);
    byMonth.set(key, [...(byMonth.get(key) ?? []), movement]);
  }

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 по mockup practitioner-finance-movements (topbar · фильтры · по месяцам) */}
      <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-finance-movements-mobile">
        <div className="pcab-topbar">
          <Link href={appUrl("/practitioner/finance")} className="pcab-roundbtn" aria-label="Назад">
            <ChevronLeft width={19} height={19} aria-hidden="true" />
          </Link>
          <span className="pcab-topbar-title">Движение средств</span>
          <span className="pcab-topbar-spacer" />
        </div>

        <div className="pcab-chips" data-testid="movements-filters-mobile">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={appUrl(`/practitioner/finance/movements${f.key === "all" ? "" : `?filter=${f.key}`}`)}
              className={`pcab-chip${filter === f.key ? " is-active" : ""}`}
              aria-current={filter === f.key ? "true" : undefined}
            >
              {f.label}
            </Link>
          ))}
        </div>

        {byMonth.size === 0 ? (
          <p className="pcab-lead">
            {filter === "holds"
              ? "Активных удержаний нет — hold снимается автоматически после периода удержания по тарифу."
              : "Операций пока нет."}
          </p>
        ) : (
          [...byMonth.entries()].map(([month, rows]) => (
            <section key={month} className="pcab-section">
              <div className="pcab-eyebrow" style={{ marginBottom: 8 }}>{month}</div>
              <div className="pcab-list">
                {rows.map((m) => (
                  <div key={m.id} className="pcab-mv">
                    <span className={`pcab-mv-ic ${m.kind === "earning" ? "in" : m.kind === "hold" ? "hold" : "out"}`}>
                      {m.kind === "earning" ? (
                        <ArrowUpRight size={16} aria-hidden="true" />
                      ) : m.kind === "hold" ? (
                        <Lock size={15} aria-hidden="true" />
                      ) : (
                        <ArrowDownLeft size={16} aria-hidden="true" />
                      )}
                    </span>
                    <span className="pcab-mv-main">
                      <span className="pcab-mv-t">{m.label}</span>
                      <span className="pcab-mv-s">
                        {DAY_FMT.format(m.date)} · {m.sublabel}
                      </span>
                    </span>
                    <span className={`pcab-mv-amt ${m.kind === "earning" ? "pos" : m.kind === "hold" ? "hold" : "neg"}`}>
                      {m.kind === "earning" ? "+" : "−"}
                      {m.amountRub.toLocaleString("ru")} ₽
                      {m.kind === "hold" && <small>на удержании</small>}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>

      {/* ДЕСКТОП — прежний вид (ждёт новых десктоп-макетов R9-5) */}
      <div className="mx-auto hidden w-full max-w-3xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-finance-movements">
      <Link href={appUrl("/practitioner/finance")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Финансы
      </Link>
      <p className="soft-eyebrow mt-4">Финансы практика</p>
      <h1 className="soft-h1 mt-2">Движение средств</h1>

      {/* Filters */}
      <div className="mt-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={appUrl(`/practitioner/finance/movements${f.key === "all" ? "" : `?filter=${f.key}`}`)}
            className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
              filter === f.key ? "soft-select-pill" : "text-[var(--soft-ink-soft)] hover:text-foreground"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {byMonth.size === 0 ? (
        <p className="mt-6 text-sm text-[var(--soft-ink-faint)]">
          {filter === "holds"
            ? "Активных удержаний нет — hold снимается автоматически после периода удержания по тарифу."
            : "Операций пока нет."}
        </p>
      ) : (
        [...byMonth.entries()].map(([month, rows]) => (
          <section key={month} className="mt-6">
            <p className="soft-eyebrow mb-2.5 capitalize">{month}</p>
            <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
              {rows.map((m) => (
                <div key={m.id} className="flex items-center gap-3 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{m.label}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--soft-ink-faint)]">
                      {DAY_FMT.format(m.date)} · {m.sublabel}
                    </p>
                  </div>
                  <span className="shrink-0 text-right">
                    <span
                      className={`block text-sm font-semibold tabular-nums ${
                        m.kind === "earning"
                          ? "text-[var(--soft-sage-ink,#4B6146)]"
                          : m.kind === "hold"
                            ? "text-[var(--soft-amber-ink,#6E5114)]"
                            : "text-[var(--soft-ink-soft)]"
                      }`}
                    >
                      {m.kind === "earning" ? "+" : "−"}{m.amountRub.toLocaleString("ru")} ₽
                    </span>
                    {m.kind === "hold" && (
                      <span className="block text-[10px] text-[var(--soft-ink-faint)]">на удержании</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
      </div>
    </>
  );
}
