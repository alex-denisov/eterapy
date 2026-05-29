"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Ban, LogIn, Plus, RefreshCw, RotateCcw, Save, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_HEADER_CLASS,
  COMPACT_INPUT_CLASS,
  COMPACT_SELECT_CLASS,
} from "@/components/admin/compact-table";

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: "CLIENT" | "PRACTITIONER" | "ADMIN" | "SUPERADMIN";
  createdAt: string;
  emailVerified: boolean;
  deletedAt: string | null;
  blockedAt: string | null;
  freeToolsLimit: number | null;
  balance: number;
  clarityCredits: number;
  provider: string | null;
  telegramUsername: string | null;
  practitioner: {
    id: string;
    status: string;
    title: string;
    commissionPercent: number;
  } | null;
  moderatorPermissionsCount: number;
  bookingsCount: number;
  entitlementsCount: number;
  subscriptionsCount: number;
}

interface UsersControlPanelProps {
  rows: AdminUserRow[];
  page: number;
  pageSize: number;
  total: number;
  permissions: {
    canCreate: boolean;
    canEdit: boolean;
    canBlock: boolean;
    canResetPassword: boolean;
    canImpersonate: boolean;
    canManageRoles: boolean;
    canManageBalance: boolean;
  };
}

const ROLE_LABELS: Record<AdminUserRow["role"], string> = {
  CLIENT: "Клиент",
  PRACTITIONER: "Практик",
  ADMIN: "Модератор",
  SUPERADMIN: "Суперадмин",
};

// T4: acquisition channel derived from User.provider (already persisted).
// Unknown / missing provider falls back to "manual".
const CHANNEL_LABELS: Record<string, string> = {
  web: "Web", app: "App", telegram: "Telegram", vk: "VK", manual: "Manual",
};
function channelOf(provider: string | null): keyof typeof CHANNEL_LABELS {
  switch ((provider ?? "").toLowerCase()) {
    case "vk": return "vk";
    case "telegram": case "max": return "telegram";
    case "ios": case "android": return "app";
    case "web": case "google": case "mobile_web": return "web";
    case "": case "manual": return "manual";
    default: return "manual";
  }
}

function statusOf(row: AdminUserRow) {
  if (row.deletedAt) return { label: "Удалён", tone: "danger" };
  if (row.blockedAt) return { label: "Блок", tone: "danger" };
  if (!row.emailVerified) return { label: "Email нет", tone: "warn" };
  return { label: "Активен", tone: "ok" };
}

function makeUrl(searchParams: URLSearchParams, patch: Record<string, string | null>) {
  const next = new URLSearchParams(searchParams.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") next.delete(key);
    else next.set(key, value);
  }
  if (!("page" in patch)) next.set("page", "1");
  const query = next.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}

function SortHeader({ field, label }: { field: string; label: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("sort") === field;
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const nextDir = active && dir === "asc" ? "desc" : "asc";

  return (
    <button
      type="button"
      className="flex h-7 w-full items-center justify-between gap-1 px-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]"
      onClick={() => router.push(makeUrl(searchParams, { sort: field, dir: nextDir }))}
    >
      <span>{label}</span>
      <span className={active ? "text-[var(--soft-bordeaux)]" : "text-[var(--soft-ink-faint)]"}>
        {active ? (dir === "asc" ? "↑" : "↓") : "↕"}
      </span>
    </button>
  );
}

function PlainHeader({ label }: { label: string }) {
  return (
    <div className="flex h-7 items-center px-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">
      {label}
    </div>
  );
}

function FilterInput({
  param,
  placeholder,
}: {
  param: string;
  placeholder: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(param) ?? "");

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-[var(--soft-ink-faint)]" aria-hidden="true" />
      <input
        className={`${COMPACT_INPUT_CLASS} pl-5`}
        value={value}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") router.push(makeUrl(searchParams, { [param]: value.trim() }));
        }}
      />
    </div>
  );
}

