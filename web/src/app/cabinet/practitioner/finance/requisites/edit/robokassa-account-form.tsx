"use client";

import { useState } from "react";
import { Loader2, Save, Wallet } from "lucide-react";
import { toast } from "sonner";
import { normalizeRobokassaAccount } from "@/lib/payments/robokassa-split";

/**
 * B583 — аккаунт Robokassa специалиста.
 *
 * Отдельная форма, а не поле в форме реквизитов: это не «ещё один способ
 * выплаты» в ряду карта/СБП/счёт, а адресат сплита. Robokassa переводит долю
 * специалиста ТОЛЬКО на аккаунт Robokassa, поэтому выбирать не из чего, и
 * указать аккаунт нужно уметь, не переоформляя банковские реквизиты заново.
 */
export function RobokassaAccountForm({
  initialAccount,
  variant = "desktop",
}: {
  initialAccount: string | null;
  variant?: "desktop" | "pcab";
}) {
  const [account, setAccount] = useState(initialAccount ?? "");
  const [saving, setSaving] = useState(false);
  const pcab = variant === "pcab";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = account.trim();
    if (trimmed && !normalizeRobokassaAccount(trimmed)) {
      toast.error("Идентификатор: 3–64 символа, латиница, цифры, точка, дефис или подчёркивание");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/practitioner/payout-details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "robokassa_account", robokassaAccount: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.error) throw new Error(data?.error ?? "Не удалось сохранить");
      toast.success(trimmed ? "Аккаунт Robokassa сохранён" : "Аккаунт Robokassa отвязан");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} data-testid="practitioner-robokassa-account-form" className={pcab ? undefined : "mt-8 border-t border-[var(--soft-paper-edge)] pt-6"}>
      <p className={pcab ? "pcab-eyebrow" : "soft-eyebrow"} style={pcab ? { marginTop: 22 } : undefined}>
        Аккаунт Robokassa
      </p>
      <p className={`mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)] ${pcab ? "" : ""}`}>
        Ваша доля переводится на аккаунт Robokassa — другого адресата платёжная система
        не поддерживает. Деньги приходят после того, как снимется холд с оплаты клиента:
        отдельного дня выплат ждать не нужно.
      </p>
      <label className="mt-3 block">
        <span className="text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">
          Идентификатор аккаунта
        </span>
        <input
          className={pcab
            ? "pcab-input"
            : "mt-1 h-10 w-full rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3 text-sm"}
          value={account}
          placeholder="например, eterapy-ivanova"
          autoComplete="off"
          inputMode="text"
          onChange={(event) => setAccount(event.target.value)}
          data-testid="practitioner-robokassa-account-input"
        />
      </label>
      <p className="mt-1.5 text-xs text-[var(--soft-ink-faint)]">
        Пока аккаунт не указан, выплата проводится вручную и занимает больше времени.
        Пустое поле отвязывает аккаунт.
      </p>
      <button
        type="submit"
        className={pcab ? "pcab-btn block pcab-btn-primary" : "soft-button soft-button-primary mt-3 w-full justify-center sm:w-fit"}
        style={pcab ? { marginTop: 14 } : undefined}
        disabled={saving}
        data-testid="practitioner-robokassa-account-save"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : pcab ? <Wallet className="h-4 w-4" /> : <Save className="h-4 w-4" />}
        Сохранить аккаунт
      </button>
    </form>
  );
}
