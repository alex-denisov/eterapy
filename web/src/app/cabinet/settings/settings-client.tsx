"use client";

// B464 round-4 #16 — Настройки по утверждённому направлению: grouped rows на
// одном экране (Профиль · О себе · Безопасность · Уведомления · Удаление) с
// якорной навигацией, вместо табов. Все обработчики сохранены 1:1.

import { useState, useRef, useEffect, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import Image from "next/image";
import { NotificationSettings } from "@/components/notifications/notification-settings";
import { validateBirthDate, formatDateForServer } from "@/lib/date-utils";
import { sanitizeName, getNameError, sanitizeText } from "@/lib/validation";
import { logoutUrl } from "@/lib/subdomain";

interface TelegramStatus {
  linked: boolean;
  username: string | null;
}

type LoginProvider = "google" | "vk" | "telegram" | "apple";

const LOGIN_PROVIDER_LABELS: Record<LoginProvider, string> = {
  google: "Google",
  vk: "ВКонтакте",
  telegram: "Telegram",
  apple: "Apple",
};

// Round-5 #11 — grouped rows по утверждённому направлению: карточка-группа =
// шапка + список строк «название · текущее значение · шеврон», редактор
// раскрывается прямо в строке (<details>). Обработчики и поля сохранены 1:1 —
// меняется только компоновка.
function SettingsGroup({
  id,
  eyebrow,
  title,
  intro,
  testId,
  children,
}: {
  id: string;
  eyebrow: string;
  title?: string;
  intro?: React.ReactNode;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="soft-card scroll-mt-24 overflow-hidden p-0" data-testid={testId}>
      <div className="border-b border-[var(--soft-paper-edge)] px-5 py-4">
        <p className="soft-eyebrow">{eyebrow}</p>
        {title && <h2 className="soft-h3 mt-1">{title}</h2>}
        {intro}
      </div>
      <div className="divide-y divide-[var(--soft-paper-edge)]">{children}</div>
    </section>
  );
}

function SettingsRow({
  label,
  value,
  danger = false,
  defaultOpen = false,
  testId,
  children,
}: {
  label: string;
  value?: React.ReactNode;
  danger?: boolean;
  defaultOpen?: boolean;
  testId?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group" open={defaultOpen} data-testid={testId}>
      <summary className="flex cursor-pointer select-none list-none items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[var(--soft-paper-card)] [&::-webkit-details-marker]:hidden">
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-medium ${danger ? "text-[#b02020]" : "text-[var(--soft-ink)]"}`}>{label}</span>
          {value ? <span className="mt-0.5 block truncate text-xs text-[var(--soft-ink-soft)]">{value}</span> : null}
        </span>
        <ChevronDown className="size-4 shrink-0 text-[var(--soft-ink-faint)] transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="px-5 pb-5 pt-1">{children}</div>
    </details>
  );
}

function SettingsStaticRow({
  label,
  value,
  action,
}: {
  label: string;
  value?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 px-5 py-3.5">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-[var(--soft-ink)]">{label}</span>
        {value ? <span className="mt-0.5 block truncate text-xs text-[var(--soft-ink-soft)]">{value}</span> : null}
      </span>
      {action}
    </div>
  );
}

export function SettingsClient({ telegramStatus, hasPassword, linkedProviders = [] }: { telegramStatus: TelegramStatus, hasPassword?: boolean, linkedProviders?: LoginProvider[] }) {
  const { data: session, status, update } = useSession();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);

  const [currentPwd, setCurrentPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [requestingSetPassword, setRequestingSetPassword] = useState(false);
  const [unlinkingProvider, setUnlinkingProvider] = useState<LoginProvider | null>(null);
  const [connectedProviders, setConnectedProviders] = useState<LoginProvider[]>(linkedProviders);

  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteConfirmError, setDeleteConfirmError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (status === "loading") return null;
  if (!session) { router.push("/login"); return null; }

  const role = session.user?.role ?? "CLIENT";
  const email = session.user?.email ?? "";
  const currentName = session.user?.name ?? "";
  const [fn, ln] = currentName.includes(" ")
    ? [currentName.split(" ")[0], currentName.split(" ").slice(1).join(" ")]
    : [currentName, ""];

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { toast.error("Максимум 5 МБ"); return; }
    setAvatarFile(file);
    const reader = new FileReader();
    reader.onload = ev => setAvatarPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    const name = `${firstName || fn} ${lastName || ln}`.trim();
    if (!name) { toast.error("Заполните имя"); return; }
    const nErr = getNameError(name);
    if (nErr) { setNameError(nErr); toast.error(nErr); return; }
    setNameError(null);
    setSaving(true);
    try {
      const formData = new FormData();
      formData.append("name", name);
      if (avatarFile) formData.append("avatar", avatarFile);
      const res = await fetch("/api/auth/update-profile", { method: "POST", body: formData });
      const d = await res.json();
      if (d.ok) { await update({ name }); toast.success("Профиль обновлён"); setAvatarFile(null); }
      else toast.error(d.error || "Ошибка");
    } catch { toast.error("Ошибка"); }
    finally { setSaving(false); }
  }

  async function handleSavePassword(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) { toast.error("Пароли не совпадают"); return; }
    if (newPwd.length < 8) { toast.error("Минимум 8 символов"); return; }
    setSavingPwd(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword: currentPwd, newPassword: newPwd }),
      });
      const d = await res.json();
      if (d.ok) { toast.success("Пароль изменён"); setCurrentPwd(""); setNewPwd(""); setConfirmPwd(""); }
      else toast.error(d.error || "Ошибка");
    } catch { toast.error("Ошибка"); }
    finally { setSavingPwd(false); }
  }

  async function handleSetPasswordRequest() {
    setRequestingSetPassword(true);
    try {
      const res = await fetch("/api/auth/set-password-request", { method: "POST" });
      const d = await res.json().catch(() => ({ ok: false, error: "Не удалось отправить письмо" }));
      if (res.ok && d.ok) toast.success("Письмо для назначения пароля отправлено");
      else toast.error(d.error || "Не удалось отправить письмо");
    } catch {
      toast.error("Ошибка сети — попробуйте ещё раз");
    } finally {
      setRequestingSetPassword(false);
    }
  }

  async function handleUnlinkProvider(provider: LoginProvider) {
    setUnlinkingProvider(provider);
    try {
      const res = await fetch(`/api/auth/social-link/${provider}`, { method: "DELETE" });
      const d = await res.json().catch(() => ({ ok: false, error: "Не удалось отключить способ входа" }));
      if (res.ok && d.ok) {
        setConnectedProviders((prev) => prev.filter((item) => item !== provider));
        toast.success(`${LOGIN_PROVIDER_LABELS[provider]} отключён`);
      } else {
        toast.error(d.error || "Не удалось отключить способ входа");
      }
    } catch {
      toast.error("Ошибка сети — попробуйте ещё раз");
    } finally {
      setUnlinkingProvider(null);
    }
  }

  async function handleDeleteAccount() {
    setDeleteConfirmError(null);
    if (!deleteConfirm) {
      setDeleteConfirmError("Введите email для подтверждения");
      toast.error("Введите email для подтверждения");
      return;
    }
    if (deleteConfirm !== email) {
      setDeleteConfirmError("Email введен неверно");
      toast.error("Email введен неверно");
      return;
    }
    setDeleting(true);
    try {
      const res = await fetch("/api/auth/deactivate", { method: "POST" });
      const d = await res.json();
      if (d.ok) window.location.href = logoutUrl();
      else toast.error(d.error || "Ошибка");
    } catch { toast.error("Ошибка"); }
    finally { setDeleting(false); }
  }

  const displayAvatar = avatarPreview ?? (session.user?.image || null);
  const initial = currentName[0]?.toUpperCase() ?? "?";

  const isClient = role === "CLIENT";
  const showDanger = role !== "ADMIN" && role !== "SUPERADMIN";
  const anchors: Array<{ id: string; label: string }> = [
    { id: "settings-profile", label: "Профиль" },
    ...(isClient ? [{ id: "settings-about", label: "О себе" }] : []),
    { id: "settings-security", label: "Безопасность" },
    { id: "settings-notifications", label: "Уведомления" },
    ...(showDanger ? [{ id: "settings-danger", label: "Удаление" }] : []),
  ];

  return (
    <div className="max-w-3xl px-6 py-8" data-testid="settings-page">
      <p className="soft-eyebrow">Настройки аккаунта</p>
      <h1 className="soft-h2 mt-2">Настройки</h1>

      {/* Anchor rail — the grouped sections live on one scroll. */}
      <div className="mb-6 mt-4 flex flex-wrap gap-1.5" data-testid="settings-anchors">
        {anchors.map((a) => (
          <a key={a.id} href={`#${a.id}`} className="soft-chip">{a.label}</a>
        ))}
      </div>

      <div className="grid gap-5">
        {/* ── Профиль ── */}
        <SettingsGroup id="settings-profile" eyebrow="профиль" testId="settings-group-profile">
          <SettingsRow label="Имя и фото" value={currentName || "не заполнено"} testId="settings-row-name">
          <form onSubmit={handleSaveProfile} className="space-y-5">
            <div className="flex items-center gap-4">
              <button type="button" onClick={() => fileRef.current?.click()} className="relative group shrink-0">
                <div className="h-16 w-16 rounded-full overflow-hidden border-2 border-[var(--soft-paper-edge)] group-hover:border-[var(--soft-terracotta)]/50 transition-colors">
                  {displayAvatar ? (
                    <Image src={displayAvatar} alt="Аватар" width={64} height={64} className="h-full w-full object-cover" />
                  ) : (
                    <div className="soft-avatar-fallback h-full w-full flex items-center justify-center font-heading text-2xl font-bold">
                      {initial}
                    </div>
                  )}
                </div>
                <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs">
                  Изменить
                </div>
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
              <div>
                <p className="text-sm font-medium">{currentName}</p>
                <button type="button" onClick={() => fileRef.current?.click()} className="mt-0.5 text-xs text-[var(--soft-bordeaux)] hover:underline">
                  Загрузить фото
                </button>
                <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">JPG, PNG или WebP · до 5 МБ</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm text-[var(--soft-ink-soft)]">Имя</label>
                <Input value={firstName || fn} onChange={e => { setFirstName(sanitizeName(e.target.value)); setNameError(null); }} placeholder="Имя" className={nameError ? "border-destructive" : ""} />
              </div>
              <div>
                <label className="mb-1 block text-sm text-[var(--soft-ink-soft)]">Фамилия</label>
                <Input value={lastName || ln} onChange={e => { setLastName(sanitizeName(e.target.value)); setNameError(null); }} placeholder="Фамилия" className={nameError ? "border-destructive" : ""} />
              </div>
            </div>
            {nameError && <p className="-mt-3 text-xs text-destructive">{nameError}</p>}

            <button type="submit" disabled={saving} className="soft-button soft-button-primary">
              {saving ? "Сохранение..." : "Сохранить профиль"}
            </button>
          </form>
          </SettingsRow>
          <SettingsStaticRow
            label="Email"
            value={email}
            action={
              <span className="shrink-0 text-xs text-[var(--soft-ink-faint)]">
                изменить — через support@eterapy.com
              </span>
            }
          />
        </SettingsGroup>

        {/* ── О себе (клиент) — the personalization store ── */}
        {isClient && (
          <SettingsGroup
            id="settings-about"
            eyebrow="о себе"
            title="Чтобы результаты были точнее"
            intro={
              <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">
                Используется только для персонализации результатов — не передаётся практикам и не видно другим.
              </p>
            }
            testId="settings-group-about"
          >
            <ExtendedProfileFields />
          </SettingsGroup>
        )}

        {/* ── Безопасность ── */}
        <SettingsGroup id="settings-security" eyebrow="безопасность" testId="settings-group-security">
          <SettingsRow
            label={hasPassword === false ? "Пароль для входа" : "Пароль"}
            value={hasPassword === false ? "не назначен — вход через внешний сервис" : "сменить пароль для входа"}
            testId="settings-row-password"
          >
            {hasPassword === false ? (
              <div className="rounded-xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 text-sm text-[var(--soft-ink-soft)]" data-testid="set-password-panel">
                <p>Сейчас вход привязан к внешнему сервису. Назначьте пароль по email, чтобы входить напрямую и безопасно отключать соцлогины.</p>
                <button type="button" onClick={handleSetPasswordRequest} disabled={requestingSetPassword} className="soft-button soft-button-primary mt-4">
                  {requestingSetPassword ? "Отправляем..." : "Отправить письмо для пароля"}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSavePassword} className="space-y-4">
                <div>
                  <label className="mb-1 block text-sm" style={{ color: "var(--soft-ink-soft)" }}>Текущий пароль</label>
                  <Input type="password" value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} autoComplete="current-password" />
                </div>
                <div>
                  <label className="mb-1 block text-sm" style={{ color: "var(--soft-ink-soft)" }}>Новый пароль</label>
                  <Input type="password" value={newPwd} onChange={e => setNewPwd(e.target.value)} autoComplete="new-password" />
                </div>
                <div>
                  <label className="mb-1 block text-sm" style={{ color: "var(--soft-ink-soft)" }}>Повторите новый пароль</label>
                  <Input type="password" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} autoComplete="new-password" />
                </div>
                <button type="submit" disabled={savingPwd || !currentPwd || !newPwd} className="soft-button soft-button-primary">
                  {savingPwd ? "Сохранение..." : "Изменить пароль"}
                </button>
              </form>
            )}
          </SettingsRow>

          <SettingsRow
            label="Способы входа"
            value={connectedProviders.length > 0
              ? connectedProviders.map((p) => LOGIN_PROVIDER_LABELS[p]).join(", ")
              : "социальные входы не подключены"}
            testId="linked-login-methods"
          >
            <div className="space-y-2">
              {connectedProviders.length === 0 ? (
                <p className="text-sm text-[var(--soft-ink-soft)]">Социальные входы не подключены.</p>
              ) : connectedProviders.map((provider) => (
                <div key={provider} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-4 py-3">
                  <div>
                    <p className="text-sm font-medium text-[var(--soft-ink)]">{LOGIN_PROVIDER_LABELS[provider]}</p>
                    <p className="text-xs text-[var(--soft-ink-soft)]">Подключён как способ входа</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnlinkProvider(provider)}
                    disabled={unlinkingProvider === provider}
                    className="soft-button soft-button-ghost h-9 px-4 text-sm"
                  >
                    {unlinkingProvider === provider ? "Отключаем..." : "Отключить"}
                  </button>
                </div>
              ))}
            </div>
          </SettingsRow>
        </SettingsGroup>

        {/* ── Уведомления ── */}
        <section id="settings-notifications" className="scroll-mt-24" data-testid="settings-group-notifications">
          <NotificationSettings telegramStatus={telegramStatus} role={role as "CLIENT" | "PRACTITIONER" | "ADMIN" | "SUPERADMIN" | "MODERATOR"} />
        </section>

        {/* ── Удаление ── */}
        {showDanger && (
          <SettingsGroup id="settings-danger" eyebrow="данные и удаление" testId="settings-group-danger">
            <SettingsStaticRow
              label="Экспорт личных данных"
              value="профиль, вопросы, результаты, маршруты, записи и уведомления"
              action={
                <button type="button" onClick={() => { window.location.href = "/api/auth/export-data"; }}
                  className="soft-button soft-button-ghost h-9 shrink-0 px-4 text-sm">
                  Скачать JSON
                </button>
              }
            />
            <SettingsRow
              label={role === "PRACTITIONER" ? "Деактивация аккаунта" : "Удаление аккаунта"}
              value={role === "PRACTITIONER" ? "аккаунт будет скрыт из каталога" : "деактивация сразу, полное удаление через 10 дней"}
              danger
              testId="settings-row-delete"
            >
            {role === "PRACTITIONER" ? (
              <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
                Аккаунт будет скрыт из каталога. Для восстановления или полного удаления данных напишите на{" "}
                <a href="mailto:support@eterapy.com" className="text-[var(--soft-bordeaux)] hover:underline">support@eterapy.com</a>.
              </p>
            ) : (
              <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
                Аккаунт деактивируется немедленно. Через 10 дней данные будут удалены безвозвратно.
                Вы можете отменить удаление, войдя в аккаунт в течение 10 дней.
              </p>
            )}
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm text-[var(--soft-ink-soft)]">
                  Введите ваш email ({email}) для подтверждения
                </label>
                <Input value={deleteConfirm} onChange={e => { setDeleteConfirm(e.target.value); setDeleteConfirmError(null); }}
                  placeholder={email} className={`max-w-xs border-destructive/30 ${deleteConfirmError ? "border-destructive" : ""}`} />
                {deleteConfirmError && <p className="mt-1 text-xs text-destructive">{deleteConfirmError}</p>}
              </div>
              <button type="button" disabled={deleting} onClick={handleDeleteAccount} className="soft-button" style={{ background: "#b02020", color: "#fff" }}>
                {deleting ? "Деактивация..." : role === "PRACTITIONER" ? "Деактивировать аккаунт" : "Удалить аккаунт"}
              </button>
            </div>
            </SettingsRow>
          </SettingsGroup>
        )}
      </div>
    </div>
  );
}

