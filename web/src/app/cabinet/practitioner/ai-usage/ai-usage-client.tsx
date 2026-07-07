"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PractitionerTier } from "@/lib/practitioner-tier";

// B434 — клиентская часть «Разборы и AI»: квота, глобальный/per-session
// тумблеры, докупка пакетов с баланса, авто-докупка.

interface Props {
  quota: {
    included: number;
    used: number;
    remaining: number;
    topupBalance: number;
    resetLabel: string;
    tier: PractitionerTier;
  };
  aiAutoAnalyze: boolean;
  aiAutoTopup: boolean;
  packs: Array<{ units: number; priceRub: number }>;
  upcoming: Array<{ id: string; clientLabel: string; startAtIso: string | null; aiAnalysisEnabled: boolean | null }>;
}

const WHEN_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});

export function AiUsageClient({ quota, aiAutoAnalyze, aiAutoTopup, packs, upcoming }: Props) {
  const [autoAnalyze, setAutoAnalyze] = useState(aiAutoAnalyze);
  const [autoTopup, setAutoTopup] = useState(aiAutoTopup);
  const [sessions, setSessions] = useState(upcoming);
  const [busy, setBusy] = useState<string | null>(null);
  // B466 round-8 #6: confirm before charging the balance (guards accidental taps).
  const [confirmUnits, setConfirmUnits] = useState<number | null>(null);
  const confirmPack = confirmUnits === null ? null : packs.find((p) => p.units === confirmUnits) ?? null;

  const pct = quota.included > 0 ? Math.min(100, Math.round((quota.used / quota.included) * 100)) : 0;

  async function patchSettings(body: Record<string, unknown>, revert: () => void) {
    try {
      const res = await fetch("/api/practitioner/ai-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
    } catch {
      toast.error("Не удалось сохранить настройку");
      revert();
    }
  }

  function toggleGlobal(next: boolean) {
    setAutoAnalyze(next);
    void patchSettings({ aiAutoAnalyze: next }, () => setAutoAnalyze(!next));
  }

  function toggleSession(id: string, next: boolean) {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, aiAnalysisEnabled: next } : s)));
    void patchSettings({ bookingId: id, enabled: next }, () =>
      setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, aiAnalysisEnabled: !next } : s))),
    );
  }

  function toggleAutoTopup(next: boolean) {
    setAutoTopup(next);
    void patchSettings({ aiAutoTopup: next }, () => setAutoTopup(!next));
  }

  async function buyPack(units: number) {
    setBusy(`pack:${units}`);
    try {
      const res = await fetch("/api/practitioner/ai-topup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ units }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          data?.error === "INSUFFICIENT_EARNINGS" || data?.code === "INSUFFICIENT_EARNINGS"
            ? "Недостаточно средств на балансе практика"
            : typeof data?.error === "string" ? data.error : "Не удалось купить пакет",
        );
      }
      toast.success(`Пакет +${units} разборов добавлен`);
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось купить пакет");
      setBusy(null);
    }
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      {/* Quota */}
      <section className="soft-card p-4 sm:p-5" data-testid="practitioner-ai-usage-quota">
        <div className="flex items-baseline gap-2">
          <span className="font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">{quota.used}</span>
          <span className="text-sm text-[var(--soft-ink-soft)]">из {quota.included} разборов в этом месяце</span>
        </div>
        <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[var(--soft-paper-deep)]">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: "var(--soft-bordeaux)" }} />
        </div>
        <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
          Осталось {quota.remaining}
          {quota.topupBalance > 0 ? ` (из них докуплено ${quota.topupBalance})` : ""} · квота обновится {quota.resetLabel}
        </p>
        {quota.included === 0 && (
          <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
            AI-разборы входят в тарифы Pro (20/мес) и Pro+ (50/мес) — подключить можно в «Финансы → Тариф».
          </p>
        )}
      </section>

      {/* Global toggle */}
      <section className="soft-card flex items-center justify-between gap-3 p-4" data-testid="practitioner-ai-auto-toggle">
        <div className="min-w-0">
          <p className="text-sm font-medium">Делать разбор автоматически</p>
          <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
            После каждой сессии — резюме, заметки и черновик сообщения (тратит 1 разбор)
          </p>
        </div>
        <ToggleSwitch enabled={autoAnalyze} onToggle={() => toggleGlobal(!autoAnalyze)} label="Делать разбор автоматически" />
      </section>

      {/* Per-session toggles */}
      <section data-testid="practitioner-ai-session-toggles">
        <p className="soft-eyebrow mb-2.5">Разбор на ближайших сессиях</p>
        <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
          {sessions.length === 0 ? (
            <p className="px-4 py-4 text-sm text-[var(--soft-ink-faint)]">Подтверждённых сессий впереди нет.</p>
          ) : (
            sessions.map((s) => {
              const effective = s.aiAnalysisEnabled ?? autoAnalyze;
              return (
                <div key={s.id} className="flex items-center gap-3 px-3.5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{s.clientLabel}</p>
                    <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
                      {s.startAtIso ? WHEN_FMT.format(new Date(s.startAtIso)) : "время уточняется"}
                      {effective ? " · тратит 1 разбор" : " · без разбора"}
                    </p>
                  </div>
                  <ToggleSwitch
                    enabled={effective}
                    onToggle={() => toggleSession(s.id, !effective)}
                    label={`AI-разбор сессии с ${s.clientLabel}`}
                  />
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* Top-up packs — B466 round-8 #5: explicit BUY CTAs (price rendered as a
          filled action button); best pack carries the «выгодно» badge (mockup). */}
      <section data-testid="practitioner-ai-topup">
        <p className="soft-eyebrow mb-2.5">Докупить разборы</p>
        <div className="grid grid-cols-3 gap-2.5">
          {packs.map((pack, i) => {
            const best = i === packs.length - 1;
            return (
              <button
                key={pack.units}
                type="button"
                data-testid={`practitioner-ai-pack-${pack.units}`}
                className={`relative flex flex-col items-center gap-2 rounded-[14px] border p-3.5 pt-4 text-center transition-all disabled:opacity-60 ${
                  best
                    ? "border-[var(--soft-terracotta)] bg-[color-mix(in_srgb,var(--soft-terracotta)_9%,var(--soft-paper-card))]"
                    : "border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] hover:border-[var(--soft-terracotta)]"
                }`}
                disabled={busy !== null}
                onClick={() => setConfirmUnits(pack.units)}
              >
                {best && (
                  <span
                    className="absolute -top-2 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-2 py-px text-[9px] font-bold text-[#FBF1E4]"
                    style={{ background: "var(--soft-terracotta)" }}
                  >
                    выгодно
                  </span>
                )}
                <span className="font-heading text-xl font-semibold leading-none text-[var(--soft-bordeaux)]">+{pack.units}</span>
                <span className="text-[10.5px] leading-none text-[var(--soft-ink-faint)]">разборов</span>
                <span
                  className="mt-0.5 inline-flex w-full items-center justify-center gap-1 rounded-full px-2 py-1.5 text-[12px] font-semibold text-[#FBF1E4]"
                  style={{ background: best ? "var(--soft-terracotta)" : "var(--soft-bordeaux)" }}
                >
                  {busy === `pack:${pack.units}` ? (
                    <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    `${pack.priceRub.toLocaleString("ru")} ₽`
                  )}
                </span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
          Оплата с баланса практика. Докупленные разборы не сгорают в конце месяца.
        </p>
      </section>

      {/* Auto top-up */}
      <section className="soft-card flex items-center justify-between gap-3 p-4" data-testid="practitioner-ai-auto-topup">
        <div className="min-w-0">
          <p className="text-sm font-medium">Авто-докупка</p>
          <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
            При исчерпании квоты автоматически докупать пакет +{packs[0]?.units ?? 10} с баланса
          </p>
        </div>
        <ToggleSwitch enabled={autoTopup} onToggle={() => toggleAutoTopup(!autoTopup)} label="Авто-докупка" />
      </section>

      {/* Purchase confirmation — B466 round-8 #6. */}
      <Dialog open={confirmPack !== null} onOpenChange={(open) => { if (!open) setConfirmUnits(null); }}>
        <DialogContent className="max-w-sm" showCloseButton={false} data-testid="practitioner-ai-pack-confirm">
          <DialogHeader>
            <DialogTitle>Докупить {confirmPack ? `+${confirmPack.units}` : ""} разборов?</DialogTitle>
            <DialogDescription>
              С баланса практика спишется{" "}
              <span className="font-semibold text-[var(--soft-bordeaux)]">
                {confirmPack ? confirmPack.priceRub.toLocaleString("ru") : ""} ₽
              </span>
              . Докупленные разборы не сгорают в конце месяца.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setConfirmUnits(null)}
              className="soft-button soft-button-ghost"
              style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                const units = confirmUnits;
                setConfirmUnits(null);
                if (units !== null) void buyPack(units);
              }}
              className="soft-button soft-button-primary"
              style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
              data-testid="practitioner-ai-pack-confirm-buy"
            >
              Купить{confirmPack ? ` · ${confirmPack.priceRub.toLocaleString("ru")} ₽` : ""}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