function FilterSelect({
  param,
  options,
}: {
  param: string;
  options: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get(param) ?? "";
  return (
    <select
      className={COMPACT_SELECT_CLASS}
      value={value}
      onChange={(event) => router.push(makeUrl(searchParams, { [param]: event.target.value }))}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}

function CreateUserDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<"CLIENT" | "PRACTITIONER" | "ADMIN">("CLIENT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        name,
        email,
        password: password || undefined,
        title,
        bio,
        telegramUsername,
        sendResetLink: !password,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Не удалось создать пользователя");
      return;
    }
    toast.success("Пользователь создан");
    onClose();
    setName("");
    setEmail("");
    setPassword("");
    setTitle("");
    setBio("");
    setTelegramUsername("");
    startTransition(() => router.refresh());
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
      <div className="w-full max-w-2xl rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5 shadow-[var(--soft-shadow-lg)]">
        <div className="mb-4 flex items-center justify-between gap-4">
          <div>
            <h2 className="font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">Новый пользователь</h2>
            <p className="text-xs text-[var(--soft-ink-faint)]">Клиент получает reset-link, если пароль не задан вручную.</p>
          </div>
          <button type="button" className="soft-admin-action" data-variant="subtle" onClick={onClose} aria-label="Закрыть">
            <X className="size-3.5" aria-hidden="true" />
          </button>
        </div>
        <form onSubmit={submit} className="grid gap-3 md:grid-cols-2">
          <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
            Роль
            <select className="soft-admin-table-filter mt-1 h-9" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
              <option value="CLIENT">Клиент</option>
              <option value="PRACTITIONER">Практик</option>
              <option value="ADMIN">Модератор</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
            Имя
            <Input className="mt-1 h-9" value={name} onChange={(event) => setName(event.target.value)} required />
          </label>
          <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
            Email
            <Input className="mt-1 h-9" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
          </label>
          <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
            Пароль
            <Input className="mt-1 h-9" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="можно оставить пустым" />
          </label>
          <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
            Telegram
            <Input className="mt-1 h-9" value={telegramUsername} onChange={(event) => setTelegramUsername(event.target.value)} placeholder="@username" />
          </label>
          {role === "PRACTITIONER" && (
            <>
              <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
                Заголовок практика
                <Input className="mt-1 h-9" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Таролог · психолог" />
              </label>
              <label className="md:col-span-2 text-xs font-semibold text-[var(--soft-ink-soft)]">
                Описание
                <textarea className="soft-admin-table-filter mt-1 min-h-20 py-2" value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Коротко о подходе практика" />
              </label>
            </>
          )}
          <div className="md:col-span-2 mt-2 flex justify-end gap-2">
            <button type="button" className="soft-admin-action" data-variant="subtle" onClick={onClose}>Отмена</button>
            <button type="submit" className="soft-admin-action" data-variant="primary" disabled={pending || !name.trim() || !email.trim()}>
              {pending ? "Создаём..." : "Создать"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function UsersControlPanel({ rows, page, pageSize, total, permissions }: UsersControlPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  const [drafts, setDrafts] = useState(() => Object.fromEntries(rows.map((row) => [row.id, {
    name: row.name,
    role: row.role,
    freeToolsLimit: row.freeToolsLimit == null ? "" : String(row.freeToolsLimit),
    balanceRub: String(Math.round(row.balance / 100)),
    clarityCredits: String(row.clarityCredits),
  }])));

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const rowsById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);

  function updateDraft(id: string, patch: Partial<{ name: string; role: AdminUserRow["role"]; freeToolsLimit: string; balanceRub: string; clarityCredits: string }>) {
    setDrafts((current) => ({
      ...current,
      [id]: { ...current[id], ...patch },
    }));
  }

  async function saveRow(id: string) {
    const row = rowsById.get(id);
    const draft = drafts[id];
    if (!row || !draft) return;

    try {
      if (permissions.canEdit && draft.name.trim() && draft.name.trim() !== row.name) {
        const response = await fetch(`/api/admin/users/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "update_name", name: draft.name.trim() }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось обновить имя");
      }

      const patch: Record<string, unknown> = { userId: id };
      if (permissions.canManageRoles && draft.role !== row.role) patch.role = draft.role;
      if (permissions.canManageRoles && draft.freeToolsLimit !== String(row.freeToolsLimit ?? "")) {
        if (draft.freeToolsLimit.trim() === "") patch.freeToolsLimit = 0;
        else patch.freeToolsLimit = Number(draft.freeToolsLimit);
      }
      if (Object.keys(patch).length > 1) {
        const response = await fetch("/api/admin/users", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось обновить роль/лимит");
      }

      // T4: money balance — editable for any class; clarity credits — clients only.
      if (permissions.canManageBalance) {
        const nextRub = Number(draft.balanceRub);
        if (Number.isFinite(nextRub) && nextRub !== Math.round(row.balance / 100)) {
          const response = await fetch(`/api/admin/users/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "update_balance", balanceRub: nextRub, reason: "admin users table" }),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось обновить баланс");
        }

        if (row.role === "CLIENT") {
          const nextCredits = Number(draft.clarityCredits);
          if (Number.isInteger(nextCredits) && nextCredits !== row.clarityCredits) {
            const response = await fetch(`/api/admin/users/${id}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ action: "update_clarity_credits", clarityCredits: nextCredits, reason: "admin users table" }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось обновить кредиты ясности");
          }
        }
      }

      toast.success("Пользователь обновлён");
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Ошибка сохранения");
    }
  }

  async function userAction(id: string, action: "block" | "unblock" | "reset_password") {
    const response = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, comment: "admin users table" }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Действие не выполнено");
      return;
    }
    toast.success("Готово");
    startTransition(() => router.refresh());
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-[var(--soft-ink-faint)]">
          Показано {rows.length} из {total.toLocaleString("ru-RU")} · страница {page} / {pageCount}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="soft-admin-action" data-variant="subtle" onClick={() => router.refresh()} disabled={pending}>
            <RefreshCw className="size-3.5" aria-hidden="true" />
            Обновить
          </button>
          {permissions.canCreate && (
            <button type="button" className="soft-admin-action" data-variant="primary" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" aria-hidden="true" />
              Создать
            </button>
          )}
        </div>
      </div>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} />

      <CompactTableShell minWidth="1180px">
          <thead className="sticky top-0 z-10 bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <th className={COMPACT_HEADER_CLASS}>
                <SortHeader field="name" label="Имя" />
                <FilterInput param="q" placeholder="имя/email" />
              </th>
              <th className={COMPACT_HEADER_CLASS}>
                <SortHeader field="role" label="Роль" />
                <FilterSelect
                  param="role"
                  options={[
                    { value: "", label: "Все роли" },
                    { value: "CLIENT", label: "Клиенты" },
                    { value: "PRACTITIONER", label: "Практики" },
                    { value: "ADMIN", label: "Модераторы" },
                    { value: "SUPERADMIN", label: "Суперадмины" },
                  ]}
                />
              </th>
              <th className={COMPACT_HEADER_CLASS}>
                <PlainHeader label="Канал" />
                <FilterSelect
                  param="channel"
                  options={[
                    { value: "", label: "Все каналы" },
                    { value: "web", label: "Web" },
                    { value: "app", label: "App" },
                    { value: "telegram", label: "Telegram" },
                    { value: "vk", label: "VK" },
                    { value: "manual", label: "Manual" },
                  ]}
                />
              </th>
              <th className={COMPACT_HEADER_CLASS}>
                <SortHeader field="status" label="Статус" />
                <FilterSelect
                  param="status"
                  options={[
                    { value: "", label: "Все статусы" },
                    { value: "active", label: "Активные" },
                    { value: "blocked", label: "Блок" },
                    { value: "deleted", label: "Удалённые" },
                    { value: "unverified", label: "Email нет" },
                  ]}
                />
              </th>
              <th className={COMPACT_HEADER_CLASS}><SortHeader field="balance" label="Баланс · кредиты" /></th>
              <th className={COMPACT_HEADER_CLASS}><SortHeader field="createdAt" label="Регистрация" /></th>
              <th className={COMPACT_HEADER_CLASS}><PlainHeader label="Лимит" /></th>
              <th className={COMPACT_HEADER_CLASS}><PlainHeader label="Активность" /></th>
              <th className={COMPACT_HEADER_CLASS}><PlainHeader label="Профиль роли" /></th>
              <th className={`${COMPACT_HEADER_CLASS} border-r-0`}><PlainHeader label="Действия" /></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">Пользователи не найдены</td>
              </tr>
            ) : rows.map((row) => {
              const draft = drafts[row.id] ?? { name: row.name, role: row.role, freeToolsLimit: "" };
              const status = statusOf(row);
              const canEditName = permissions.canEdit && row.role !== "SUPERADMIN";
              const canManageRole = permissions.canManageRoles && row.role !== "SUPERADMIN";
              return (
                <tr key={row.id} className="hover:bg-[var(--soft-surface)]">
                  <td className={`${COMPACT_CELL_CLASS} min-w-[14rem]`}>
                    <input
                      className={COMPACT_INPUT_CLASS}
                      value={draft.name}
                      disabled={!canEditName}
                      onChange={(event) => updateDraft(row.id, { name: event.target.value })}
                    />
                    <div className="mt-0.5 truncate text-[10px] text-[var(--soft-ink-faint)]">{row.email}</div>
                  </td>
                  <td className={COMPACT_CELL_CLASS}>
                    <select
                      className={COMPACT_SELECT_CLASS}
                      value={draft.role}
                      disabled={!canManageRole}
                      onChange={(event) => updateDraft(row.id, { role: event.target.value as AdminUserRow["role"] })}
                    >
                      {Object.entries(ROLE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </td>
                  <td className={COMPACT_CELL_CLASS}><span className="soft-admin-status-pill">{CHANNEL_LABELS[channelOf(row.provider)]}</span></td>
                  <td className={COMPACT_CELL_CLASS}><span className="soft-admin-status-pill" data-tone={status.tone}>{status.label}</span></td>
                  <td className={COMPACT_CELL_CLASS}>
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-1">
                        <input
                          className={`${COMPACT_INPUT_CLASS} w-20`}
                          value={draft.balanceRub}
                          disabled={!permissions.canManageBalance || row.role === "SUPERADMIN"}
                          inputMode="numeric"
                          onChange={(event) => updateDraft(row.id, { balanceRub: event.target.value })}
                          aria-label={`Денежный баланс ${row.email}`}
                          title="Денежный баланс, ₽"
                        />
                        <span className="text-[10px] text-[var(--soft-ink-faint)]">₽</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <input
                          className={`${COMPACT_INPUT_CLASS} w-20 disabled:opacity-40`}
                          value={row.role === "CLIENT" ? draft.clarityCredits : "—"}
                          disabled={!permissions.canManageBalance || row.role !== "CLIENT"}
                          inputMode="numeric"
                          onChange={(event) => updateDraft(row.id, { clarityCredits: event.target.value })}
                          aria-label={`Кредиты ясности ${row.email}`}
                          title={row.role === "CLIENT" ? "Кредиты ясности" : "Кредиты ясности доступны только клиентам"}
                        />
                        <span className="text-[10px] text-[var(--soft-ink-faint)]">кр.</span>
                      </div>
                    </div>
                  </td>
                  <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap text-[var(--soft-ink-soft)]`}>{new Date(row.createdAt).toLocaleDateString("ru-RU")}</td>
                  <td className={COMPACT_CELL_CLASS}>
                    <input
                      className={`${COMPACT_INPUT_CLASS} w-16`}
                      value={draft.freeToolsLimit}
                      disabled={!permissions.canManageRoles}
                      placeholder="0"
                      inputMode="numeric"
                      onChange={(event) => updateDraft(row.id, { freeToolsLimit: event.target.value })}
                    />
                  </td>
                  <td className={COMPACT_CELL_CLASS}>
                    <div className="flex gap-1 text-center text-[10px]">
                      <span className="soft-admin-status-pill">{row.bookingsCount} B</span>
                      <span className="soft-admin-status-pill">{row.entitlementsCount} P</span>
                      <span className="soft-admin-status-pill">{row.subscriptionsCount} S</span>
                    </div>
                  </td>
                  <td className={`${COMPACT_CELL_CLASS} min-w-[10rem]`}>
                    {row.role === "PRACTITIONER" && row.practitioner ? (
                      <Link className="soft-admin-action" href={`/admin/practitioners?email=${encodeURIComponent(row.email)}`}>
                        {row.practitioner.status} · {row.practitioner.commissionPercent}%
                      </Link>
                    ) : row.role === "ADMIN" ? (
                      <Link className="soft-admin-action" href="/admin/moderators">
                        права: {row.moderatorPermissionsCount}
                      </Link>
                    ) : row.role === "CLIENT" ? (
                      <Link className="soft-admin-action" href={`/admin/bookings?search=${encodeURIComponent(row.email)}`}>
                        бронирования
                      </Link>
                    ) : (
                      <span className="soft-admin-status-pill">core</span>
                    )}
                  </td>
                  <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" className="soft-admin-action" data-variant="primary" onClick={() => void saveRow(row.id)} disabled={pending || row.role === "SUPERADMIN"}>
                        <Save className="size-3.5" aria-hidden="true" />
                        Save
                      </button>
                      {permissions.canResetPassword && row.role !== "SUPERADMIN" && (
                        <button type="button" className="soft-admin-action" onClick={() => void userAction(row.id, "reset_password")}>
                          <RotateCcw className="size-3.5" aria-hidden="true" />
                          Reset
                        </button>
                      )}
                      {permissions.canBlock && row.role !== "SUPERADMIN" && (
                        <button
                          type="button"
                          className="soft-admin-action"
                          data-variant={row.blockedAt ? "subtle" : "danger"}
                          onClick={() => void userAction(row.id, row.blockedAt ? "unblock" : "block")}
                        >
                          <Ban className="size-3.5" aria-hidden="true" />
                          {row.blockedAt ? "Unblock" : "Block"}
                        </button>
                      )}
                      {permissions.canImpersonate && row.role !== "SUPERADMIN" && (
                        <Link className="soft-admin-action" href={`/api/admin/impersonate?userId=${row.id}`} target="_blank">
                          <LogIn className="size-3.5" aria-hidden="true" />
                          Login
                        </Link>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
      </CompactTableShell>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link className="soft-admin-action" data-variant="subtle" href={makeUrl(searchParams, { page: String(Math.max(1, page - 1)) })} aria-disabled={page <= 1}>
          Назад
        </Link>
        <div className="text-xs text-[var(--soft-ink-faint)]">{page} / {pageCount}</div>
        <Link className="soft-admin-action" data-variant="subtle" href={makeUrl(searchParams, { page: String(Math.min(pageCount, page + 1)) })} aria-disabled={page >= pageCount}>
          Вперёд
        </Link>
      </div>
    </div>
  );
}
