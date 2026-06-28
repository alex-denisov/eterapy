"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import type { Permission } from "@/lib/moderator-permissions";

interface Practitioner {
  id: string;
  userId: string;
  name: string;
  email: string;
  status: string;
  title: string;
  bio: string;
  experience: string;
  verified: boolean;
  bookingOverrideEnabled: boolean;
  agentOfferAcceptedAt: string | null;
  agentOfferVersion: string | null;
  taxStatus: string;
  taxReviewStatus: string;
  taxStatusVerifiedAt: string | null;
  taxStatusRejectedReason: string | null;
  payoutDetailsType: string | null;
  payoutDetailsInn: string | null;
  payoutDetailsKycStatus: string | null;
  userBlockedAt: string | null;
  commissionPercent: number;
  accruedNet: number;
  paidOut: number;
  pendingPayout: number;
  currentBalance: number;
  openComplaintCount: number;
  avgRating: number | null;
  reviewCount: number;
  sessionCount: number;
}

const STATUSES = [
  { value: "ACTIVE",    label: "Активен",       color: "text-green-400" },
  { value: "PENDING",   label: "На проверке",   color: "text-yellow-400" },
  { value: "SUSPENDED", label: "Деактивирован", color: "text-orange-400" },
  { value: "BLOCKED",   label: "Заблокирован",  color: "text-red-400" },
];

