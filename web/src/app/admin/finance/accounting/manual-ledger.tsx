"use client";

/**
 * B591 — ручные приходы и расходы вне платёжного рельса.
 *
 * Экран держит различение, ради которого раздел и существует: **расход на УСН
 * «Доходы» налог не уменьшает**. Поэтому расходы не складываются с доходами в
 * одну «прибыль» нигде на этой странице, а приход, не входящий в базу (перевод
 * себе, возврат поставщика), показан отдельной суммой, а не спрятан.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  LEDGER_CATEGORIES,
  categoryByKey,
  summarizeManualLedger,
  type LedgerDirection,
  type ManualLedgerEntry,
} from "@/lib/ip-manual-ledger";

type ApiEntry = Omit<ManualLedgerEntry, "occurredAt"> & { occurredAt: string };

const rub = (kopecks: number) => `${(kopecks / 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
const FIELD = "h-9 w-full rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-2.5 text-sm text-[var(--soft-ink-strong)]";
const LABEL = "text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]";

export function ManualLedger({ year }: { year: number }) {
  const [entries, setEntries] = useState<ApiEntry[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<LedgerDirection>("expense");
  const [categoryKey, setCategoryKey] = useState("expense_infra");
  const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [amountRub, setAmountRub] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [note, setNote] = useState("");
  const [taxable, setTaxable] = useState(true);

  const load = useCallback(async () => {
    const response = await fetch(`/api/admin/finance/ledger?year=${year}`, { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data) {
      toast.error("Не удалось загрузить строки");
      return;
    }
    setEntries(data.entries as ApiEntry[]);
  }, [year]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/finance/ledger?year=${year}`, { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || !data) throw new Error("Не удалось загрузить строки");
        if (!cancelled) setEntries(data.entries as ApiEntry[]);
      })
      .catch(() => {
        if (!cancelled) toast.error("Не удалось загрузить строки");
      });
    return () => {
      cancelled = true;
    };
  }, [year]);

  const categories = useMemo(
    () => LEDGER_CATEGORIES.filter((category) => category.direction === direction),
    [direction],
  );

  function switchDirection(next: LedgerDirection) {
    setDirection(next);
    const first = LEDGER_CATEGORIES.find((category) => category.direction === next);
    if (first) setCategoryKey(first.key);
    if (next === "expense") setTaxable(false);
    else setTaxable(true);
  }

  async function submit() {
    setBusy(true);
    try {
      const response = await fetch("/api/admin/finance/ledger", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ occurredAt, categoryKey, amountRub, taxable, counterparty, documentRef, note }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось сохранить");
      setAmountRub("");
      setCounterparty("");
      setDocumentRef("");
      setNote("");
      toast.success("Строка добавлена");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm("Удалить строку? Она пропадёт и из годового пакета.")) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/admin/finance/ledger?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Не удалось удалить");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось удалить");
    } finally {
      setBusy(false);
    }
  }

  const totals = summarizeManualLedger(
    (entries ?? []).map((entry) => ({ ...entry, occurredAt: new Date(entry.occurredAt) })),
  );
  const selectedCategory = categoryByKey(categoryKey);

  return (
    <section className="soft-card p-5" data-testid="accounting-manual-ledger">
      <h2 className="soft-h3">Прочие приходы и расходы за {year} год</h2>
      <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
        Всё, что прошло мимо Robokassa и Telegram Stars: оплата по счёту, банковские комиссии,
        серверы, подписки, взносы. Платформа этих денег не видит — строки заводятся руками и
        попадают в годовой пакет для бухгалтера.
      </p>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[12px] border border-[var(--soft-paper-edge)] px-3 py-2">
          <div className="text-[11px] text-[var(--soft-ink-faint)]">Приход в базу УСН</div>
          <div className="text-sm font-semibold tabular-nums text-[var(--soft-ink)]" data-testid="ledger-total-taxable">
            {rub(totals.taxableIncomeKopecks)}
          </div>
        </div>
        <div className="rounded-[12px] border border-[var(--soft-paper-edge)] px-3 py-2">
          <div className="text-[11px] text-[var(--soft-ink-faint)]">Приход вне базы</div>
          <div className="text-sm font-semibold tabular-nums text-[var(--soft-ink)]">{rub(totals.nonTaxableIncomeKopecks)}</div>
        </div>
        <div className="rounded-[12px] border border-[var(--soft-paper-edge)] px-3 py-2">
          <div className="text-[11px] text-[var(--soft-ink-faint)]">Расходы (налог не уменьшают)</div>
          <div className="text-sm font-semibold tabular-nums text-[var(--soft-ink)]">{rub(totals.expenseKopecks)}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 rounded-[12px] border border-[var(--soft-paper-edge)] p-3">
        <div className="flex gap-2">
          {(["expense", "income"] as const).map((value) => (
            <button
              key={value}
              type="button"
              className="soft-admin-action"
              data-variant={direction === value ? "primary" : "subtle"}
              data-testid={`ledger-direction-${value}`}
              onClick={() => switchDirection(value)}
            >
              {value === "expense" ? "Расход" : "Приход"}
            </button>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-4">
          <label className="block">
            <span className={LABEL}>Дата</span>
            <input type="date" className={`${FIELD} mt-1`} value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>Сумма, ₽</span>
            <input
              className={`${FIELD} mt-1`}
              inputMode="decimal"
              placeholder="1200.50"
              value={amountRub}
              data-testid="ledger-amount"
              onChange={(event) => setAmountRub(event.target.value)}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL}>Категория</span>
            <select className={`${FIELD} mt-1`} value={categoryKey} onChange={(event) => setCategoryKey(event.target.value)}>
              {categories.map((category) => (
                <option key={category.key} value={category.key}>{category.label}</option>
              ))}
            </select>
          </label>
        </div>

        {selectedCategory && (
          <p className="text-[11px] leading-relaxed text-[var(--soft-ink-faint)]">{selectedCategory.hint}</p>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className={LABEL}>Контрагент</span>
            <input className={`${FIELD} mt-1`} value={counterparty} placeholder="ООО «Ромашка»" onChange={(event) => setCounterparty(event.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>Документ</span>
            <input className={`${FIELD} mt-1`} value={documentRef} placeholder="счёт №14 от 12.07" onChange={(event) => setDocumentRef(event.target.value)} />
          </label>
          <label className="block">
            <span className={LABEL}>Комментарий</span>
            <input className={`${FIELD} mt-1`} value={note} onChange={(event) => setNote(event.target.value)} />
          </label>
        </div>

        {/* Признак только у прихода: на УСН «Доходы» расход базу не трогает
            вовсе, и предлагать по нему выбор — вводить в заблуждение. */}
        {direction === "income" && (
          <label className="flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
            <input type="checkbox" checked={taxable} data-testid="ledger-taxable" onChange={(event) => setTaxable(event.target.checked)} />
            Входит в базу УСН (снимите, если это перевод себе, возврат поставщика или ошибочный платёж)
          </label>
        )}

        <div>
          <button type="button" className="soft-button soft-button-primary px-4 py-2 text-sm" disabled={busy} data-testid="ledger-submit" onClick={() => void submit()}>
            Добавить строку
          </button>
        </div>
      </div>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-[0.04em] text-[var(--soft-ink-faint)]">
              <th className="py-1.5 pr-3">Дата</th>
              <th className="py-1.5 pr-3">Категория</th>
              <th className="py-1.5 pr-3">Контрагент</th>
              <th className="py-1.5 pr-3">Документ</th>
              <th className="py-1.5 pr-3 text-right">Сумма</th>
              <th className="py-1.5 pr-3">В базе</th>
              <th className="py-1.5" />
            </tr>
          </thead>
          <tbody>
            {entries === null && (
              <tr><td colSpan={7} className="py-3 text-[var(--soft-ink-faint)]">Загружаем…</td></tr>
            )}
            {entries?.length === 0 && (
              <tr><td colSpan={7} className="py-3 text-[var(--soft-ink-faint)]">За {year} год строк нет.</td></tr>
            )}
            {entries?.map((entry) => (
              <tr key={entry.id} className="border-t border-[var(--soft-paper-edge)]" data-testid="ledger-row">
                <td className="py-1.5 pr-3 tabular-nums">{entry.occurredAt.slice(0, 10)}</td>
                <td className="py-1.5 pr-3">{categoryByKey(entry.categoryKey)?.label ?? entry.categoryKey}</td>
                <td className="py-1.5 pr-3">{entry.counterparty ?? "—"}</td>
                <td className="py-1.5 pr-3">{entry.documentRef ?? "—"}</td>
                <td className="py-1.5 pr-3 text-right tabular-nums" style={{ color: entry.direction === "expense" ? "#8E2F2F" : "#3F5A3F" }}>
                  {entry.direction === "expense" ? "−" : "+"}{rub(entry.amountKopecks)}
                </td>
                <td className="py-1.5 pr-3">{entry.direction === "income" ? (entry.taxable ? "да" : "нет") : "—"}</td>
                <td className="py-1.5 text-right">
                  <button type="button" className="soft-admin-action" data-variant="subtle" disabled={busy} onClick={() => void remove(entry.id)}>
                    Удалить
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
