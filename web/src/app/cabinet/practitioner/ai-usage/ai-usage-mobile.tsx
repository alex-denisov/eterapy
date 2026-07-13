"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ChevronLeft, Loader2 } from "lucide-react";
import { practitionerTierName, type PractitionerTier } from "@/lib/practitioner-tier";

// B466 R9 P5 — мобильный экран «Разборы и AI» кокпита практика, 1-в-1 по approved
// mockup practitioner-ai-usage. pcab-native (НЕ обёртка десктопного AiUsageClient).
// Реюз ДАННЫХ и эндпоинтов: PATCH /api/practitioner/ai-settings (глобальный/
// per-session/авто-докупка), POST /api/practitioner/ai-topup (докупка пакета с
// подтверждением — round-8 #6). METERED-квота (B434): тарифы НЕ безлимитны.

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
  backHref?: string;
}

const WHEN_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Europe/Moscow",
});

function Toggle({ on, onClick, sm, label, testid }: { on: boolean; onClick: () => void; sm?: boolean; label: string; testid?: string }) {
  return (
    <button
      type="button"
      className={`${sm ? "pcab-toggle" : "pcab-toggle-lg"}${on ? "" : " off"}`}
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      data-testid={testid}
    >
      <span className="knob" />
    </button>
  );
}

