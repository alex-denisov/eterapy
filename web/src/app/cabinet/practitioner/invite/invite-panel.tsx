"use client";

import { useMemo, useState, useTransition } from "react";
import { Copy, Link2, Send, Share2 } from "lucide-react";

interface InviteRow {
  id: string;
  token: string;
  label: string;
  freeAiHook: string | null;
  status: string;
  openedCount: number;
  registeredCount: number;
  bookedCount: number;
  landingUrl: string;
  telegramUrl: string;
}

// B466 R9 — мобильный «Приглашения» (mockup -more-invite): бордо-геро со
// ставками комиссии Pro/Pro+, персональная ссылка + копировать/поделиться,
// сводка приглашённых/активных, «как это работает». variant="pcab" рендерит
// компактный экран кокпита; десктоп (форма создания + таблица) — без изменений.
interface InviteHeroRates {
  proByoc: number;
  proPlatform: number;
  proPlusByoc: number;
  proPlusPlatform: number;
}

export function PractitionerInvitePanel({
  initialInvites,
  variant,
  heroRates,
}: {
  initialInvites: InviteRow[];
  variant?: "pcab";
  heroRates?: InviteHeroRates;
}) {
  const [invites, setInvites] = useState(initialInvites);
  const [label, setLabel] = useState("Основная ссылка");
  const [freeAiHook, setFreeAiHook] = useState("Бесплатный короткий разбор перед первой записью");
  const [isPending, startTransition] = useTransition();

  const activeInvite = useMemo(() => invites.find((invite) => invite.status === "ACTIVE") ?? invites[0] ?? null, [invites]);

  function createInvite() {
    startTransition(async () => {
      const res = await fetch("/api/practitioner/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label, freeAiHook }),
      });
      const data = await res.json();
      if (data.invite) setInvites((current) => [data.invite, ...current]);
    });
  }

  function updateStatus(id: string, status: "ACTIVE" | "REVOKED") {
    startTransition(async () => {
      const res = await fetch(`/api/practitioner/invites/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) return;
      setInvites((current) => current.map((invite) => invite.id === id ? { ...invite, status } : invite));
    });
  }

  async function copy(value: string) {
    await navigator.clipboard?.writeText(value);
  }

  async function share(value: string) {
    if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
      try {
        await navigator.share({ url: value, title: "ETerapy" });
        return;
      } catch {
        /* пользователь отменил share — молча падаем на копирование */
      }
    }
    await copy(value);
  }

  // ── Мобильный кокпит (mockup practitioner-more-invite) ───────────────────
  if (variant === "pcab") {
    const invited = invites.reduce((sum, invite) => sum + invite.registeredCount, 0);
    const activeClients = invites.reduce((sum, invite) => sum + invite.bookedCount, 0);
    const link = activeInvite?.landingUrl ?? "";
    const displayLink = link.replace(/^https?:\/\//, "");

    return (
      <div data-testid="practitioner-invite-mobile-panel">
        <div className="pcab-inv-hero">
          <div className="pcab-inv-hero-t">Приводите своих клиентов — комиссия ниже</div>
          <div className="pcab-inv-hero-s">
            Клиенты, пришедшие по вашей ссылке, считаются «своими»: платформа берёт меньшую комиссию с их сессий.
          </div>
          {heroRates && (
            <div className="pcab-inv-rate">
              <div className="pcab-rate-box">
                <div className="pcab-rate-v">{heroRates.proByoc}%</div>
                <div className="pcab-rate-k">на Pro (вместо {heroRates.proPlatform}%)</div>
              </div>
              <div className="pcab-rate-box">
                <div className="pcab-rate-v">{heroRates.proPlusByoc}%</div>
                <div className="pcab-rate-k">на Pro+ (вместо {heroRates.proPlusPlatform}%)</div>
              </div>
            </div>
          )}
        </div>

        {activeInvite ? (
          <>
            <div className="pcab-linkcard" style={{ marginTop: 14 }}>
              <span className="pcab-linkcard-ic">
                <Link2 size={19} aria-hidden="true" />
              </span>
              <span className="pcab-linkcard-main">
                <span className="pcab-linkcard-t" data-testid="invite-link-mobile">{displayLink}</span>
                <span className="pcab-linkcard-u">Ваша персональная ссылка</span>
              </span>
            </div>
            <div className="pcab-inv-actions">
              <button type="button" className="pcab-btn pcab-btn-primary" onClick={() => copy(link)} data-testid="invite-copy-mobile">
                <Copy size={15} aria-hidden="true" />
                Копировать
              </button>
              <button type="button" className="pcab-btn pcab-btn-ghost" onClick={() => share(link)}>
                <Share2 size={15} aria-hidden="true" />
                Поделиться
              </button>
            </div>
          </>
        ) : (
          <button
            type="button"
            className="pcab-btn pcab-btn-primary"
            style={{ marginTop: 14, width: "100%" }}
            onClick={createInvite}
            disabled={isPending}
            data-testid="invite-create-mobile"
          >
            <Link2 size={15} aria-hidden="true" />
            {isPending ? "Создаём…" : "Создать ссылку"}
          </button>
        )}

        <div className="pcab-stats" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 16 }}>
          <div className="pcab-stat">
            <div className="pcab-stat-v">{invited}</div>
            <div className="pcab-stat-k">приглашено</div>
          </div>
          <div className="pcab-stat">
            <div className="pcab-stat-v">{activeClients}</div>
            <div className="pcab-stat-k">активных клиентов</div>
          </div>
        </div>

        <div className="pcab-inv-steps">
          <div className="pcab-inv-step">
            <span className="pcab-step-n">1</span>
            <span className="pcab-step-t">Отправьте ссылку клиенту любым способом.</span>
          </div>
          <div className="pcab-inv-step">
            <span className="pcab-step-n">2</span>
            <span className="pcab-step-t">Он записывается по ней и оплачивает сессию.</span>
          </div>
          <div className="pcab-inv-step">
            <span className="pcab-step-n">3</span>
            <span className="pcab-step-t">Комиссия по его сессиям — по сниженной ставке.</span>
          </div>
        </div>
      </div>
    );
  }

  // ── Десктоп «Practice cockpit» (mockup practitioner-desktop-invite-v2):
  //     бордо-геро с активной ссылкой + статгрид + «Ваши ссылки» слева,
  //     «Создать ссылку» + «Как это работает» + note справа. Без баллов/₽. ──
  const opened = invites.reduce((sum, invite) => sum + invite.openedCount, 0);
  const registered = invites.reduce((sum, invite) => sum + invite.registeredCount, 0);
  const booked = invites.reduce((sum, invite) => sum + invite.bookedCount, 0);
  const link = activeInvite?.landingUrl ?? "";
  const displayLink = link.replace(/^https?:\/\//, "");

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="practitioner-invite-desktop-panel">
      {/* Левая колонка: активная ссылка + статы + список */}
      <div className="flex flex-col gap-4">
        {activeInvite ? (
          <div className="overflow-hidden rounded-[18px] p-5 sm:p-6" style={{ background: "var(--soft-bordeaux)", color: "var(--soft-cream)" }}>
            <p className="text-[11px] uppercase tracking-[0.08em]" style={{ color: "rgba(251,241,228,0.82)" }}>Активная ссылка</p>
            <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[12px] p-2.5" style={{ background: "rgba(251,241,228,0.1)" }}>
              <span className="min-w-0 flex-1 truncate px-1 text-[14px] font-medium" data-testid="invite-link-desktop">{displayLink}</span>
              <button type="button" onClick={() => copy(link)} className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold" style={{ background: "var(--soft-cream)", color: "var(--soft-bordeaux)" }} data-testid="invite-copy-desktop">
                <Copy className="h-3.5 w-3.5" />Копировать
              </button>
              <button type="button" onClick={() => share(activeInvite.telegramUrl)} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px]" style={{ borderColor: "rgba(251,241,228,0.4)", color: "var(--soft-cream)" }}>
                <Send className="h-3.5 w-3.5" />Telegram
              </button>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed" style={{ color: "rgba(251,241,228,0.82)" }}>
              Приглашённым — бесплатный короткий разбор перед первой записью. Вы получаете клиента, доход — с обычных сессий.
            </p>
          </div>
        ) : (
          <div className="soft-card p-6 text-center">
            <p className="text-sm text-[var(--soft-ink-soft)]">Пока нет ссылок. Создайте первую справа, чтобы приводить своих клиентов.</p>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2.5">
          {([["открытия", opened], ["регистрации", registered], ["записи", booked]] as const).map(([lbl, value]) => (
            <div key={lbl} className="soft-card p-3.5 text-center">
              <p className="font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">{value}</p>
              <p className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">{lbl}</p>
            </div>
          ))}
        </div>

        <div className="soft-card p-5">
          <p className="soft-eyebrow mb-3">Ваши ссылки</p>
          {invites.length === 0 ? (
            <p className="text-sm text-[var(--soft-ink-faint)]">Ссылок пока нет.</p>
          ) : (
            <div className="space-y-3">
              {invites.map((invite) => (
                <div key={invite.id} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full" style={invite.status === "ACTIVE" ? { background: "#F6E7DD", color: "var(--soft-bordeaux)" } : { background: "var(--soft-paper-deep)", color: "var(--soft-ink-faint)" }}>
                    <Link2 className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium">{invite.label}</p>
                    <p className="mt-0.5 truncate text-xs text-[var(--soft-ink-faint)]">Открытия {invite.openedCount} · Регистрации {invite.registeredCount} · Записи {invite.bookedCount}</p>
                  </div>
                  <span className="shrink-0 rounded-full px-2.5 py-1 text-[10.5px] font-semibold" style={invite.status === "ACTIVE" ? { background: "var(--soft-sage, #E4EADF)", color: "var(--soft-sage-ink, #4B6146)" } : { background: "var(--soft-paper-deep)", color: "var(--soft-ink-faint)" }}>
                    {invite.status === "ACTIVE" ? "активна" : "отозвана"}
                  </span>
                  {invite.status === "ACTIVE" ? (
                    <button type="button" onClick={() => updateStatus(invite.id, "REVOKED")} disabled={isPending} className="shrink-0 text-xs text-[var(--soft-ink-faint)] disabled:opacity-60">Отозвать</button>
                  ) : (
                    <button type="button" onClick={() => updateStatus(invite.id, "ACTIVE")} disabled={isPending} className="shrink-0 text-xs disabled:opacity-60" style={{ color: "var(--soft-terracotta-dark)" }}>Включить</button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Правая колонка: создать + как работает + note */}
      <div className="flex flex-col gap-4">
        <div className="soft-card p-5">
          <p className="soft-eyebrow mb-3">Создать ссылку</p>
          <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">Название ссылки</label>
          <input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={80} className="mb-3.5 w-full rounded-[10px] border border-[var(--soft-paper-edge)] bg-white px-3 py-2.5 text-[13px]" />
          <label className="mb-1.5 block text-xs font-medium text-[var(--soft-ink-soft)]">
            Текст-приглашение <span className="font-normal text-[var(--soft-ink-faint)]">(что увидит клиент)</span>
          </label>
          <input value={freeAiHook} onChange={(event) => setFreeAiHook(event.target.value)} maxLength={240} className="mb-4 w-full rounded-[10px] border border-[var(--soft-paper-edge)] bg-white px-3 py-2.5 text-[13px]" />
          <button type="button" onClick={createInvite} disabled={isPending} className="soft-button soft-button-primary w-full justify-center" data-testid="invite-create-desktop">
            <Link2 className="h-4 w-4" />
            {isPending ? "Создаём…" : "Создать ссылку"}
          </button>
        </div>

        <div className="soft-card p-5">
          <p className="soft-eyebrow mb-3">Как это работает</p>
          <div className="space-y-3">
            {([["1", "Делитесь ссылкой — в соцсетях, мессенджере или лично."], ["2", "Клиент видит бесплатный короткий разбор, регистрируется и записывается к вам."], ["3", "Запись появляется в вашем календаре. Доход — с проведённых сессий, как обычно."]] as const).map(([n, text]) => (
              <div key={n} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold" style={{ background: "#F6E7DD", color: "var(--soft-bordeaux)" }}>{n}</span>
                <span className="text-[13px] leading-relaxed text-[var(--soft-ink-soft)]">{text}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[18px] p-4" style={{ background: "var(--soft-paper-deep)" }}>
          <p className="text-[12.5px] leading-relaxed text-[var(--soft-ink-faint)]">
            Бонусов и баллов за приглашения нет — ценность в новых клиентах. Отозванная ссылка перестаёт работать, а её статистика сохраняется.
          </p>
        </div>
      </div>
    </div>
  );
}
