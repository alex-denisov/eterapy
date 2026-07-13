"use client";

import { useMemo, useState, useTransition } from "react";
import { Copy, Link2, QrCode, RotateCcw, Share2, XCircle } from "lucide-react";

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

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border/50 bg-white/80 p-4 shadow-sm">
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto]">
          <label className="space-y-1 text-sm">
            <span className="font-medium">Название ссылки</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2"
              maxLength={80}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span className="font-medium">Текст-приглашение</span>
            <input
              value={freeAiHook}
              onChange={(event) => setFreeAiHook(event.target.value)}
              className="w-full rounded-md border border-border bg-white px-3 py-2"
              maxLength={240}
            />
          </label>
          <button
            type="button"
            onClick={createInvite}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--soft-bordeaux)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60 md:self-end"
          >
            <Link2 className="h-4 w-4" />
            Создать
          </button>
        </div>
      </section>

      {activeInvite && (
        <section className="rounded-lg border border-[var(--soft-apricot)] bg-[var(--soft-cream)] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Активная ссылка</p>
              <p className="break-all text-sm font-medium">{activeInvite.landingUrl}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => copy(activeInvite.landingUrl)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <Copy className="h-4 w-4" />
                Скопировать
              </button>
              <button type="button" onClick={() => copy(activeInvite.telegramUrl)} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
                <QrCode className="h-4 w-4" />
                Telegram
              </button>
            </div>
          </div>
        </section>
      )}

      <section className="overflow-x-auto rounded-lg border border-border/50 bg-white/80 p-4 shadow-sm">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="pb-3">Ссылка</th>
              <th className="pb-3">Открытия</th>
              <th className="pb-3">Регистрации</th>
              <th className="pb-3">Записи</th>
              <th className="pb-3">Статус</th>
              <th className="pb-3 text-right">Действие</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {invites.map((invite) => (
              <tr key={invite.id}>
                <td className="py-3">
                  <div className="font-medium">{invite.label}</div>
                  <div className="max-w-[320px] truncate text-xs text-muted-foreground">{invite.freeAiHook || invite.landingUrl}</div>
                </td>
                <td className="py-3 tabular-nums">{invite.openedCount}</td>
                <td className="py-3 tabular-nums">{invite.registeredCount}</td>
                <td className="py-3 tabular-nums">{invite.bookedCount}</td>
                <td className="py-3">{invite.status}</td>
                <td className="py-3 text-right">
                  {invite.status === "ACTIVE" ? (
                    <button type="button" onClick={() => updateStatus(invite.id, "REVOKED")} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
                      <XCircle className="h-4 w-4" />
                      Отозвать
                    </button>
                  ) : (
                    <button type="button" onClick={() => updateStatus(invite.id, "ACTIVE")} className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
                      <RotateCcw className="h-4 w-4" />
                      Включить
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {invites.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-muted-foreground">Создайте первую ссылку, чтобы приводить своих клиентов</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
