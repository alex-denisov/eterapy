"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Ban, KeyRound, LogIn, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  type AdminUserRow,
  type UserPermissions,
  type UserRole,
  type Specialty,
  ROLE_LABELS,
  roleColor,
  channelLabel,
  channelColor,
  statusOf,
  SPECIALTY_LABELS,
  SPECIALTY_ORDER,
  SESSION_DURATIONS,
  PERMISSION_GROUPS,
} from "./user-display";

interface UserEditModalProps {
  row: AdminUserRow;
  permissions: UserPermissions;
  onClose: () => void;
  onSaved: () => void;
}

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]";
const FIELD = "mt-1 h-9 w-full rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-2.5 text-sm text-[var(--soft-ink-strong)]";

async function patchJson(url: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false || data?.error) {
    throw new Error(typeof data?.error === "string" ? data.error : "Не удалось сохранить");
  }
}

export function UserEditModal({ row, permissions, onClose, onSaved }: UserEditModalProps) {
  const isSuper = row.role === "SUPERADMIN";

  const [name, setName] = useState(row.name);
  const [email, setEmail] = useState(row.email);
  const [role, setRole] = useState<UserRole>(row.role);
  const [freeLimit, setFreeLimit] = useState(row.freeToolsLimit == null ? "" : String(row.freeToolsLimit));
  const [balanceRub, setBalanceRub] = useState(String(Math.round(row.balance / 100)));
  const [clarityCredits, setClarityCredits] = useState(String(row.clarityCredits));
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [perms, setPerms] = useState<string[]>(row.moderatorPermissions);

  // U6 — practitioner management
  const pr = row.practitioner;
  const [commission, setCommission] = useState(pr ? String(pr.commissionPercent) : "");
  const [specialties, setSpecialties] = useState<Specialty[]>(pr ? pr.specialties : []);
  const [tags, setTags] = useState(pr ? pr.tags.join(", ") : "");
  // V3: session pricing as toggleable presets (PriceRate) — one row per standard
  // duration, each with an enable checkbox + price, instead of a single value.
  const [rates, setRates] = useState(() => {
    const byDur = new Map((pr?.priceRates ?? []).map((r) => [r.durationMin, r]));
    return SESSION_DURATIONS.map((d) => {
      const r = byDur.get(d);
      return { durationMin: d, enabled: r?.enabled ?? false, priceRub: r ? String(r.priceRub) : "" };
    });
  });

  const [busy, setBusy] = useState(false);
  // W1: render the modal in a portal at document.body so it escapes the admin
  // shell's stacking context (the sticky sidebar + the backdrop-blur header both
  // create one) — otherwise z-[100] still loses to the header's z-50.
  const [mounted, setMounted] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect -- portal mount guard
  useEffect(() => { setMounted(true); }, []);
  const status = statusOf(row);

  // Role/balance/rights are SUPERADMIN-only; SUPERADMIN targets are read-only.
  const canEditRole = permissions.canManageRoles && !isSuper;
  const canEditBalance = permissions.canManageBalance && !isSuper;
  const canEditName = permissions.canEdit && !isSuper;
  const canEditRights = permissions.canManageRights && row.role === "ADMIN";
  const canEditPractitioner = permissions.canManagePractitioners && row.role === "PRACTITIONER" && !!pr;

  function togglePerm(key: string) {
    setPerms((current) => current.includes(key) ? current.filter((p) => p !== key) : [...current, key]);
  }
  function toggleSpecialty(key: Specialty) {
    setSpecialties((current) => current.includes(key) ? current.filter((s) => s !== key) : [...current, key]);
  }
  function toggleRate(i: number) {
    setRates((rs) => rs.map((r, idx) => idx === i ? { ...r, enabled: !r.enabled } : r));
  }
  function setRatePrice(i: number, value: string) {
    setRates((rs) => rs.map((r, idx) => idx === i ? { ...r, priceRub: value } : r));
  }

  async function saveAll() {
    if (password || passwordConfirm) {
      if (password.length < 8) { toast.error("Пароль — минимум 8 символов"); return; }
      if (password !== passwordConfirm) { toast.error("Пароли не совпадают"); return; }
    }
    setBusy(true);
    try {
      // 1. Name
      if (canEditName && name.trim() && name.trim() !== row.name) {
        await patchJson(`/api/admin/users/${row.id}`, { action: "update_name", name: name.trim() });
      }
      // 2. Email
      if (canEditName && email.trim() && email.trim().toLowerCase() !== row.email.toLowerCase()) {
        await patchJson(`/api/admin/users/${row.id}`, { action: "update_profile", email: email.trim() });
      }
      // 3. Role + free limit (superadmin)
      const usersPatch: Record<string, unknown> = { userId: row.id };
      if (canEditRole && role !== row.role) usersPatch.role = role;
      if (permissions.canManageRoles && freeLimit !== String(row.freeToolsLimit ?? "")) {
        usersPatch.freeToolsLimit = freeLimit.trim() === "" ? 0 : Number(freeLimit);
      }
      if (Object.keys(usersPatch).length > 1) {
        await patchJson("/api/admin/users", usersPatch);
      }
      // 4. Money balance
      if (canEditBalance) {
        const nextRub = Number(balanceRub);
        if (Number.isFinite(nextRub) && nextRub !== Math.round(row.balance / 100)) {
          await patchJson(`/api/admin/users/${row.id}`, { action: "update_balance", balanceRub: nextRub, reason: "admin user modal" });
        }
        // 5. Clarity credits (clients only)
        if (row.role === "CLIENT") {
          const nextCredits = Number(clarityCredits);
          if (Number.isInteger(nextCredits) && nextCredits !== row.clarityCredits) {
            await patchJson(`/api/admin/users/${row.id}`, { action: "update_clarity_credits", clarityCredits: nextCredits, reason: "admin user modal" });
          }
        }
      }
      // 6. Manual password
      if (password && password.length >= 8) {
        await patchJson(`/api/admin/users/${row.id}`, { action: "set_password", newPassword: password });
      }
      // 7. Rights matrix (moderators)
      if (canEditRights && JSON.stringify([...perms].sort()) !== JSON.stringify([...row.moderatorPermissions].sort())) {
        await patchJson("/api/admin/moderators", { moderatorId: row.id, permissions: perms });
      }
      // 8. Practitioner profile (title/categories/tags/commission)
      if (canEditPractitioner && pr) {
        const ppatch: Record<string, unknown> = {};
        if (permissions.canManageRoles && commission !== String(pr.commissionPercent)) ppatch.commissionPercent = Number(commission);
        if (JSON.stringify([...specialties].sort()) !== JSON.stringify([...pr.specialties].sort())) ppatch.specialties = specialties;
        const tagList = tags.split(",").map((t) => t.trim()).filter(Boolean);
        if (JSON.stringify(tagList) !== JSON.stringify(pr.tags)) ppatch.tags = tagList;
        if (Object.keys(ppatch).length > 0) {
          await patchJson(`/api/admin/practitioners/${pr.id}/profile`, ppatch);
        }
      }
      // 9. Session pricing presets (PriceRate) — superadmin only (rates API gate).
      if (canEditPractitioner && pr && permissions.canManageRoles) {
        const payload = rates
          .filter((r) => r.enabled || r.priceRub.trim() !== "")
          .map((r) => ({ durationMin: r.durationMin, priceRub: Number(r.priceRub) || 0, enabled: r.enabled }));
        const orig = JSON.stringify((pr.priceRates ?? []).map((r) => ({ durationMin: r.durationMin, priceRub: r.priceRub, enabled: r.enabled })));
        const next = JSON.stringify(payload);
        if (next !== orig && payload.length > 0) {
          await patchJson(`/api/admin/practitioners/${pr.id}/rates`, { rates: payload });
        }
      }

      toast.success("Изменения сохранены");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    } finally {
      setBusy(false);
    }
  }

  async function runAction(action: "reset_password" | "block" | "unblock" | "soft_delete" | "restore", confirmText?: string) {
    if (confirmText && !window.confirm(confirmText)) return;
    setBusy(true);
    try {
      await patchJson(`/api/admin/users/${row.id}`, { action, comment: "admin user modal" });
      toast.success("Готово");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Действие не выполнено");
    } finally {
      setBusy(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" data-testid="user-edit-modal">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5 shadow-[var(--soft-shadow-lg)]">
        {/* Header */}
        <div className="mb-4 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">{row.name || "Без имени"}</h2>
            <p className="truncate text-xs text-[var(--soft-ink-faint)]">{row.email}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
              <span className={`font-semibold ${roleColor(row.role)}`}>{ROLE_LABELS[row.role]}</span>
              <span className={channelColor(row.provider)}>канал: {channelLabel(row.provider)}</span>
              <span className={status.className}>{status.label}</span>
            </p>
          </div>
          <button type="button" className="soft-admin-action" data-variant="subtle" onClick={onClose} aria-label="Закрыть">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>

        {isSuper && (
          <p className="mb-4 rounded-md border border-amber-300/60 bg-amber-50 px-3 py-2 text-xs text-amber-700">
            Суперадмин — профиль доступен только для просмотра.
          </p>
        )}

        <div className="space-y-5">
          {/* U5 — security / antifraud provenance (read-only, from the audit log) */}
          <section>
            <h3 className={`mb-2 ${LABEL}`}>Безопасность и антифрод</h3>
            <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--soft-ink-faint)]">Источник регистрации</dt>
                <dd className="font-medium text-[var(--soft-ink-strong)]">{row.registrationSource || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--soft-ink-faint)]">Последняя сессия</dt>
                <dd className="font-medium text-[var(--soft-ink-strong)]">{row.lastLogin ? new Date(row.lastLogin.at).toLocaleString("ru-RU") : "нет данных"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--soft-ink-faint)]">IP последнего входа</dt>
                <dd className="font-mono text-[var(--soft-ink-strong)]">{row.lastLogin?.ip || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--soft-ink-faint)]">Устройство</dt>
                <dd className="font-medium text-[var(--soft-ink-strong)]">{row.lastLogin?.device || "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--soft-ink-faint)]">Канал входа</dt>
                <dd className="font-medium text-[var(--soft-ink-strong)]">{row.lastLogin?.channel || "—"}</dd>
              </div>
            </dl>
            <p className="mt-1.5 text-[10px] text-[var(--soft-ink-faint)]">Полная история входов — в разделе «Логи» (события LOGIN).</p>
          </section>

          {/* Profile */}
          <section>
            <h3 className={`mb-2 ${LABEL}`}>Профиль</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className={LABEL}>Имя</span>
                <Input className={FIELD} value={name} disabled={!canEditName} onChange={(e) => setName(e.target.value)} />
              </label>
              <label className="block">
                <span className={LABEL}>Email</span>
                <Input className={FIELD} type="email" value={email} disabled={!canEditName} onChange={(e) => setEmail(e.target.value)} />
              </label>
            </div>
          </section>

          {/* Role + limit (superadmin) */}
          {permissions.canManageRoles && (
            <section>
              <h3 className={`mb-2 ${LABEL}`}>Роль и доступ</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>Роль</span>
                  <select className={FIELD} value={role} disabled={!canEditRole} onChange={(e) => setRole(e.target.value as UserRole)}>
                    {(["CLIENT", "PRACTITIONER", "ADMIN", "SUPERADMIN"] as UserRole[]).map((r) => (
                      <option key={r} value={r} disabled={r === "SUPERADMIN"}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL}>Бесплатных инструментов в месяц</span>
                  <Input className={FIELD} inputMode="numeric" value={freeLimit} disabled={isSuper} placeholder="0 = безлимит" onChange={(e) => setFreeLimit(e.target.value)} />
                </label>
              </div>
            </section>
          )}

          {/* Finance */}
          {permissions.canManageBalance && (
            <section>
              <h3 className={`mb-2 ${LABEL}`}>Финансы</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>Денежный баланс, ₽</span>
                  <Input className={FIELD} inputMode="numeric" value={balanceRub} disabled={!canEditBalance} onChange={(e) => setBalanceRub(e.target.value)} />
                </label>
                <label className="block">
                  <span className={LABEL}>Кредиты ясности {row.role !== "CLIENT" && "(только клиенты)"}</span>
                  <Input className={FIELD} inputMode="numeric" value={row.role === "CLIENT" ? clarityCredits : "—"} disabled={!canEditBalance || row.role !== "CLIENT"} onChange={(e) => setClarityCredits(e.target.value)} />
                </label>
              </div>
            </section>
          )}

          {/* Password */}
          {permissions.canSetPassword && !isSuper && (
            <section>
              <h3 className={`mb-2 ${LABEL}`}>Пароль</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>Новый пароль (мин. 8)</span>
                  <Input className={FIELD} type="password" value={password} autoComplete="new-password" onChange={(e) => setPassword(e.target.value)} />
                </label>
                <label className="block">
                  <span className={LABEL}>Подтверждение</span>
                  <Input className={FIELD} type="password" value={passwordConfirm} autoComplete="new-password" onChange={(e) => setPasswordConfirm(e.target.value)} />
                </label>
              </div>
              {permissions.canResetPassword && (
                <button type="button" className="soft-admin-action mt-2" data-variant="subtle" disabled={busy} onClick={() => runAction("reset_password", `Отправить ${row.email} ссылку на сброс пароля?`)}>
                  <KeyRound className="size-3.5" aria-hidden="true" />
                  Сбросить по email
                </button>
              )}
            </section>
          )}

          {/* Practitioner (U6) */}
          {canEditPractitioner && pr && (
            <section>
              <h3 className={`mb-2 ${LABEL}`}>Практик · профиль и тарифы</h3>
              {/* V9: verification status (managed in admin/applications) is shown
                  read-only here so user management stays in sync. */}
              <p className="mb-3 text-xs">
                <span className="text-[var(--soft-ink-faint)]">Верификация: </span>
                {pr.verified ? (
                  <span className="font-medium text-emerald-600">
                    подтверждена{pr.verifiedAt ? ` · ${new Date(pr.verifiedAt).toLocaleDateString("ru-RU")}` : ""}
                  </span>
                ) : (
                  <span className="font-medium text-amber-600">не подтверждена</span>
                )}
                <span className="text-[var(--soft-ink-faint)]"> — заявки в разделе «Заявки»</span>
              </p>
              <label className="block max-w-[12rem]">
                <span className={LABEL}>Комиссия платформы, % {!permissions.canManageRoles && "(суперадмин)"}</span>
                <Input className={FIELD} inputMode="numeric" value={commission} disabled={!permissions.canManageRoles} onChange={(e) => setCommission(e.target.value)} />
              </label>

              {/* V3: session tariffs as toggleable presets — one row per standard
                  duration with an enable checkbox + price (superadmin sets price). */}
              {permissions.canManageRoles && (
                <div className="mt-3" data-testid="user-modal-rate-presets">
                  <span className={LABEL}>Тарифы сессий — включение и цена</span>
                  <p className="text-[10px] text-[var(--soft-ink-faint)]">Отметьте длительности, которые предлагает практик, и задайте цену ₽. Показ клиентам практик включает сам.</p>
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    {rates.map((r, i) => (
                      <div key={r.durationMin} className="flex items-center gap-2 rounded-md border border-[var(--soft-paper-edge)] px-2.5 py-1.5">
                        <label className="flex w-[5.5rem] shrink-0 items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
                          <input type="checkbox" checked={r.enabled} onChange={() => toggleRate(i)} className="accent-[var(--soft-bordeaux)]" />
                          {r.durationMin} мин
                        </label>
                        <Input className={`${FIELD} mt-0`} inputMode="numeric" placeholder="цена ₽" value={r.priceRub} onChange={(e) => setRatePrice(i, e.target.value)} />
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="mt-3">
                <span className={LABEL}>Категории</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {SPECIALTY_ORDER.map((s) => {
                    const active = specialties.includes(s);
                    return (
                      <button
                        key={s}
                        type="button"
                        onClick={() => toggleSpecialty(s)}
                        className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${active ? "border-[var(--soft-bordeaux)] bg-[var(--soft-bordeaux)]/10 text-[var(--soft-bordeaux)]" : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-ink-faint)]"}`}
                      >
                        {SPECIALTY_LABELS[s]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <label className="mt-3 block">
                <span className={LABEL}>Теги (через запятую)</span>
                <Input className={FIELD} value={tags} placeholder="любовь, карьера, отношения" onChange={(e) => setTags(e.target.value)} />
              </label>
            </section>
          )}

          {/* Rights matrix (U4) */}
          {canEditRights && (
            <section>
              <h3 className={`mb-2 ${LABEL}`}>Полномочия модератора</h3>
              <div className="space-y-3">
                {PERMISSION_GROUPS.map(({ group, items }) => (
                  <div key={group}>
                    <div className="mb-1 flex items-center justify-between">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--soft-ink-faint)]">{group}</p>
                      <div className="flex gap-2">
                        <button type="button" className="text-[11px] text-[var(--soft-bordeaux)] hover:underline" onClick={() => setPerms((c) => [...new Set([...c, ...items.map((i) => i.key)])])}>Все</button>
                        <button type="button" className="text-[11px] text-[var(--soft-ink-faint)] hover:underline" onClick={() => setPerms((c) => c.filter((p) => !items.some((i) => i.key === p)))}>Сбросить</button>
                      </div>
                    </div>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {items.map((item) => {
                        const checked = perms.includes(item.key);
                        return (
                          <label key={item.key} className={`flex items-center gap-2 rounded-md border px-2.5 py-1.5 text-xs ${checked ? "border-[var(--soft-bordeaux)]/40 bg-[var(--soft-bordeaux)]/5" : "border-[var(--soft-paper-edge)]"}`}>
                            <input type="checkbox" checked={checked} onChange={() => togglePerm(item.key)} className="accent-[var(--soft-bordeaux)]" />
                            <span className="text-[var(--soft-ink-soft)]">{item.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Status & access actions */}
          {!isSuper && (
            <section>
              <h3 className={`mb-2 ${LABEL}`}>Статус и доступ</h3>
              <div className="flex flex-wrap gap-2">
                {permissions.canImpersonate && (
                  <Link className="soft-admin-action" href={`/api/admin/impersonate?userId=${row.id}`} target="_blank">
                    <LogIn className="size-3.5" aria-hidden="true" />
                    Войти как пользователь
                  </Link>
                )}
                {permissions.canBlock && (
                  <button type="button" className="soft-admin-action" data-variant={row.blockedAt ? "subtle" : "danger"} disabled={busy} onClick={() => runAction(row.blockedAt ? "unblock" : "block", row.blockedAt ? undefined : `Заблокировать ${row.email}?`)}>
                    <Ban className="size-3.5" aria-hidden="true" />
                    {row.blockedAt ? "Разблокировать" : "Заблокировать"}
                  </button>
                )}
                {permissions.canDelete && (
                  <button type="button" className="soft-admin-action" data-variant={row.deletedAt ? "subtle" : "danger"} disabled={busy} onClick={() => runAction(row.deletedAt ? "restore" : "soft_delete", row.deletedAt ? undefined : `Пометить ${row.email} на удаление? Аккаунт очистится через 10 дней.`)}>
                    {row.deletedAt ? <RotateCcw className="size-3.5" aria-hidden="true" /> : <Trash2 className="size-3.5" aria-hidden="true" />}
                    {row.deletedAt ? "Восстановить" : "Удалить"}
                  </button>
                )}
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="mt-5 flex justify-end gap-2 border-t border-[var(--soft-paper-edge)] pt-4">
          <button type="button" className="soft-admin-action" data-variant="subtle" onClick={onClose} disabled={busy}>Закрыть</button>
          {!isSuper && (
            <button type="button" className="soft-admin-action" data-variant="primary" onClick={() => void saveAll()} disabled={busy}>
              {busy ? "Сохраняем…" : "Сохранить"}
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