const GOALS = [
  { value: "relationships", label: "Отношения" },
  { value: "career",        label: "Карьера" },
  { value: "selfdev",       label: "Саморазвитие" },
  { value: "health",        label: "Здоровье" },
  { value: "finance",       label: "Финансы" },
  { value: "family",        label: "Семья" },
  { value: "creativity",    label: "Творчество" },
  { value: "spirituality",  label: "Духовность" },
];

const MARITAL_OPTIONS = [
  { value: "single",    label: "Не состою в отношениях" },
  { value: "dating",    label: "В отношениях" },
  { value: "married",   label: "Женат/замужем" },
  { value: "divorced",  label: "В разводе" },
  { value: "widowed",   label: "Вдовец/вдова" },
];

// The «О себе» fields, rendered inside the grouped section (no own card).
function ExtendedProfileFields() {
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [timezone, setTimezone] = useState("");
  const [maritalStatus, setMaritalStatus] = useState("");
  const [occupation, setOccupation] = useState("");
  const [aiGoals, setAiGoals] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dateError, setDateError] = useState("");

  // Auto-detect timezone on mount
  const detectedTimezone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return "";
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/extended-profile")
      .then(r => r.json())
      .then(d => {
        const p = d.profile;
        if (!p) return;
        if (p.birthDate) {
          // birthDate from API should be "YYYY-MM-DD", but handle full ISO too.
          const raw = typeof p.birthDate === "string" ? p.birthDate.trim() : "";
          let year: string, month: string, day: string;
          if (raw.includes("T")) {
            // Full ISO string like "1988-03-03T12:00:00.000Z"
            const datePart = raw.split("T")[0];
            [year, month, day] = datePart.split("-");
          } else if (raw.includes("-")) {
            // "YYYY-MM-DD" format
            [year, month, day] = raw.split("-");
          } else if (raw.includes(".")) {
            // "DD.MM.YYYY" format (already formatted)
            const parts = raw.split(".");
            if (parts.length === 3) {
              day = parts[0];
              month = parts[1];
              year = parts[2];
            } else {
              return;
            }
          } else {
            return;
          }
          if (year && month && day) {
            setBirthDate(`${day.padStart(2, "0")}.${month.padStart(2, "0")}.${year}`);
          }
        }
        if (p.birthTime) setBirthTime(p.birthTime);
        if (p.birthPlace) setBirthPlace(p.birthPlace);
        if (p.timezone) setTimezone(p.timezone);
        else if (detectedTimezone) setTimezone(detectedTimezone);
        if (p.maritalStatus) setMaritalStatus(p.maritalStatus);
        if (p.occupation) setOccupation(p.occupation);
        if (p.aiGoals) setAiGoals(p.aiGoals);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [detectedTimezone]);

  function toggleGoal(v: string) {
    setAiGoals(prev => prev.includes(v) ? prev.filter(g => g !== v) : [...prev, v]);
  }

  async function handleSave() {
    if (birthDate) {
      const err = validateBirthDate(birthDate);
      if (err) {
        setDateError(err);
        toast.error("Исправьте дату рождения");
        return;
      }
    }
    // Механика 3: a fetch/parse error must never leave the button stuck on
    // "Сохранение…". Reset the flag in finally and surface the failure.
    setSaving(true);
    try {
      const res = await fetch("/api/auth/extended-profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate: formatDateForServer(birthDate), birthTime, birthPlace, timezone, maritalStatus, occupation, aiGoals }),
      });
      const d = await res.json().catch(() => ({ ok: false, error: "Не удалось сохранить" }));
      if (res.ok && d.ok) {
        toast.success("Профиль обновлён — результаты станут точнее");
      } else {
        toast.error(d.error || "Не удалось сохранить профиль");
      }
    } catch {
      toast.error("Ошибка сети — попробуйте ещё раз");
    } finally {
      setSaving(false);
    }
  }

  if (!loaded) return <div className="animate-pulse px-5 py-4 text-sm text-[var(--soft-ink-soft)]">Загружаем...</div>;

  // Round-5 #11: краткие «текущие значения» в строках-группах.
  const maritalLabel = MARITAL_OPTIONS.find((option) => option.value === maritalStatus)?.label;
  const birthSummary = [birthDate, birthPlace].filter(Boolean).join(" · ") || "не заполнено";
  const lifeSummary = [maritalLabel, occupation].filter(Boolean).join(" · ") || "не заполнено";
  const goalsSummary = aiGoals.length > 0
    ? GOALS.filter((goal) => aiGoals.includes(goal.value)).map((goal) => goal.label).join(", ")
    : "не выбраны";

  return (
    <>
      <SettingsRow label="Дата, время и место рождения" value={birthSummary} testId="settings-row-birth">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs text-[var(--soft-ink-soft)]">Дата рождения</label>
            <Input
              placeholder="ДД.ММ.ГГГГ"
              value={birthDate}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                let formatted = "";
                if (digits.length > 0) formatted += digits.slice(0, 2);
                if (digits.length > 2) formatted += "." + digits.slice(2, 4);
                if (digits.length > 4) formatted += "." + digits.slice(4, 8);
                setBirthDate(formatted);
                if (formatted.length === 10) {
                  const err = validateBirthDate(formatted);
                  setDateError(err || "");
                } else {
                  setDateError("");
                }
              }}
              className={dateError ? "border-destructive" : ""}
            />
            {dateError && <p className="mt-1 text-xs text-destructive">{dateError}</p>}
            <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">Источник фиксируется в журнале: вручную или из VK.</p>
          </div>
          <div>
            <label className="mb-1 block text-xs text-[var(--soft-ink-soft)]">Время рождения (необязательно)</label>
            <Input type="time" value={birthTime} onChange={e => setBirthTime(e.target.value)} />
            <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">Нужно для точной натальной карты</p>
          </div>
        </div>

      {/* Место рождения */}
      <div>
        <label className="mb-1 block text-sm font-medium">Место рождения</label>
        <Input value={birthPlace} onChange={e => setBirthPlace(sanitizeName(e.target.value))}
          placeholder="Город" />
      </div>

      {/* Часовой пояс */}
      <div>
        <label className="mb-1 block text-sm font-medium">Часовой пояс</label>
        <select
          value={timezone}
          onChange={e => setTimezone(e.target.value)}
          className="soft-input h-11 w-full px-4 py-2 text-base md:text-sm"
        >
          <option value="">Не выбран</option>
          <option value="Europe/Kaliningrad">Калининград (UTC+2)</option>
          <option value="Europe/Moscow">Москва (UTC+3)</option>
          <option value="Europe/Samara">Самара (UTC+4)</option>
          <option value="Asia/Yekaterinburg">Екатеринбург (UTC+5)</option>
          <option value="Asia/Omsk">Омск (UTC+6)</option>
          <option value="Asia/Krasnoyarsk">Красноярск (UTC+7)</option>
          <option value="Asia/Irkutsk">Иркутск (UTC+8)</option>
          <option value="Asia/Yakutsk">Якутск (UTC+9)</option>
          <option value="Asia/Vladivostok">Владивосток (UTC+10)</option>
          <option value="Asia/Kamchatka">Камчатка (UTC+12)</option>
          <option value="Europe/London">Лондон (UTC+0)</option>
          <option value="Europe/Berlin">Берлин (UTC+1)</option>
          <option value="Europe/Paris">Париж (UTC+1)</option>
          <option value="Europe/Helsinki">Хельсинки (UTC+2)</option>
          <option value="Asia/Dubai">Дубай (UTC+4)</option>
          <option value="Asia/Tashkent">Ташкент (UTC+5)</option>
          <option value="Asia/Almaty">Алматы (UTC+6)</option>
          <option value="Asia/Bangkok">Бангкок (UTC+7)</option>
          <option value="Asia/Shanghai">Шанхай (UTC+8)</option>
          <option value="Asia/Tokyo">Токио (UTC+9)</option>
          <option value="America/New_York">Нью-Йорк (UTC-5)</option>
          <option value="America/Chicago">Чикаго (UTC-6)</option>
          <option value="America/Los_Angeles">Лос-Анджелес (UTC-8)</option>
        </select>
        {detectedTimezone && !timezone && (
          <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">
            Определён автоматически: {detectedTimezone}
          </p>
        )}
      </div>
      </div>
      </SettingsRow>

      <SettingsRow label="Семейное положение и занятость" value={lifeSummary} testId="settings-row-life">
      <div className="space-y-4">
      {/* Семейное положение */}
      <div>
        <label className="mb-2 block text-sm font-medium">Семейное положение</label>
        <div className="flex flex-wrap gap-2">
          {MARITAL_OPTIONS.map(opt => (
            <button key={opt.value} type="button" onClick={() => setMaritalStatus(maritalStatus === opt.value ? "" : opt.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                maritalStatus === opt.value
                  ? "border-[var(--soft-bordeaux)] bg-[var(--soft-apricot)] font-medium text-[var(--soft-bordeaux)]"
                  : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-bordeaux)]/40"
              }`}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Деятельность */}
      <div>
        <label className="mb-1 block text-sm font-medium">Чем вы занимаетесь</label>
        <Input value={occupation} onChange={e => setOccupation(sanitizeText(e.target.value, 100))}
          placeholder="Предприниматель, дизайнер, менеджер..." />
        <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">{occupation.length} / 100 символов</p>
      </div>
      </div>
      </SettingsRow>

      <SettingsRow label="Темы, которые вас интересуют" value={goalsSummary} testId="settings-row-goals">
      {/* Цели */}
      <div>
        <label className="mb-2 block text-sm font-medium">Что вас интересует больше всего</label>
        <div className="flex flex-wrap gap-2">
          {GOALS.map(g => (
            <button key={g.value} type="button" onClick={() => toggleGoal(g.value)}
              className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                aiGoals.includes(g.value)
                  ? "border-[var(--soft-bordeaux)] bg-[var(--soft-apricot)] font-medium text-[var(--soft-bordeaux)]"
                  : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] hover:border-[var(--soft-bordeaux)]/40"
              }`}>
              {g.label}
            </button>
          ))}
        </div>
        <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">Выберите все что подходит — это помогает давать более точные результаты</p>
      </div>
      </SettingsRow>

      <div className="px-5 py-4">
        <button type="button" onClick={handleSave} disabled={saving} className="soft-button soft-button-primary">
          {saving ? "Сохранение..." : "Сохранить"}
        </button>
      </div>
    </>
  );
}
