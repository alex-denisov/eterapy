"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Ban, KeyRound, LogIn, RotateCcw, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  type AdminUserRow,
  type UserPermissions,
  type UserRole,
  ROLE_LABELS,
  roleColor,
  channelLabel,
  channelColor,
  statusOf,
  SESSION_DURATIONS,
  PERMISSION_GROUPS,
} from "./user-display";
import { PractitionerTaxonomyFields } from "@/components/practitioner/taxonomy-fields";
import { SessionFormatsField } from "@/components/practitioner/session-formats-field";
import { specialtiesForDirections } from "@/lib/practitioner-taxonomy";
import { normalizeOfferedFormats } from "@/lib/session-formats";

interface UserEditModalProps {
  row: AdminUserRow;
  permissions: UserPermissions;
  onClose: () => void;
  onSaved: () => void;
}

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]";
const FIELD = "mt-1 h-9 w-full rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-2.5 text-sm text-[var(--soft-ink-strong)]";
const PRACTITIONER_STATUSES = [
  { value: "PENDING", label: "На проверке" },
  { value: "ACTIVE", label: "Активен" },
  { value: "SUSPENDED", label: "Деактивирован" },
  { value: "BLOCKED", label: "Заблокирован" },
];

type ClientSessionRow = { id: string; status: string; priceRub: number; createdAt: string };
type ClientEventRow = { action: string; createdAt: string; details: string | null };

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
  const [telegramUsername, setTelegramUsername] = useState(row.telegramUsername ?? "");
  const [birthDate, setBirthDate] = useState(row.birthDate ? row.birthDate.slice(0, 10) : "");
  const [birthTime, setBirthTime] = useState(row.birthTime ?? "");
  const [birthPlace, setBirthPlace] = useState(row.birthPlace ?? "");
  const [timezone, setTimezone] = useState(row.timezone ?? "");
  const [role, setRole] = useState<UserRole>(row.role);
  const [clarityCredits, setClarityCredits] = useState(String(row.clarityCredits));
  const [subscriptionPlan, setSubscriptionPlan] = useState(row.subscriptionPlanKey ?? "none");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [perms, setPerms] = useState<string[]>(row.moderatorPermissions);

  // U6 — practitioner management
  const pr = row.practitioner;
  const [prStatus, setPrStatus] = useState(pr?.status ?? "");
  const [prTitle, setPrTitle] = useState(pr?.title ?? "");
  const [prBio, setPrBio] = useState(pr?.bio ?? "");
  const [prExperience, setPrExperience] = useState(pr?.experience ?? "");
  const [taxStatus, setTaxStatus] = useState(pr?.taxStatus === "UNKNOWN" ? "SELF_EMPLOYED" : pr?.taxStatus ?? "SELF_EMPLOYED");
  const [taxReviewStatus, setTaxReviewStatus] = useState(pr?.taxReviewStatus ?? "PENDING");
  const [taxRejectedReason, setTaxRejectedReason] = useState(pr?.taxStatusRejectedReason ?? "");
  const [bookingOverride, setBookingOverride] = useState(pr?.bookingOverrideEnabled ?? false);
  const [commission, setCommission] = useState(pr ? String(pr.commissionPercent) : "");
  // W3: three-level taxonomy (specialization → direction → tasks)
  const [categories, setCategories] = useState<string[]>(pr ? pr.categories : []);
  const [directions, setDirections] = useState<string[]>(pr ? pr.directions : []);
  const [tasks, setTasks] = useState<string[]>(pr ? pr.tags : []);
  // B466/B480: предлагаемые форматы сессий (individual/couple/family)
  const [formats, setFormats] = useState<string[]>(pr ? normalizeOfferedFormats(pr.formats) : []);
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
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [clientSessions, setClientSessions] = useState<ClientSessionRow[]>([]);
  const [clientEvents, setClientEvents] = useState<ClientEventRow[]>([]);
  const [loadingClientSessions, setLoadingClientSessions] = useState(false);
  const [loadingClientEvents, setLoadingClientEvents] = useState(false);
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
  function toggleRate(i: number) {
    setRates((rs) => rs.map((r, idx) => idx === i ? { ...r, enabled: !r.enabled } : r));
  }
  function setRatePrice(i: number, value: string) {
    setRates((rs) => rs.map((r, idx) => idx === i ? { ...r, priceRub: value } : r));
  }

  async function loadClientSessions() {
    setLoadingClientSessions(true);
    try {
      const response = await fetch(`/api/bookings?role=admin&userId=${row.id}`);
      const data = await response.json().catch(() => ({}));
      setClientSessions(Array.isArray(data.bookings) ? data.bookings : []);
    } catch {
      toast.error("Не удалось загрузить сессии клиента");
    } finally {
      setLoadingClientSessions(false);
    }
  }

  async function loadClientEvents() {
    setLoadingClientEvents(true);
    try {
      const response = await fetch(`/api/admin/audit?targetId=${row.id}&limit=50`);
      const data = await response.json().catch(() => ({}));
      setClientEvents(Array.isArray(data.logs) ? data.logs : []);
    } catch {
      toast.error("Не удалось загрузить события клиента");
    } finally {
      setLoadingClientEvents(false);
    }
  }

  async function toggleBookingOverride() {
    if (!pr) return;
    setBusy(true);
    try {
      const next = !bookingOverride;
      await patchJson(`/api/admin/practitioners/${pr.id}/booking-override`, { enabled: next });
      setBookingOverride(next);
      toast.success(next ? "Запись включена вручную" : "Ручное включение записи снято");
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось изменить запись");
    } finally {
      setBusy(false);
    }
  }

  async function triggerPractitionerPayout() {
    if (!pr || pr.currentBalance <= 0) return;
    if (!window.confirm(`Выплатить ${pr.currentBalance.toLocaleString("ru-RU")} ₽ этому практику?`)) return;
    setPayoutBusy(true);
    try {
      const response = await fetch(`/api/admin/practitioners/${pr.id}/payout`, { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data?.ok === false || data?.error) {
        throw new Error(typeof data?.error === "string" ? data.error : "Ошибка выплаты");
      }
      toast.success("Выплата инициирована");
      onSaved();
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка выплаты");
    } finally {
      setPayoutBusy(false);
    }
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
      // 2. Profile details from the old client management page.
      if (canEditName) {
        const profilePatch: Record<string, unknown> = { action: "update_profile" };
        if (email.trim() && email.trim().toLowerCase() !== row.email.toLowerCase()) profilePatch.email = email.trim();
        if (row.role === "CLIENT") {
          if (birthDate !== (row.birthDate ? row.birthDate.slice(0, 10) : "")) profilePatch.birthDate = birthDate;
          if (birthTime !== (row.birthTime ?? "")) profilePatch.birthTime = birthTime;
          if (birthPlace !== (row.birthPlace ?? "")) profilePatch.birthPlace = birthPlace;
          if (timezone !== (row.timezone ?? "")) profilePatch.timezone = timezone;
          if (telegramUsername.replace(/^@/, "") !== (row.telegramUsername ?? "")) profilePatch.telegramUsername = telegramUsername;
        }
        if (Object.keys(profilePatch).length > 1) {
          await patchJson(`/api/admin/users/${row.id}`, profilePatch);
        }
      }
      // 3. Role (superadmin)
      const usersPatch: Record<string, unknown> = { userId: row.id };
      if (canEditRole && role !== row.role) usersPatch.role = role;
      if (Object.keys(usersPatch).length > 1) {
        await patchJson("/api/admin/users", usersPatch);
      }
      // 4. Clarity credits (clients only) — the ₽ balance rail is removed (Z1-Ф1).
      if (canEditBalance && row.role === "CLIENT") {
        const nextCredits = Number(clarityCredits);
        if (Number.isInteger(nextCredits) && nextCredits !== row.clarityCredits) {
          await patchJson(`/api/admin/users/${row.id}`, { action: "update_clarity_credits", clarityCredits: nextCredits, reason: "admin user modal" });
        }
      }
      if (canEditBalance && row.role === "CLIENT" && subscriptionPlan !== (row.subscriptionPlanKey ?? "none")) {
        await patchJson(`/api/admin/users/${row.id}`, {
          action: "set_subscription",
          planKey: subscriptionPlan === "none" ? null : subscriptionPlan,
        });
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
        if (prTitle !== pr.title) ppatch.title = prTitle;
        if (prBio !== pr.bio) ppatch.bio = prBio;
        if (prExperience !== pr.experience) ppatch.experience = prExperience;
        if (permissions.canManageRoles && commission !== String(pr.commissionPercent)) ppatch.commissionPercent = Number(commission);
        if (JSON.stringify([...categories].sort()) !== JSON.stringify([...pr.categories].sort())) ppatch.categories = categories;
        if (JSON.stringify([...directions].sort()) !== JSON.stringify([...pr.directions].sort())) ppatch.directions = directions;
        // esoteric directions stay mirrored onto the Specialty enum for legacy surfaces
        const derivedSpecialties = specialtiesForDirections(directions);
        if (JSON.stringify([...derivedSpecialties].sort()) !== JSON.stringify([...pr.specialties].sort())) ppatch.specialties = derivedSpecialties;
        if (JSON.stringify(tasks) !== JSON.stringify(pr.tags)) ppatch.tags = tasks;
        if (JSON.stringify([...formats].sort()) !== JSON.stringify([...normalizeOfferedFormats(pr.formats)].sort())) ppatch.formats = formats;
        if (Object.keys(ppatch).length > 0) {
          await patchJson(`/api/admin/practitioners/${pr.id}/profile`, ppatch);
        }
      }
      // 8b. Practitioner operational status and tax review gates from the old practitioner panel.
      if (canEditPractitioner && pr && permissions.canBlockPractitioners && prStatus !== pr.status) {
        await patchJson(`/api/admin/practitioners/${pr.id}/status`, { status: prStatus });
      }
      if (canEditPractitioner && pr && permissions.canVerifyPractitioners) {
        const taxChanged = taxStatus !== pr.taxStatus
          || taxReviewStatus !== pr.taxReviewStatus
          || taxRejectedReason !== (pr.taxStatusRejectedReason ?? "");
        if (taxChanged) {
          await patchJson(`/api/admin/practitioners/${pr.id}/tax-status`, {
            taxStatus,
            taxReviewStatus,
            rejectedReason: taxRejectedReason,
          });
        }
      }
      // 9. Session pricing presets (PriceRate) — superadmin only (rates API gate).
      if (canEditPractitioner && pr && permissions.canSetPractitionerRates) {
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
      <div className="relative max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5 shadow-[var(--soft-shadow-lg)]">
        {/* Y1: pin ONLY the close (×) button, not the whole header. A full sticky
            header left an empty strip at the top while scrolling. A zero-height
            sticky wrapper keeps the × reachable without reserving vertical space;
            the title scrolls normally underneath. */}
        <div className="pointer-events-none sticky top-0 z-20 flex h-0 justify-end">
          <button
            type="button"
            className="pointer-events-auto -mr-1 -mt-1 inline-flex size-8 items-center justify-center rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] text-[var(--soft-ink-soft)] shadow-[var(--soft-shadow-sm)] transition-colors hover:bg-[var(--soft-surface)] hover:text-[var(--soft-bordeaux)]"
            onClick={onClose}
            aria-label="Закрыть"
          >
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mb-4 flex items-start justify-between gap-4 border-b border-[var(--soft-paper-edge)] pb-3 pr-10">
          <div className="min-w-0">
            <h2 className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">{row.name || "Без имени"}</h2>
            <p className="truncate text-xs text-[var(--soft-ink-faint)]">{row.email}</p>
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px]">
              <span className={`font-semibold ${roleColor(row.role)}`}>{ROLE_LABELS[row.role]}</span>
              <span className={channelColor(row.provider)}>канал: {channelLabel(row.provider)}</span>
              <span className={status.className}>{status.label}</span>
            </p>
          </div>
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
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--soft-ink-faint)]">Отпечаток устройства</dt>
                <dd className="font-mono text-[var(--soft-ink-strong)]" title={row.lastLogin?.fingerprint ?? undefined} data-testid="user-card-fingerprint">
                  {row.lastLogin?.fingerprint ? `${row.lastLogin.fingerprint.slice(0, 12)}…` : "—"}
                </dd>
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

          {row.role === "CLIENT" && (
            <section>
              <h3 className={`mb-2 ${LABEL}`}>Профиль клиента</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>Telegram</span>
                  <Input className={FIELD} value={telegramUsername} disabled={!canEditName} placeholder="@username" onChange={(e) => setTelegramUsername(e.target.value)} />
                </label>
                <label className="block">
                  <span className={LABEL}>Дата рождения</span>
                  <Input className={FIELD} type="date" value={birthDate} disabled={!canEditName} onChange={(e) => setBirthDate(e.target.value)} />
                </label>
                <label className="block">
                  <span className={LABEL}>Время рождения</span>
                  <Input className={FIELD} type="time" value={birthTime} disabled={!canEditName} onChange={(e) => setBirthTime(e.target.value)} />
                </label>
                <label className="block">
                  <span className={LABEL}>Город</span>
                  <Input className={FIELD} value={birthPlace} disabled={!canEditName} placeholder="Москва" onChange={(e) => setBirthPlace(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                  <span className={LABEL}>Часовой пояс</span>
                  <Input className={FIELD} value={timezone} disabled={!canEditName} placeholder="Europe/Moscow" onChange={(e) => setTimezone(e.target.value)} />
                </label>
              </div>
            </section>
          )}

          {row.role === "CLIENT" && (permissions.canViewClientSessions || permissions.canViewClientEvents) && (
            <section>
              <h3 className={`mb-2 ${LABEL}`}>История клиента</h3>
              <div className="grid gap-3 lg:grid-cols-2">
                {permissions.canViewClientSessions && (
                  <div className="rounded-md border border-[var(--soft-paper-edge)] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[var(--soft-ink-strong)]">Сессии</p>
                      <button type="button" className="soft-admin-action" data-variant="subtle" onClick={() => void loadClientSessions()} disabled={loadingClientSessions}>
                        {loadingClientSessions ? "Загрузка..." : clientSessions.length ? "Обновить" : "Загрузить"}
                      </button>
                    </div>
                    <div className="max-h-52 space-y-1 overflow-y-auto text-xs">
                      {clientSessions.length === 0 ? (
                        <p className="text-[var(--soft-ink-faint)]">Нажмите «Загрузить», чтобы увидеть бронирования клиента.</p>
                      ) : clientSessions.map((session) => (
                        <div key={session.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-2 rounded border border-[var(--soft-paper-edge)] px-2 py-1.5">
                          <span className="truncate text-[var(--soft-ink-soft)]">{new Date(session.createdAt).toLocaleString("ru-RU")}</span>
                          <span className="font-medium text-[var(--soft-ink-strong)]">{session.status}</span>
                          <span className="tabular-nums text-[var(--soft-bordeaux)]">{session.priceRub.toLocaleString("ru-RU")} ₽</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {permissions.canViewClientEvents && (
                  <div className="rounded-md border border-[var(--soft-paper-edge)] p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold text-[var(--soft-ink-strong)]">События</p>
                      <button type="button" className="soft-admin-action" data-variant="subtle" onClick={() => void loadClientEvents()} disabled={loadingClientEvents}>
                        {loadingClientEvents ? "Загрузка..." : clientEvents.length ? "Обновить" : "Загрузить"}
                      </button>
                    </div>
                    <div className="max-h-52 space-y-1 overflow-y-auto text-xs">
                      {clientEvents.length === 0 ? (
                        <p className="text-[var(--soft-ink-faint)]">Нажмите «Загрузить», чтобы увидеть журнал действий клиента.</p>
                      ) : clientEvents.map((event, index) => (
                        <div key={`${event.action}-${event.createdAt}-${index}`} className="rounded border border-[var(--soft-paper-edge)] px-2 py-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium text-[var(--soft-ink-strong)]">{event.action}</span>
                            <span className="whitespace-nowrap text-[10px] text-[var(--soft-ink-faint)]">{new Date(event.createdAt).toLocaleString("ru-RU")}</span>
                          </div>
                          {event.details && <p className="mt-0.5 line-clamp-2 break-words text-[10px] text-[var(--soft-ink-faint)]">{event.details}</p>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* Role (superadmin) */}
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
              </div>
            </section>
          )}

          {/* Finance — Z1-Ф1: clients hold only a clarity-credit balance now. */}
          {permissions.canManageBalance && (
            <section>
              <h3 className={`mb-2 ${LABEL}`}>Финансы</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>Баллы {row.role !== "CLIENT" && "(только клиенты)"}</span>
                  <Input className={FIELD} inputMode="numeric" value={row.role === "CLIENT" ? clarityCredits : "—"} disabled={!canEditBalance || row.role !== "CLIENT"} onChange={(e) => setClarityCredits(e.target.value)} />
                </label>
                {row.role === "CLIENT" && (
                  <label className="block">
                    <span className={LABEL}>Подписка</span>
                    <select className={FIELD} value={subscriptionPlan} disabled={!canEditBalance} onChange={(e) => setSubscriptionPlan(e.target.value)}>
                      <option value="none">Без подписки</option>
                      <option value="plus">Plus</option>
                      <option value="premium">Premium</option>
                    </select>
                  </label>
                )}
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
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className={LABEL}>Статус профиля</span>
                  <select className={FIELD} value={prStatus} disabled={!permissions.canBlockPractitioners} onChange={(e) => setPrStatus(e.target.value)}>
                    {PRACTITIONER_STATUSES.map((item) => (
                      <option key={item.value} value={item.value}>{item.label}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className={LABEL}>Комиссия платформы, % {!permissions.canManageRoles && "(суперадмин)"}</span>
                  <Input className={FIELD} inputMode="numeric" value={commission} disabled={!permissions.canManageRoles} onChange={(e) => setCommission(e.target.value)} />
                </label>
                <label className="block">
                  <span className={LABEL}>Заголовок</span>
                  <Input className={FIELD} value={prTitle} disabled={!canEditPractitioner} onChange={(e) => setPrTitle(e.target.value)} />
                </label>
                <label className="block">
                  <span className={LABEL}>Опыт</span>
                  <Input className={FIELD} value={prExperience} disabled={!canEditPractitioner} onChange={(e) => setPrExperience(e.target.value)} />
                </label>
                <label className="block sm:col-span-2">
                  <span className={LABEL}>Биография</span>
                  <textarea className={`${FIELD} min-h-24 py-2`} value={prBio} disabled={!canEditPractitioner} onChange={(e) => setPrBio(e.target.value)} />
                </label>
              </div>

              {permissions.canViewPractitionerFinance && (
                <div className="mt-3 rounded-md border border-[var(--soft-paper-edge)] p-3">
                  <div className="grid gap-2 text-xs sm:grid-cols-3">
                    <div>
                      <p className="text-[var(--soft-ink-faint)]">Начислено после комиссии</p>
                      <p className="text-lg font-semibold tabular-nums text-[var(--soft-ink-strong)]">{pr.accruedNet.toLocaleString("ru-RU")} ₽</p>
                    </div>
                    <div>
                      <p className="text-[var(--soft-ink-faint)]">Выплачено</p>
                      <p className="text-lg font-semibold tabular-nums text-emerald-600">{pr.paidOut.toLocaleString("ru-RU")} ₽</p>
                    </div>
                    <div>
                      <p className="text-[var(--soft-ink-faint)]">Баланс к выплате</p>
                      <p className="text-lg font-semibold tabular-nums text-[var(--soft-bordeaux)]">{pr.currentBalance.toLocaleString("ru-RU")} ₽</p>
                    </div>
                    <div>
                      <p className="text-[var(--soft-ink-faint)]">В обработке</p>
                      <p className="font-medium tabular-nums">{pr.pendingPayout.toLocaleString("ru-RU")} ₽</p>
                    </div>
                    <div>
                      <p className="text-[var(--soft-ink-faint)]">Доступно</p>
                      <p className="font-medium tabular-nums">{pr.availablePayout.toLocaleString("ru-RU")} ₽</p>
                    </div>
                    <div>
                      <p className="text-[var(--soft-ink-faint)]">Удержано</p>
                      <p className="font-medium tabular-nums">{pr.heldPayout.toLocaleString("ru-RU")} ₽</p>
                    </div>
                    <div>
                      <p className="text-[var(--soft-ink-faint)]">Сессии</p>
                      <p className="font-medium">{pr.sessionCount}</p>
                    </div>
                    <div>
                      <p className="text-[var(--soft-ink-faint)]">Рейтинг</p>
                      <p className="font-medium">{pr.avgRating != null ? `${pr.avgRating.toFixed(1)} · ${pr.reviewCount} отзывов` : "нет оценок"}</p>
                    </div>
                    <div>
                      <p className="text-[var(--soft-ink-faint)]">Открытые жалобы</p>
                      <p className={pr.openComplaintCount > 0 ? "font-semibold text-red-600" : "font-medium"}>{pr.openComplaintCount}</p>
                    </div>
                  </div>
                  {permissions.canPayoutPractitioners && (
                    <button type="button" className="soft-admin-action mt-3" data-variant="primary" onClick={() => void triggerPractitionerPayout()} disabled={payoutBusy || pr.currentBalance <= 0}>
                      {payoutBusy ? "Запускаем..." : pr.currentBalance > 0 ? `Выплатить ${pr.currentBalance.toLocaleString("ru-RU")} ₽` : "Нет средств к выплате"}
                    </button>
                  )}
                </div>
              )}

              {permissions.canVerifyPractitioners && (
                <div className="mt-3 rounded-md border border-[var(--soft-paper-edge)] p-3">
                  <span className={LABEL}>Налоговый статус и реквизиты</span>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <select className={FIELD} value={taxStatus} onChange={(e) => setTaxStatus(e.target.value)}>
                      <option value="SELF_EMPLOYED">Самозанятый</option>
                      <option value="INDIVIDUAL_ENTREPRENEUR">ИП</option>
                      <option value="LEGAL_ENTITY">ООО</option>
                    </select>
                    <select className={FIELD} value={taxReviewStatus} onChange={(e) => setTaxReviewStatus(e.target.value)}>
                      <option value="PENDING">Ожидает проверки</option>
                      <option value="VERIFIED">Подтвержден</option>
                      <option value="REJECTED">Отклонен</option>
                      <option value="EXPIRED">Истек</option>
                    </select>
                    <Input className={FIELD} value={taxRejectedReason} onChange={(e) => setTaxRejectedReason(e.target.value)} placeholder="Причина отказа" />
                  </div>
                  <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
                    Реквизиты: {pr.payoutDetailsType ?? "нет"} · ИНН {pr.payoutDetailsInn ?? "—"} · KYC {pr.payoutDetailsKycStatus ?? "—"}.
                    Оферта: {pr.agentOfferAcceptedAt ? pr.agentOfferVersion ?? "принята" : "не принята"}.
                  </p>
                </div>
              )}

              {permissions.canManageRoles && (
                <div className="mt-3 rounded-md border border-[var(--soft-paper-edge)] p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <span className={LABEL}>Ручное включение записи</span>
                      <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">
                        {bookingOverride ? "Запись открыта вручную в обход коммерческих реквизитов." : "Запись закрыта до выполнения коммерческих условий."}
                      </p>
                    </div>
                    <button type="button" className="soft-admin-action" data-variant={bookingOverride ? "subtle" : "primary"} onClick={() => void toggleBookingOverride()} disabled={busy}>
                      {bookingOverride ? "Снять ручное включение" : "Включить запись"}
                    </button>
                  </div>
                </div>
              )}

              {/* V3: session tariffs as toggleable presets — one row per standard
                  duration with an enable checkbox + price (superadmin sets price). */}
              {permissions.canSetPractitionerRates && (
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
                <PractitionerTaxonomyFields
                  dense
                  value={{ categories, directions, tasks }}
                  onChange={(next) => {
                    setCategories(next.categories);
                    setDirections(next.directions);
                    setTasks(next.tasks);
                  }}
                />
              </div>
              <div className="mt-3">
                <SessionFormatsField dense value={formats} onChange={setFormats} />
              </div>
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
                  // Plain <a>, not next/link <Link>: the impersonate route is a
                  // GET with side effects (audit log + cookie). <Link> prefetches
                  // on hover/viewport, which fired phantom IMPERSONATE audit events
                  // just from opening this modal (Баг 3). A bare anchor never
                  // prefetches, so the route only runs on an explicit click.
                  <a className="soft-admin-action" href={`/api/admin/impersonate?userId=${row.id}`} target="_blank" rel="noopener noreferrer">
                    <LogIn className="size-3.5" aria-hidden="true" />
                    Войти как пользователь
                  </a>
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