export function PractitionerActionPanel({
  practitioner: p,
  adminRole,
  permissions,
  onStatusChange,
  onUpdate,
}: {
  practitioner: Practitioner;
  adminRole: string;
  permissions: Permission[];
  onStatusChange: (status: string) => void;
  onUpdate: (patch: Partial<Practitioner>) => void;
}) {
  const can = (perm: Permission) => permissions.includes(perm);
  const [tab, setTab] = useState<"actions" | "rates" | "schedule" | "finance">("actions");
  const [newPwd, setNewPwd] = useState("");
  const [blockComment, setBlockComment] = useState("");
  const [name, setName] = useState(p.name);
  const [title, setTitle] = useState(p.title);
  const [bio, setBio] = useState(p.bio);
  const [experience, setExperience] = useState(p.experience);
  const [rates, setRates] = useState<Array<{ durationMin: number; priceRub: number; enabled: boolean }>>([]);
  const [ratesLoaded, setRatesLoaded] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [payingOut, setPayingOut] = useState(false);
  const [commissionInput, setCommissionInput] = useState(String(p.commissionPercent));
  const [savingCommission, setSavingCommission] = useState(false);
  const [taxStatus, setTaxStatus] = useState(p.taxStatus === "UNKNOWN" ? "SELF_EMPLOYED" : p.taxStatus);
  const [taxReviewStatus, setTaxReviewStatus] = useState(p.taxReviewStatus);
  const [taxRejectedReason, setTaxRejectedReason] = useState(p.taxStatusRejectedReason ?? "");
  const [savingTaxStatus, setSavingTaxStatus] = useState(false);
  const [bookingOverride, setBookingOverride] = useState(p.bookingOverrideEnabled);
  const [savingOverride, setSavingOverride] = useState(false);

  async function callUserAction(action: string, extra: Record<string, string> = {}) {
    const res = await fetch(`/api/admin/users/${p.userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const d = await res.json();
    if (d.ok) { toast.success("Выполнено"); return true; }
    toast.error(d.error ?? "Ошибка");
    return false;
  }

  async function saveProfile() {
    setSavingProfile(true);
    const res = await fetch(`/api/admin/practitioners/${p.id}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, title, bio, experience }),
    });
    const d = await res.json();
    if (d.ok) { toast.success("Профиль обновлён"); onUpdate({ name, title, bio, experience }); }
    else toast.error(d.error ?? "Ошибка");
    setSavingProfile(false);
  }

  async function loadRates() {
    const res = await fetch(`/api/rates?practitionerId=${p.id}`);
    const d = await res.json();
    const ALL_DURATIONS = [15, 30, 45, 60, 90, 120];
    const existing = (d.rates ?? []) as Array<{ durationMin: number; priceRub: number; enabled: boolean }>;
    const fullRates = ALL_DURATIONS.map(dur => {
      const found = existing.find(r => r.durationMin === dur);
      return found ?? { durationMin: dur, priceRub: 0, enabled: false };
    });
    setRates(fullRates);
    setRatesLoaded(true);
  }

  async function saveRates() {
    const res = await fetch(`/api/admin/practitioners/${p.id}/rates`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rates }),
    });
    const d = await res.json();
    if (d.ok) toast.success("Тарифы обновлены");
    else toast.error(d.error ?? "Ошибка");
  }

  async function saveCommission() {
    const n = parseInt(commissionInput, 10);
    if (!Number.isFinite(n) || n < 0 || n > 35) {
      toast.error("Комиссия должна быть от 0 до 35");
      return;
    }
    setSavingCommission(true);
    const res = await fetch(`/api/admin/practitioners/${p.id}/profile`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ commissionPercent: n }),
    });
    const d = await res.json();
    if (d.ok) {
      toast.success(`Комиссия: ${n}%`);
      onUpdate({ commissionPercent: n } as Partial<Practitioner>);
    } else {
      toast.error(d.error ?? "Ошибка");
    }
    setSavingCommission(false);
  }

  async function saveTaxStatus() {
    setSavingTaxStatus(true);
    const res = await fetch(`/api/admin/practitioners/${p.id}/tax-status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taxStatus, taxReviewStatus, rejectedReason: taxRejectedReason }),
    });
    const d = await res.json();
    if (d.ok) {
      toast.success("Налоговый статус обновлён");
      onUpdate({
        taxStatus: d.taxStatus,
        taxReviewStatus: d.taxReviewStatus,
        taxStatusVerifiedAt: d.taxStatusVerifiedAt,
        taxStatusRejectedReason: d.taxStatusRejectedReason,
      } as Partial<Practitioner>);
    } else {
      toast.error(d.error ?? "Ошибка");
    }
    setSavingTaxStatus(false);
  }

  async function saveBookingOverride(enabled: boolean) {
    setSavingOverride(true);
    const res = await fetch(`/api/admin/practitioners/${p.id}/booking-override`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    const d = await res.json();
    if (d.ok) {
      setBookingOverride(enabled);
      toast.success(enabled ? "Запись включена вручную" : "Ручное включение записи снято");
      onUpdate({ bookingOverrideEnabled: enabled } as Partial<Practitioner>);
    } else {
      toast.error(d.error ?? "Ошибка");
    }
    setSavingOverride(false);
  }

  async function triggerPayout() {
    if (!confirm(`Выплатить ${p.currentBalance.toLocaleString("ru")} ₽ этому практику?`)) return;
    setPayingOut(true);
    const res = await fetch(`/api/admin/practitioners/${p.id}/payout`, { method: "POST" });
    const d = await res.json();
    if (d.ok) {
      toast.success("Выплата инициирована");
      onUpdate({
        pendingPayout: p.pendingPayout + p.currentBalance,
        currentBalance: 0,
      } as Partial<Practitioner>);
    } else {
      toast.error(d.error ?? "Ошибка выплаты");
    }
    setPayingOut(false);
  }

  return (
    <div>
      {/* Табы — только разрешённые */}
      <div className="flex gap-1 mb-4 border-b border-border/20 pb-2">
        {(["actions", "rates", "finance", "schedule"] as const)
          .filter(t => {
            if (t === "rates") return can("practitioners.set_rates");
            if (t === "finance") return can("practitioners.view_earnings") || can("practitioners.payout");
            return true;
          })
          .map(t => (
          <button key={t} onClick={() => {
            setTab(t);
            if (t === "rates" && !ratesLoaded) loadRates();
          }}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              tab === t ? "bg-primary/10 text-primary" : "text-muted-foreground hover:text-foreground"
            }`}>
            {{ actions: "⚙️ Действия", rates: "💰 Тарифы", finance: "🏦 Финансы", schedule: "📅 Расписание" }[t]}
          </button>
        ))}
      </div>

      {tab === "actions" && (
        <div className="grid gap-4 md:grid-cols-2">
          {/* Имя */}
          {can("practitioners.edit") && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Имя пользователя</p>
              <div className="flex gap-2">
                <Input value={name} onChange={e => setName(e.target.value)} className="bg-card/50 text-sm h-8" />
                <button onClick={() => callUserAction("update_name", { name }).then(ok => ok && onUpdate({ name }))}
                  className="rounded-lg bg-primary/20 px-3 text-xs text-primary hover:bg-primary/30 shrink-0">
                  Сохранить
                </button>
              </div>
            </div>
          )}

          {/* Пароль */}
          {(can("practitioners.set_password") || can("practitioners.reset_password")) && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Пароль</p>
              {can("practitioners.set_password") && (
                <div className="flex gap-2">
                  <Input type="password" autoComplete="new-password" placeholder="Новый пароль" value={newPwd}
                    onChange={e => setNewPwd(e.target.value)} className="bg-card/50 text-sm h-8"
                    name="practitioner-new-pwd" id="practitioner-new-pwd" data-form-type="other" />
                  <button onClick={() => callUserAction("set_password", { newPassword: newPwd }).then(ok => ok && setNewPwd(""))}
                    disabled={newPwd.length < 8}
                    className="rounded-lg bg-primary/20 px-3 text-xs text-primary hover:bg-primary/30 disabled:opacity-40 shrink-0">
                    Назначить
                  </button>
                </div>
              )}
              {can("practitioners.reset_password") && (
                <button onClick={() => callUserAction("reset_password")}
                  className="text-xs text-primary hover:underline">
                  📧 Отправить ссылку сброса
                </button>
              )}
            </div>
          )}

          {/* Статус профиля */}
          {can("practitioners.block") && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Статус практика</p>
              <div className="flex flex-wrap gap-1.5">
                {STATUSES.map(s => (
                  <button key={s.value} onClick={() => onStatusChange(s.value)}
                    className={`rounded-lg border px-3 py-1.5 text-xs transition-colors ${
                      p.status === s.value
                        ? `border-current ${s.color} bg-current/5`
                        : "border-border/30 text-muted-foreground hover:border-border/60"
                    }`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Блокировка входа */}
          {can("practitioners.block") && (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Вход в систему</p>
            {p.userBlockedAt ? (
              <button onClick={() => callUserAction("unblock").then(ok => ok && onUpdate({ userBlockedAt: null }))}
                className="rounded-lg border border-green-500/30 px-3 py-1.5 text-xs text-green-400 hover:bg-green-500/10">
                ✓ Разблокировать вход
              </button>
            ) : (
              <div className="flex gap-2">
                <Input placeholder="Причина блокировки" value={blockComment}
                  onChange={e => setBlockComment(e.target.value)} className="bg-card/50 text-sm h-8" />
                <button onClick={() => callUserAction("block", { comment: blockComment }).then(ok => ok && onUpdate({ userBlockedAt: new Date().toISOString() }))}
                  className="rounded-lg border border-red-500/30 px-3 text-xs text-red-400 hover:bg-red-500/10 shrink-0">
                  🚫 Заблокировать
                </button>
              </div>
            )}
            </div>
          )}

          {/* Редактирование профиля */}
          {can("practitioners.edit") && (
            <div className="md:col-span-2 space-y-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Профиль практика</p>
              <div className="grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Заголовок</label>
                  <Input value={title} onChange={e => setTitle(e.target.value)} className="bg-card/50 text-sm h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Опыт</label>
                  <Input value={experience} onChange={e => setExperience(e.target.value)} className="bg-card/50 text-sm h-8" />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-muted-foreground mb-1 block">Биография</label>
                  <textarea value={bio} onChange={e => setBio(e.target.value)}
                    className="w-full rounded-lg border border-border/40 bg-card/50 px-3 py-2 text-sm resize-none h-20 focus:outline-none focus:border-primary/50" />
                </div>
              </div>
              <button onClick={saveProfile} disabled={savingProfile}
                className="rounded-lg bg-primary/20 px-4 py-2 text-sm text-primary hover:bg-primary/30 disabled:opacity-50">
                {savingProfile ? "Сохранение..." : "Сохранить профиль"}
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "rates" && (
        <div className="space-y-3">
          {!ratesLoaded ? (
            <p className="text-xs text-muted-foreground animate-pulse">Загружаем тарифы...</p>
          ) : (
            <>
              <div className="grid gap-2 sm:grid-cols-3">
                {rates.map((r, i) => (
                  <div key={r.durationMin} className={`flex items-center gap-2 rounded-lg border p-2.5 ${
                    r.enabled ? "border-primary/30 bg-primary/5" : "border-border/20"
                  }`}>
                    <input type="checkbox" checked={r.enabled}
                      onChange={e => setRates(prev => prev.map((x, j) => j === i ? { ...x, enabled: e.target.checked } : x))}
                      className="accent-primary shrink-0" />
                    <span className="text-xs w-10 shrink-0">{r.durationMin} мин</span>
                    <div className="flex items-center gap-1 flex-1">
                      <Input type="number" min="0"
                        value={r.priceRub}
                        onChange={e => setRates(prev => prev.map((x, j) => j === i ? { ...x, priceRub: parseInt(e.target.value) || 0 } : x))}
                        disabled={!r.enabled}
                        className="h-6 text-xs bg-card/50 px-2" />
                      <span className="text-xs text-muted-foreground shrink-0">₽</span>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={saveRates}
                className="rounded-lg bg-primary/20 px-4 py-2 text-sm text-primary hover:bg-primary/30">
                Сохранить тарифы
              </button>
            </>
          )}
        </div>
      )}

      {tab === "finance" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border border-border/30 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Начислено (после комиссии)</p>
              <p className="mt-1 text-lg font-semibold">{p.accruedNet.toLocaleString("ru")} ₽</p>
              <p className="text-[10px] text-muted-foreground">Комиссия {p.commissionPercent}%</p>
            </div>
            <div className="rounded-lg border border-border/30 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Выплачено</p>
              <p className="mt-1 text-lg font-semibold text-green-400">{p.paidOut.toLocaleString("ru")} ₽</p>
            </div>
            <div className="rounded-lg border border-border/30 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">В обработке</p>
              <p className="mt-1 text-lg font-semibold text-yellow-400">{p.pendingPayout.toLocaleString("ru")} ₽</p>
            </div>
            <div className="rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-[10px] uppercase tracking-wide text-primary/80">Текущий баланс</p>
              <p className="mt-1 text-lg font-semibold text-primary">{p.currentBalance.toLocaleString("ru")} ₽</p>
            </div>
          </div>

          <div className="rounded-lg border border-border/30 p-3 text-xs text-muted-foreground space-y-1">
            <p>Сессий выполнено: <span className="text-foreground font-medium">{p.sessionCount}</span></p>
            <p>Рейтинг: <span className="text-foreground font-medium">{p.avgRating != null ? `★ ${p.avgRating.toFixed(1)} (${p.reviewCount})` : "нет оценок"}</span></p>
            <p>Открытых жалоб: <span className={p.openComplaintCount > 0 ? "text-red-400 font-medium" : "text-foreground font-medium"}>{p.openComplaintCount}</span></p>
          </div>

          {/* Комиссия: редактирует только SUPERADMIN (role-gate on server), остальные видят как read-only */}
          <div className="rounded-lg border border-border/30 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Комиссия платформы</p>
            {adminRole === "SUPERADMIN" ? (
              <div className="flex items-center gap-2">
                <Input type="number" min="0" max="35" step="1"
                  value={commissionInput}
                  onChange={e => setCommissionInput(e.target.value)}
                  className="h-8 w-24 bg-card/50 text-sm" />
                <span className="text-sm text-muted-foreground">%</span>
                <button onClick={saveCommission} disabled={savingCommission}
                  className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs text-primary hover:bg-primary/30 disabled:opacity-40">
                  {savingCommission ? "Сохранение…" : "Сохранить"}
                </button>
                <p className="ml-auto text-[10px] text-muted-foreground">
                  Применяется к новым завершённым сессиям; баланс пересчитается на лету.
                </p>
              </div>
            ) : (
              <p className="text-sm font-medium">{p.commissionPercent}%</p>
            )}
          </div>

          {can("practitioners.verify") && (
            <div className="rounded-lg border border-border/30 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Налоговый статус и агентский контур</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <select value={taxStatus} onChange={e => setTaxStatus(e.target.value)}
                  className="h-8 rounded-lg border border-border/40 bg-card/50 px-2 text-xs">
                  <option value="SELF_EMPLOYED">Самозанятый</option>
                  <option value="INDIVIDUAL_ENTREPRENEUR">ИП</option>
                  <option value="LEGAL_ENTITY">ООО</option>
                </select>
                <select value={taxReviewStatus} onChange={e => setTaxReviewStatus(e.target.value)}
                  className="h-8 rounded-lg border border-border/40 bg-card/50 px-2 text-xs">
                  <option value="PENDING">Ожидает проверки</option>
                  <option value="VERIFIED">Подтверждён</option>
                  <option value="REJECTED">Отклонён</option>
                  <option value="EXPIRED">Истёк</option>
                </select>
                <button onClick={saveTaxStatus} disabled={savingTaxStatus}
                  className="rounded-lg bg-primary/20 px-3 py-1.5 text-xs text-primary hover:bg-primary/30 disabled:opacity-40">
                  {savingTaxStatus ? "Сохранение…" : "Сохранить статус"}
                </button>
              </div>
              <Input
                value={taxRejectedReason}
                onChange={e => setTaxRejectedReason(e.target.value)}
                placeholder="Причина отказа"
                className="mt-2 h-8 bg-card/50 text-xs"
              />
              <div className="mt-2 grid gap-1 text-[11px] text-muted-foreground sm:grid-cols-2">
                <p>Оферта: <span className="text-foreground">{p.agentOfferAcceptedAt ? p.agentOfferVersion ?? "принята" : "не принята"}</span></p>
                <p>Реквизиты: <span className="text-foreground">{p.payoutDetailsType ?? "нет"} · ИНН {p.payoutDetailsInn ?? "—"} · KYC {p.payoutDetailsKycStatus ?? "—"}</span></p>
              </div>
            </div>
          )}

          {/* B459: superadmin-only manual booking-enable override. Makes a vetted/
              demo practitioner bookable without full requisites (bypasses agent
              offer + tax status + payout details, never the active check). */}
          {adminRole === "SUPERADMIN" && (
            <div className="rounded-lg border border-border/30 p-3">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-2">Ручное включение записи</p>
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground leading-snug">
                  {bookingOverride
                    ? "Запись открыта вручную — клиенты могут бронировать в обход реквизитов."
                    : "Запись закрыта до агентской оферты, налогового статуса и реквизитов выплат."}
                </p>
                <button
                  onClick={() => saveBookingOverride(!bookingOverride)}
                  disabled={savingOverride}
                  className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                    bookingOverride
                      ? "border-green-500/40 text-green-400 hover:bg-green-500/10"
                      : "border-border/40 text-muted-foreground hover:border-primary/50 hover:text-primary"
                  }`}
                >
                  {savingOverride ? "…" : bookingOverride ? "✓ Запись включена" : "Включить запись"}
                </button>
              </div>
            </div>
          )}

          {can("practitioners.payout") && (
            <div>
              <button onClick={triggerPayout}
                disabled={payingOut || p.currentBalance <= 0}
                className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-navy hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed">
                {payingOut
                  ? "Инициирую…"
                  : p.currentBalance > 0
                    ? `💸 Выплатить ${p.currentBalance.toLocaleString("ru")} ₽ сейчас`
                    : "Нет средств к выплате"}
              </button>
              <p className="mt-2 text-[11px] text-muted-foreground">Создаёт Payout со статусом PENDING — обработчик проведёт через платёжного провайдера.</p>
            </div>
          )}
        </div>
      )}

      {tab === "schedule" && (
        <div className="text-sm text-muted-foreground">
          <p>Расписание практика редактируется в его кабинете.</p>
          <a href={`/api/admin/impersonate?userId=${p.userId}`} target="_blank"
            className="mt-2 inline-block text-xs text-primary hover:underline">
            → Войти в кабинет практика
          </a>
        </div>
      )}
    </div>
  );
}
