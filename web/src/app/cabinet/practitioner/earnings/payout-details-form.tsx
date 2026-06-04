"use client";

import { useState } from "react";
import { toast } from "sonner";

interface PayoutDetailsInitial {
  type: string;
  accountNumber: string;
  bankName: string | null;
  legalName: string | null;
  inn: string | null;
  kpp: string | null;
  bik: string | null;
  corrAccount: string | null;
}

type PayoutType = "CARD" | "SBP" | "ENTITY";

const MASK = (account: string) =>
  account.length > 6 ? `${account.slice(0, 4)} •••• ${account.slice(-4)}` : account;

function savedSummary(saved: PayoutDetailsInitial): string {
  if (saved.type === "ENTITY") {
    return `${saved.legalName ?? "Юр. лицо"} · ИНН ${saved.inn ?? "—"} · сч. ${MASK(saved.accountNumber)}`;
  }
  return `${saved.type === "CARD" ? "Карта" : "СБП"} ${MASK(saved.accountNumber)}${saved.bankName ? ` · ${saved.bankName}` : ""}`;
}

export function PayoutDetailsForm({ initial }: { initial: PayoutDetailsInitial | null }) {
  const [type, setType] = useState<PayoutType>((initial?.type as PayoutType) ?? "CARD");
  const [account, setAccount] = useState("");
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [legalName, setLegalName] = useState(initial?.legalName ?? "");
  const [inn, setInn] = useState(initial?.inn ?? "");
  const [kpp, setKpp] = useState(initial?.kpp ?? "");
  const [bik, setBik] = useState(initial?.bik ?? "");
  const [corrAccount, setCorrAccount] = useState(initial?.corrAccount ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<PayoutDetailsInitial | null>(initial);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const payload =
        type === "ENTITY"
          ? { type, accountNumber: account, bankName, legalName, inn, kpp, bik, corrAccount }
          : { type, accountNumber: account, bankName };
      const res = await fetch("/api/practitioner/payout-details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Реквизиты сохранены");
        setSaved({
          type,
          accountNumber: account,
          bankName: bankName || null,
          legalName: type === "ENTITY" ? legalName || null : null,
          inn: type === "ENTITY" ? inn || null : null,
          kpp: type === "ENTITY" ? kpp || null : null,
          bik: type === "ENTITY" ? bik || null : null,
          corrAccount: type === "ENTITY" ? corrAccount || null : null,
        });
        setAccount("");
      } else {
        toast.error(data.error ?? "Не удалось сохранить");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    "h-10 w-full rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3 text-sm text-[var(--soft-ink-strong)] focus:outline-none focus:border-[var(--soft-bordeaux)]/50";
  const labelClass = "mb-1.5 block text-sm text-[var(--soft-ink-soft)]";

  const TABS: Array<{ key: PayoutType; label: string; hint: string }> = [
    { key: "CARD", label: "Карта", hint: "для самозанятых" },
    { key: "SBP", label: "СБП", hint: "по телефону" },
    { key: "ENTITY", label: "Юр. лицо / ИП", hint: "расчётный счёт" },
  ];

  return (
    <form onSubmit={handleSave} className="soft-card" data-testid="practitioner-payout-details">
      <div className="space-y-4 p-5">
        <div>
          <p className="soft-eyebrow">реквизиты для выплат</p>
          <h2 className="soft-h3 mt-1">Куда переводить заработок</h2>
          {saved && (
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">Текущие: {savedSummary(saved)}</p>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                type === t.key
                  ? "border-[var(--soft-bordeaux)]/45 soft-select-pill font-medium"
                  : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-bordeaux)]/40"
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-xs text-[var(--soft-ink-faint)]">{t.hint}</span>
            </button>
          ))}
        </div>

        {type !== "ENTITY" ? (
          <>
            <div>
              <label className={labelClass}>{type === "CARD" ? "Номер карты" : "Номер телефона (СБП)"}</label>
              <input
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                inputMode={type === "CARD" ? "numeric" : "tel"}
                placeholder={type === "CARD" ? "0000 0000 0000 0000" : "+7 900 000-00-00"}
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div>
              <label className={labelClass}>Банк (необязательно)</label>
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Например, Т-Банк" className={inputClass} />
            </div>
          </>
        ) : (
          <>
            <div>
              <label className={labelClass}>Наименование организации или ИП</label>
              <input
                value={legalName}
                onChange={(e) => setLegalName(e.target.value)}
                placeholder="ООО «Ромашка» / ИП Иванов И. И."
                className={inputClass}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>ИНН</label>
                <input value={inn} onChange={(e) => setInn(e.target.value)} inputMode="numeric" placeholder="10 или 12 цифр" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>КПП (для ООО)</label>
                <input value={kpp} onChange={(e) => setKpp(e.target.value)} inputMode="numeric" placeholder="9 цифр · ИП — пусто" className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Расчётный счёт</label>
              <input value={account} onChange={(e) => setAccount(e.target.value)} inputMode="numeric" placeholder="20 цифр" className={inputClass} autoComplete="off" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={labelClass}>БИК банка</label>
                <input value={bik} onChange={(e) => setBik(e.target.value)} inputMode="numeric" placeholder="9 цифр" className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Корр. счёт (необязательно)</label>
                <input value={corrAccount} onChange={(e) => setCorrAccount(e.target.value)} inputMode="numeric" placeholder="20 цифр" className={inputClass} />
              </div>
            </div>
            <div>
              <label className={labelClass}>Название банка (необязательно)</label>
              <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Например, Сбербанк" className={inputClass} />
            </div>
          </>
        )}

        <p className="text-xs text-[var(--soft-ink-faint)]">
          Реквизиты видны только вам и администратору для выплат. Номер карты или счёта не используется для списаний.
        </p>

        <button
          type="submit"
          disabled={saving}
          className="soft-button soft-button-primary"
          style={{ minHeight: "2.25rem", padding: "0.5rem 1.1rem", fontSize: "0.875rem" }}
        >
          {saving ? "Сохранение…" : saved ? "Обновить реквизиты" : "Сохранить реквизиты"}
        </button>
      </div>
    </form>
  );
}
