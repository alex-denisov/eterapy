"use client";

import { useState } from "react";
import { BadgeCheck, Check, Loader2, Shield, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import {
  expectedInnLength,
  TAX_STATUS_LABELS,
  validateInn,
  type TaxStatusKey,
} from "@/lib/practitioner-tax-verification";

// B483 — форма статуса + ИНН. Двухшаговая механика: «Проверить и подтвердить»
// → серверный lookup (ФНС) → лист «Это действительно Вы?» с ФИО/статусом/ИНН →
// явное «Да, это я — подтвердить» сохраняет статус как проверенный.

const STATUSES: TaxStatusKey[] = ["SELF_EMPLOYED", "INDIVIDUAL_ENTREPRENEUR", "LEGAL_ENTITY"];

interface Identity {
  displayName: string;
  statusLabel: string;
  inn: string;
}

export function TaxStatusForm({
  initialStatus,
  initialInn,
  verified,
  verifiedAtIso,
  variant = "desktop",
}: {
  initialStatus: TaxStatusKey;
  initialInn: string;
  verified: boolean;
  verifiedAtIso: string | null;
  variant?: "desktop" | "pcab";
}) {
  const [status, setStatus] = useState<TaxStatusKey>(initialStatus);
  const [inn, setInn] = useState(initialInn);
  const [busy, setBusy] = useState(false);
  const [identity, setIdentity] = useState<Identity | null>(null);
  const [confirmed, setConfirmed] = useState(verified);

  const expected = expectedInnLength(status);
  const localCheck = validateInn(inn, status);

  async function post(step: "lookup" | "confirm") {
    const res = await fetch("/api/practitioner/tax-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ step, status, inn }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(typeof data?.error === "string" ? data.error : "Не удалось выполнить проверку");
    return data;
  }

  async function lookup() {
    if (!localCheck.ok) {
      toast.error(localCheck.error ?? "Проверьте ИНН");
      return;
    }
    setBusy(true);
    try {
      const data = await post("lookup");
      setIdentity(data.identity);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось выполнить проверку");
    } finally {
      setBusy(false);
    }
  }

  async function confirm() {
    setBusy(true);
    try {
      await post("confirm");
      setConfirmed(true);
      setIdentity(null);
      toast.success("Налоговый статус подтверждён");
      window.location.href = "/cabinet/practitioner/finance?tab=requisites";
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось подтвердить статус");
      setBusy(false);
    }
  }

  // ── МОБАЙЛ (mockup practitioner-finance-tax-status/-confirm) ──────────
  // Те же обработчики lookup/confirm, что и десктоп; отличается только разметка.
  if (variant === "pcab") {
    return (
      <div data-testid="practitioner-tax-status-form-mobile">
        {confirmed && !identity ? (
          <div className="pcab-summary" style={{ marginTop: 14 }} data-testid="practitioner-tax-status-verified-mobile">
            <span className="pcab-summary-ic">
              <BadgeCheck size={20} aria-hidden="true" />
            </span>
            <span className="pcab-summary-main">
              <span className="pcab-summary-t">{TAX_STATUS_LABELS[initialStatus]} · подтверждён</span>
              <span className="pcab-summary-s">ИНН {initialInn} · проверен автоматически (ФНС)</span>
            </span>
            <button type="button" className="pcab-cpick-change" onClick={() => setConfirmed(false)}>
              Изменить
            </button>
          </div>
        ) : (
          <>
            <div className="pcab-flabel">Ваш статус</div>
            <div className="pcab-seg2" style={{ gridTemplateColumns: "repeat(3, 1fr)" }} data-testid="tax-status-seg-mobile">
              {STATUSES.map((key) => (
                <button
                  key={key}
                  type="button"
                  className={`pcab-seg-item${status === key ? " is-active" : ""}`}
                  onClick={() => { setStatus(key); setIdentity(null); }}
                  aria-pressed={status === key}
                >
                  {key === "SELF_EMPLOYED" ? "Самозанятый" : key === "INDIVIDUAL_ENTREPRENEUR" ? "ИП" : "Юр. лицо"}
                </button>
              ))}
            </div>

            <div className="pcab-flabel">
              ИНН <span style={{ color: "var(--pc-terracotta-dark)" }}>*</span>
            </div>
            <label className="pcab-fieldinput" style={{ cursor: "text" }}>
              <input
                value={inn}
                onChange={(e) => { setInn(e.target.value.replace(/[^\d\s]/g, "")); setIdentity(null); }}
                inputMode="numeric"
                maxLength={expected + 3}
                placeholder={expected === 12 ? "12 цифр" : "10 цифр"}
                style={{ letterSpacing: "0.06em", fontSize: 17 }}
                aria-label="ИНН"
                data-testid="practitioner-tax-inn-input-mobile"
              />
            </label>
            <p className="pcab-fhint">Обязательно. 12 цифр — для самозанятого и ИП, 10 — для юр. лица. Только цифры.</p>

            <button
              type="button"
              className="pcab-btn block pcab-btn-primary"
              style={{ marginTop: 18 }}
              disabled={busy || inn.replace(/\s+/g, "").length !== expected}
              onClick={lookup}
              data-testid="practitioner-tax-verify-mobile"
            >
              {busy && !identity ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <ShieldCheck size={16} aria-hidden="true" />}
              Проверить и подтвердить
            </button>
            <div className="pcab-fnsnote">
              <Shield size={15} aria-hidden="true" />
              Проверка автоматическая через ФНС. Статус станет «подтверждён» только после вашего подтверждения ниже.
            </div>
          </>
        )}

        {/* Лист «Это действительно Вы?» */}
        {identity && (
          <div className="pcab-sheet-wrap" data-testid="practitioner-tax-confirm-mobile">
            <button type="button" className="pcab-sheet-scrim" aria-label="Закрыть" onClick={() => setIdentity(null)} />
            <div className="pcab-sheet" role="dialog" aria-modal="true" aria-label="Подтверждение личности">
              <div className="pcab-grabber" aria-hidden="true" />
              <div className="pcab-sheet-title" style={{ textAlign: "center" }}>Это действительно Вы?</div>
              <div className="pcab-sheet-sub" style={{ textAlign: "center" }}>По данным ФНС этот ИНН оформлен на:</div>
              <div className="pcab-idcard">
                <div className="pcab-idrow">
                  <span className="pcab-idk">{status === "LEGAL_ENTITY" ? "Наименование" : "ФИО"}</span>
                  <span className="pcab-idv">{identity.displayName}</span>
                </div>
                <div className="pcab-idrow">
                  <span className="pcab-idk">Статус</span>
                  <span className="pcab-idv">
                    {identity.statusLabel}
                    <span className="pcab-idbadge">активен</span>
                  </span>
                </div>
                <div className="pcab-idrow">
                  <span className="pcab-idk">ИНН</span>
                  <span className="pcab-idv" style={{ fontVariantNumeric: "tabular-nums" }}>{identity.inn}</span>
                </div>
              </div>
              <button
                type="button"
                className="pcab-sheet-save"
                style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
                disabled={busy}
                onClick={confirm}
                data-testid="practitioner-tax-confirm-yes-mobile"
              >
                {busy ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : <Check size={16} strokeWidth={2.2} aria-hidden="true" />}
                Да, это я — подтвердить
              </button>
              <button type="button" className="pcab-sheet-cancel" disabled={busy} onClick={() => setIdentity(null)}>
                Это не я
              </button>
              <div className="pcab-sheet-hint">
                Подтверждая, вы соглашаетесь, что статус и ИНН верны. Только после этого реквизиты сохраняются как проверенные.
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (confirmed && !identity) {
    return (
      <section className="soft-card mt-5 p-4 sm:p-5" data-testid="practitioner-tax-status-verified">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }}>
            <BadgeCheck className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">{TAX_STATUS_LABELS[initialStatus]} · подтверждён</p>
            {/* Owner: полный ИНН, без маскирования. */}
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
              ИНН {initialInn} · проверен автоматически (ФНС)
              {verifiedAtIso
                ? ` · ${new Date(verifiedAtIso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}`
                : ""}
            </p>
            <button type="button" className="soft-chip mt-3" onClick={() => setConfirmed(false)}>
              Изменить статус или ИНН
            </button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="practitioner-tax-status-form">
      <section className="soft-card p-4 sm:p-5">
        <p className="text-xs font-semibold text-[var(--soft-bordeaux)]">Ваш статус</p>
        <div className="mt-2 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1">
          {STATUSES.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => { setStatus(key); setIdentity(null); }}
              className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                status === key ? "soft-select-pill" : "text-[var(--soft-ink-soft)] hover:text-foreground"
              }`}
            >
              {key === "SELF_EMPLOYED" ? "Самозанятый" : TAX_STATUS_LABELS[key]}
            </button>
          ))}
        </div>

        <label className="mt-4 block text-xs font-semibold text-[var(--soft-bordeaux)]" htmlFor="tax-inn">
          ИНН <span className="text-[var(--soft-terracotta-dark)]">*</span>
        </label>
        <input
          id="tax-inn"
          value={inn}
          onChange={(e) => { setInn(e.target.value.replace(/[^\d\s]/g, "")); setIdentity(null); }}
          inputMode="numeric"
          maxLength={expected + 3}
          placeholder={expected === 12 ? "12 цифр" : "10 цифр"}
          className="soft-input mt-1 h-11 w-full text-base tracking-wide"
          data-testid="practitioner-tax-inn-input"
        />
        <p className="mt-1.5 text-xs text-[var(--soft-ink-faint)]">
          Обязательно. 12 цифр — для самозанятого и ИП, 10 — для юр. лица. Только цифры.
        </p>

        <button
          type="button"
          className="soft-button soft-button-primary mt-4 w-full justify-center sm:w-auto"
          disabled={busy || inn.replace(/\s+/g, "").length !== expected}
          onClick={lookup}
          data-testid="practitioner-tax-verify"
        >
          {busy && !identity ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="size-4" aria-hidden="true" />}
          Проверить и подтвердить
        </button>
        <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
          Проверка автоматическая через ФНС. Статус станет «подтверждён» только после вашего подтверждения ниже.
        </p>
      </section>

      {/* «Это действительно Вы?» */}
      {identity && (
        <section
          className="rounded-[18px] border-2 p-4 sm:p-5"
          style={{ borderColor: "var(--soft-terracotta)", background: "var(--soft-paper-card)" }}
          data-testid="practitioner-tax-confirm"
        >
          <p className="text-[15px] font-semibold">Это действительно Вы?</p>
          <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">По данным ФНС этот ИНН оформлен на:</p>
          <dl className="mt-3 divide-y divide-[var(--soft-paper-deep)] rounded-[12px] border border-[var(--soft-paper-edge)]">
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <dt className="text-[var(--soft-ink-faint)]">{status === "LEGAL_ENTITY" ? "Наименование" : "ФИО"}</dt>
              <dd className="font-medium">{identity.displayName}</dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <dt className="text-[var(--soft-ink-faint)]">Статус</dt>
              <dd className="font-medium">{identity.statusLabel} · активен</dd>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
              <dt className="text-[var(--soft-ink-faint)]">ИНН</dt>
              <dd className="font-medium tabular-nums">{identity.inn}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="soft-button soft-button-primary"
              disabled={busy}
              onClick={confirm}
              data-testid="practitioner-tax-confirm-yes"
            >
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : null}
              Да, это я — подтвердить
            </button>
            <button type="button" className="soft-button soft-button-ghost" disabled={busy} onClick={() => setIdentity(null)}>
              Это не я
            </button>
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
            Подтверждая, вы соглашаетесь, что статус и ИНН верны. Только после этого реквизиты сохраняются как
            проверенные.
          </p>
        </section>
      )}
    </div>
  );
}
