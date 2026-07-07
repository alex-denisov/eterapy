"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
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

      {/* Top-up packs */}
      <section data-testid="practitioner-ai-topup">
        <p className="soft-eyebrow mb-2.5">Докупить разборы</p>
        <div className="grid grid-cols-3 gap-2.5">
          {packs.map((pack) => (
            <button
              key={pack.units}
              type="button"
              className="soft-card flex flex-col items-center gap-1 p-3.5 text-center transition-shadow hover:shadow-[0_10px_24px_rgba(60,40,25,.07)] disabled:opacity-60"
              disabled={busy !== null}
              onClick={() => buyPack(pack.units)}
            >
              {busy === `pack:${pack.units}` ? (
                <Loader2 className="size-4 animate-spin text-[var(--soft-bordeaux)]" aria-hidden="true" />
              ) : (
                <Sparkles className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              )}
              <span className="font-heading text-lg font-semibold text-[var(--soft-bordeaux)]">+{pack.units}</span>
              <span className="text-xs text-[var(--soft-ink-faint)]">{pack.priceRub.toLocaleString("ru")} ₽</span>
            </button>
          ))}
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
    </div>
  );
}
