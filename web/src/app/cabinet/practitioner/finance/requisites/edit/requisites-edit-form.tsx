"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { TaxStatusKey } from "@/lib/practitioner-tax-verification";

// B466 — реквизиты выплат БЕЗ поля ИНН (owner: ИНН живёт на «Налоговый
// статус»). Самозанятый → Карта или СБП; ИП/юр. лицо → расчётный счёт.
// PATCH /api/practitioner/payout-details берёт ИНН из подтверждённого статуса.

interface Initial {
  type: string;
  accountNumber: string;
  bankName: string | null;
  legalName: string | null;
  kpp: string | null;
  bik: string | null;
  corrAccount: string | null;
}

export function RequisitesEditForm({
  taxStatus,
  recipientName,
  initial,
}: {
  taxStatus: TaxStatusKey;
  recipientName: string;
  initial: Initial | null;
}) {
  const isEntity = taxStatus !== "SELF_EMPLOYED";
  const [method, setMethod] = useState<"CARD" | "SBP" | "ENTITY">(
    isEntity ? "ENTITY" : initial?.type === "SBP" ? "SBP" : "CARD",
  );
  const [account, setAccount] = useState("");
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [legalName, setLegalName] = useState(initial?.legalName ?? "");
  const [kpp, setKpp] = useState(initial?.kpp ?? "");
  const [bik, setBik] = useState(initial?.bik ?? "");
  const [corrAccount, setCorrAccount] = useState(initial?.corrAccount ?? "");
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = method === "ENTITY"
        ? { type: method, accountNumber: account, bankName, legalName, kpp, bik, corrAccount }
        : { type: method, accountNumber: account, bankName };
      const res = await fetch("/api/practitioner/payout-details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось сохранить реквизиты");
      toast.success("Реквизиты сохранены и отправлены на проверку");
      window.location.href = "/cabinet/practitioner/finance?tab=requisites";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить реквизиты");
      setSaving(false);
    }
  }

  const saved = initial
    ? initial.type === "ENTITY"
      ? `сейчас: счёт ${initial.legalName ?? "юр. лица"} ·· ${initial.accountNumber.slice(-4)}`
      : `сейчас: ${initial.type === "CARD" ? "карта" : "СБП"} ·· ${initial.accountNumber.slice(-4)}`
    : null;

  return (
    <form onSubmit={save} className="mt-5 flex flex-col gap-4" data-testid="practitioner-requisites-edit-form">
      {/* Method switcher — bound by tax status */}
      {!isEntity ? (
        <div className="flex w-fit gap-1 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1">
          {(["CARD", "SBP"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setMethod(key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                method === key ? "soft-select-pill" : "text-[var(--soft-ink-soft)] hover:text-foreground"
              }`}
            >
              {key === "CARD" ? "Карта (самозанятый)" : "СБП"}
            </button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[var(--soft-ink-soft)]">
          Для ИП и юр. лиц выплаты идут на <span className="font-medium text-foreground">расчётный счёт</span>.
        </p>
      )}

      <section className="soft-card p-4 sm:p-5">
        {method !== "ENTITY" ? (
          <>
            <label className="block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="req-account">
              {method === "CARD" ? "Номер карты" : "Телефон для СБП"}
            </label>
            <input
              id="req-account"
              value={account}
              onChange={(e) => setAccount(e.target.value)}
              inputMode={method === "CARD" ? "numeric" : "tel"}
              placeholder={saved ?? (method === "CARD" ? "2200 0000 0000 0000" : "+7 900 000-00-00")}
              className="soft-input mt-1 h-11 w-full text-base tracking-wide"
            />
            <label className="mt-4 block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="req-bank">
              Банк (необязательно)
            </label>
            <input
              id="req-bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Т-Банк"
              className="soft-input mt-1 h-11 w-full text-base"
            />
            <p className="mt-3 text-xs text-[var(--soft-ink-faint)]">
              Получатель: <span className="font-medium text-[var(--soft-ink-soft)]">{recipientName || "как в профиле"}</span>.
              ФИО должно совпадать с вашим подтверждённым налоговым статусом.
            </p>
          </>
        ) : (
          <>
            <label className="block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="req-legal">
              Юр. название / ИП
            </label>
            <input id="req-legal" value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="ИП Петрова Анна Сергеевна" className="soft-input mt-1 h-11 w-full text-base" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="req-acc">Расчётный счёт</label>
                <input id="req-acc" value={account} onChange={(e) => setAccount(e.target.value)} inputMode="numeric" placeholder={saved ?? "20 цифр"} className="soft-input mt-1 h-11 w-full text-base" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="req-bik">БИК</label>
                <input id="req-bik" value={bik} onChange={(e) => setBik(e.target.value)} inputMode="numeric" placeholder="9 цифр" className="soft-input mt-1 h-11 w-full text-base" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="req-kpp">КПП (для ООО)</label>
                <input id="req-kpp" value={kpp} onChange={(e) => setKpp(e.target.value)} inputMode="numeric" placeholder="9 цифр или пусто" className="soft-input mt-1 h-11 w-full text-base" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="req-corr">Корр. счёт</label>
                <input id="req-corr" value={corrAccount} onChange={(e) => setCorrAccount(e.target.value)} inputMode="numeric" placeholder="20 цифр" className="soft-input mt-1 h-11 w-full text-base" />
              </div>
            </div>
            <label className="mt-4 block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="req-bank2">Банк</label>
            <input id="req-bank2" value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Название банка" className="soft-input mt-1 h-11 w-full text-base" />
          </>
        )}
      </section>

      <button type="submit" className="soft-button soft-button-primary w-full justify-center sm:w-fit" disabled={saving} data-testid="practitioner-requisites-save">
        {saving ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
        Сохранить реквизиты
      </button>
      <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        Новые реквизиты проходят проверку. До её завершения выплаты идут на текущий подтверждённый способ.
      </p>
    </form>
  );
}
