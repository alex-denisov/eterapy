"use client";

import { useState } from "react";
import { toast } from "sonner";

interface PayoutDetailsInitial {
  type: string;
  accountNumber: string;
  bankName: string | null;
}

const MASK = (account: string) =>
  account.length > 6 ? `${account.slice(0, 4)} •••• ${account.slice(-4)}` : account;

export function PayoutDetailsForm({ initial }: { initial: PayoutDetailsInitial | null }) {
  const [type, setType] = useState<"CARD" | "SBP">((initial?.type as "CARD" | "SBP") ?? "CARD");
  const [account, setAccount] = useState("");
  const [bankName, setBankName] = useState(initial?.bankName ?? "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<PayoutDetailsInitial | null>(initial);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/practitioner/payout-details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, accountNumber: account, bankName }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Реквизиты сохранены");
        setSaved({ type, accountNumber: account, bankName: bankName || null });
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

  return (
    <form onSubmit={handleSave} className="soft-card" data-testid="practitioner-payout-details">
      <div className="p-5 space-y-4">
        <div>
          <p className="soft-eyebrow">реквизиты для выплат</p>
          <h2 className="soft-h3 mt-1">Куда переводить заработок</h2>
          {saved && (
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
              Текущие: {saved.type === "CARD" ? "Карта" : "СБП"} {MASK(saved.accountNumber)}
              {saved.bankName ? ` · ${saved.bankName}` : ""}
            </p>
          )}
        </div>

        <div className="flex gap-2">
          {(["CARD", "SBP"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                type === t
                  ? "border-[var(--soft-bordeaux)]/45 soft-select-pill font-medium"
                  : "border-border/30 text-[var(--soft-ink-soft)] hover:border-border/60"
              }`}
            >
              {t === "CARD" ? "Карта" : "СБП (по телефону)"}
            </button>
          ))}
        </div>

        <div>
          <label className="mb-1.5 block text-sm text-[var(--soft-ink-soft)]">
            {type === "CARD" ? "Номер карты" : "Номер телефона (СБП)"}
          </label>
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
          <label className="mb-1.5 block text-sm text-[var(--soft-ink-soft)]">Банк (необязательно)</label>
          <input
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="Например, Т-Банк"
            className={inputClass}
          />
        </div>

        <p className="text-xs text-[var(--soft-ink-faint)]">
          Реквизиты видны только вам и администратору для выплат. Номер карты не используется для списаний.
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