export function AiUsageMobile({ quota, aiAutoAnalyze, aiAutoTopup, packs, upcoming, backHref = "/cabinet/practitioner/more" }: Props) {
  const [autoAnalyze, setAutoAnalyze] = useState(aiAutoAnalyze);
  const [autoTopup, setAutoTopup] = useState(aiAutoTopup);
  const [sessions, setSessions] = useState(upcoming);
  const [busy, setBusy] = useState<string | null>(null);
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
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-ai-usage-mobile">
      <div className="pcab-topbar">
        <Link href={backHref} className="pcab-roundbtn" aria-label="Назад">
          <ChevronLeft width={19} height={19} aria-hidden="true" />
        </Link>
        <span className="pcab-topbar-title">Разборы и AI</span>
        <span className="pcab-topbar-spacer" aria-hidden="true" />
      </div>

      {/* Квота */}
      <div className="pcab-quota" data-testid="practitioner-ai-usage-quota-mobile">
        <div className="pcab-quota-k">Разборов в этом месяце</div>
        <div className="pcab-quota-v">
          {quota.used} <small>из {quota.included} · тариф {practitionerTierName(quota.tier)}</small>
        </div>
        <div className="pcab-track"><div className="pcab-fill" style={{ width: `${pct}%` }} /></div>
        <div className="pcab-quota-foot">
          <span>Осталось <b>{quota.remaining} разборов</b>{quota.topupBalance > 0 ? ` (докуплено ${quota.topupBalance})` : ""}</span>
          <span>обновится <b>{quota.resetLabel}</b></span>
        </div>
      </div>
      {quota.included === 0 && (
        <div className="pcab-set-hint">AI-разборы входят в тарифы Pro (20/мес) и Pro+ (50/мес) — подключить в «Финансы → Тариф».</div>
      )}

      {/* Как расходовать */}
      <div className="pcab-eyebrow pcab-set-eyebrow">Как расходовать</div>
      <div className="pcab-defrow">
        <div className="pcab-defrow-main">
          <div className="pcab-defrow-t">Авто-разбор после каждой сессии</div>
          <div className="pcab-defrow-s">
            {autoAnalyze
              ? "Включено: каждая завершённая сессия тратит 1 разбор. Выключите, чтобы выбирать вручную."
              : "Выключено: выбирайте разбор вручную для каждой сессии ниже."}
          </div>
        </div>
        <Toggle on={autoAnalyze} onClick={() => toggleGlobal(!autoAnalyze)} label="Авто-разбор после каждой сессии" testid="practitioner-ai-auto-toggle-mobile" />
      </div>

      {/* Разбор по сессиям */}
      <div className="pcab-eyebrow pcab-set-eyebrow">Разбор по сессиям</div>
      <div className="pcab-list" data-testid="practitioner-ai-sessions-mobile">
        {sessions.length === 0 ? (
          <div className="pcab-aiu-empty">Подтверждённых сессий впереди нет.</div>
        ) : (
          sessions.map((s) => {
            const effective = s.aiAnalysisEnabled ?? autoAnalyze;
            return (
              <div key={s.id} className="pcab-aiu-ssn">
                <div className="pcab-aiu-ssn-main">
                  <div className="pcab-aiu-ssn-t">{s.clientLabel}</div>
                  <div className="pcab-aiu-ssn-s">
                    {s.startAtIso ? WHEN_FMT.format(new Date(s.startAtIso)) : "время уточняется"}
                    {effective ? " · тратит 1 разбор" : " · без разбора"}
                  </div>
                </div>
                <Toggle on={effective} onClick={() => toggleSession(s.id, !effective)} sm label={`AI-разбор сессии с ${s.clientLabel}`} testid={`practitioner-ai-ssn-${s.id}`} />
              </div>
            );
          })
        )}
      </div>

      {/* Докупить разборы */}
      <div className="pcab-eyebrow pcab-set-eyebrow">Докупить разборы</div>
      <div className="pcab-packs">
        {packs.map((pack, i) => {
          const best = i === packs.length - 1;
          return (
            <button
              key={pack.units}
              type="button"
              className={`pcab-pack${best ? " best" : ""}`}
              disabled={busy !== null}
              onClick={() => setConfirmUnits(pack.units)}
              data-testid={`practitioner-ai-pack-${pack.units}`}
            >
              {best && <span className="pcab-pack-badge">выгодно</span>}
              <span className="pcab-pack-n">+{pack.units}</span>
              <span className="pcab-pack-p">{pack.priceRub.toLocaleString("ru")} ₽</span>
            </button>
          );
        })}
      </div>
      {confirmPack && (
        <div className="pcab-aiu-confirm" data-testid="practitioner-ai-pack-confirm-mobile">
          <div className="pcab-aiu-confirm-t">
            Списать <b>{confirmPack.priceRub.toLocaleString("ru")} ₽</b> с баланса за <b>+{confirmPack.units}</b> разборов?
          </div>
          <div className="pcab-aiu-confirm-btns">
            <button type="button" className="pcab-abtn pcab-abtn-ghost" onClick={() => setConfirmUnits(null)}>Отмена</button>
            <button
              type="button"
              className="pcab-abtn pcab-abtn-primary"
              disabled={busy !== null}
              onClick={() => { const u = confirmUnits; setConfirmUnits(null); if (u !== null) void buyPack(u); }}
              data-testid="practitioner-ai-pack-confirm-buy-mobile"
            >
              {busy ? <Loader2 width={16} height={16} className="animate-spin" aria-hidden="true" /> : `Купить · ${confirmPack.priceRub.toLocaleString("ru")} ₽`}
            </button>
          </div>
        </div>
      )}

      {/* Авто-докупка */}
      <div className="pcab-defrow" style={{ marginTop: 10 }}>
        <div className="pcab-defrow-main">
          <div className="pcab-defrow-t">Авто-докупка при исчерпании</div>
          <div className="pcab-defrow-s">Докупать +{packs[0]?.units ?? 10}, чтобы разборы не прерывались. Оплата с баланса практика.</div>
        </div>
        <Toggle on={autoTopup} onClick={() => toggleAutoTopup(!autoTopup)} label="Авто-докупка при исчерпании" testid="practitioner-ai-auto-topup-mobile" />
      </div>

      <div className="pcab-note">
        <b>Разбор</b> = транскрипт + резюме + клинические заметки + сообщение клиенту. Расшифровка сессий
        и комплаенс — всегда включены и лимит не тратят.
      </div>
    </div>
  );
}
