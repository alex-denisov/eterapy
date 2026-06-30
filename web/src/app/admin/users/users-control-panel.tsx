"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, ChevronsUpDown, Pencil, Plus, RefreshCw, Search, X } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import {
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_HEADER_CLASS,
  COMPACT_INPUT_CLASS,
  COMPACT_SELECT_CLASS,
} from "@/components/admin/compact-table";
import {
  type AdminUserRow,
  type UserPermissions,
  ROLE_LABELS,
  SESSION_DURATIONS,
  roleColor,
  channelLabel,
  channelColor,
  statusOf,
} from "./user-display";
import { UserEditModal } from "./user-edit-modal";
import { PractitionerTaxonomyFields } from "@/components/practitioner/taxonomy-fields";
import { specialtiesForDirections } from "@/lib/practitioner-taxonomy";

export type { AdminUserRow } from "./user-display";

interface UsersControlPanelProps {
  rows: AdminUserRow[];
  page: number;
  pageSize: number;
  total: number;
  permissions: UserPermissions;
}

function makeUrl(searchParams: URLSearchParams, patch: Record<string, string | null>) {
  const next = new URLSearchParams(searchParams.toString());
  for (const [key, value] of Object.entries(patch)) {
    if (value == null || value === "") next.delete(key);
    else next.set(key, value);
  }
  if (!("page" in patch)) next.set("page", "1");
  const query = next.toString();
  return query ? `/admin/product/users?${query}` : "/admin/product/users";
}

function SortHeader({ field, label, hint }: { field: string; label: string; hint?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const active = searchParams.get("sort") === field;
  const dir = searchParams.get("dir") === "asc" ? "asc" : "desc";
  const nextDir = active && dir === "asc" ? "desc" : "asc";

  return (
    <button
      type="button"
      className="flex h-7 w-full items-center justify-between gap-1 px-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]"
      title={hint}
      onClick={() => router.push(makeUrl(searchParams, { sort: field, dir: nextDir }))}
    >
      <span>{label}</span>
      {active && dir === "asc" ? <ArrowUp className="size-3 text-[var(--soft-bordeaux)]" aria-hidden="true" /> : null}
      {active && dir === "desc" ? <ArrowDown className="size-3 text-[var(--soft-bordeaux)]" aria-hidden="true" /> : null}
      {!active ? <ChevronsUpDown className="size-3 text-[var(--soft-ink-faint)]" aria-hidden="true" /> : null}
    </button>
  );
}

function PlainHeader({ label, hint }: { label: string; hint?: string }) {
  return (
    <div
      className="flex h-7 items-center px-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]"
      title={hint}
    >
      {label}
    </div>
  );
}

function HeaderSpacer() {
  return <div aria-hidden="true" className="h-7 border-t border-[var(--soft-paper-edge)]" />;
}

function FilterInput({ param, placeholder, type = "search" }: { param: string; placeholder: string; type?: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(param) ?? "");

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-[var(--soft-ink-faint)]" aria-hidden="true" />
      <input
        type={type}
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

function FilterSelect({ param, options }: { param: string; options: Array<{ value: string; label: string }> }) {
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

function CreateUserDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [role, setRole] = useState<"CLIENT" | "PRACTITIONER" | "ADMIN">("CLIENT");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [title, setTitle] = useState("");
  const [bio, setBio] = useState("");
  const [telegramUsername, setTelegramUsername] = useState("");
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [timezone, setTimezone] = useState("");
  const [sendResetLink, setSendResetLink] = useState(true);
  const [experience, setExperience] = useState("1 год");
  const [categories, setCategories] = useState<string[]>([]);
  const [directions, setDirections] = useState<string[]>([]);
  const [tasks, setTasks] = useState<string[]>([]);
  const [verified, setVerified] = useState(false);
  const [founding, setFounding] = useState(false);
  const [rates, setRates] = useState(() => SESSION_DURATIONS.map((durationMin) => ({
    durationMin,
    enabled: durationMin === 60,
    priceRub: durationMin === 15 ? "500" : durationMin === 30 ? "900" : durationMin === 45 ? "1200" : durationMin === 60 ? "1500" : durationMin === 90 ? "2000" : "2500",
  })));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (role === "PRACTITIONER" && password.length < 8) {
      toast.error("Для создания практика задайте пароль минимум 8 символов");
      return;
    }
    const response = await fetch(role === "PRACTITIONER" ? "/api/admin/practitioners/create" : "/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(role === "PRACTITIONER"
        ? {
          name,
          email,
          password,
          title,
          bio,
          experience,
          specialties: specialtiesForDirections(directions),
          tags: tasks,
          verified,
          founding,
          rates: rates.map((rate) => ({ durationMin: rate.durationMin, priceRub: Number(rate.priceRub) || 0, enabled: rate.enabled })),
        }
        : {
          role,
          name,
          email,
          password: password || undefined,
          title,
          bio,
          telegramUsername,
          birthDate,
          birthTime,
          birthPlace,
          timezone,
          sendResetLink: !password && sendResetLink,
        }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) {
      toast.error(typeof data.error === "string" ? data.error : "Не удалось создать пользователя");
      return;
    }
    toast.success("Пользователь создан");
    onClose();
    setName(""); setEmail(""); setPassword(""); setTitle(""); setBio(""); setTelegramUsername("");
    setBirthDate(""); setBirthTime(""); setBirthPlace(""); setTimezone(""); setExperience("1 год");
    setCategories([]); setDirections([]); setTasks([]); setVerified(false); setFounding(false);
    startTransition(() => router.refresh());
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] grid place-items-center bg-black/35 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5 shadow-[var(--soft-shadow-lg)]">
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
          {role === "CLIENT" && (
            <>
              <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
                Дата рождения
                <Input className="mt-1 h-9" type="date" value={birthDate} onChange={(event) => setBirthDate(event.target.value)} />
              </label>
              <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
                Время рождения
                <Input className="mt-1 h-9" type="time" value={birthTime} onChange={(event) => setBirthTime(event.target.value)} />
              </label>
              <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
                Город рождения
                <Input className="mt-1 h-9" value={birthPlace} onChange={(event) => setBirthPlace(event.target.value)} placeholder="Москва" />
              </label>
              <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
                Часовой пояс
                <Input className="mt-1 h-9" value={timezone} onChange={(event) => setTimezone(event.target.value)} placeholder="Europe/Moscow" />
              </label>
              <label className="md:col-span-2 flex items-center gap-2 pt-1 text-xs font-medium text-[var(--soft-ink-soft)]">
                <input type="checkbox" checked={sendResetLink} onChange={(event) => setSendResetLink(event.target.checked)} className="accent-[var(--soft-bordeaux)]" />
                Отправить письмо со ссылкой на установку пароля
              </label>
            </>
          )}
          {role === "PRACTITIONER" && (
            <>
              <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
                Заголовок практика
                <Input className="mt-1 h-9" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Таролог · психолог" />
              </label>
              <label className="text-xs font-semibold text-[var(--soft-ink-soft)]">
                Опыт
                <Input className="mt-1 h-9" value={experience} onChange={(event) => setExperience(event.target.value)} placeholder="5 лет" />
              </label>
              <label className="md:col-span-2 text-xs font-semibold text-[var(--soft-ink-soft)]">
                Описание
                <textarea className="soft-admin-table-filter mt-1 min-h-20 py-2" value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Коротко о подходе практика" />
              </label>
              <div className="md:col-span-2">
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
              <div className="md:col-span-2 grid gap-2 sm:grid-cols-2">
                <label className="flex items-center gap-2 text-xs font-medium text-[var(--soft-ink-soft)]">
                  <input type="checkbox" checked={verified} onChange={(event) => setVerified(event.target.checked)} className="accent-[var(--soft-bordeaux)]" />
                  Верифицирован
                </label>
                <label className="flex items-center gap-2 text-xs font-medium text-[var(--soft-ink-soft)]">
                  <input type="checkbox" checked={founding} onChange={(event) => setFounding(event.target.checked)} className="accent-[var(--soft-bordeaux)]" />
                  Основатель
                </label>
              </div>
              <div className="md:col-span-2">
                <span className="text-xs font-semibold text-[var(--soft-ink-soft)]">Тарифная сетка</span>
                <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                  {rates.map((rate, index) => (
                    <div key={rate.durationMin} className="flex items-center gap-2 rounded-md border border-[var(--soft-paper-edge)] px-2.5 py-1.5">
                      <label className="flex w-[5.5rem] shrink-0 items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
                        <input
                          type="checkbox"
                          checked={rate.enabled}
                          onChange={(event) => setRates((items) => items.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item))}
                          className="accent-[var(--soft-bordeaux)]"
                        />
                        {rate.durationMin} мин
                      </label>
                      <Input
                        className="h-8"
                        inputMode="numeric"
                        value={rate.priceRub}
                        disabled={!rate.enabled}
                        onChange={(event) => setRates((items) => items.map((item, i) => i === index ? { ...item, priceRub: event.target.value } : item))}
                      />
                    </div>
                  ))}
                </div>
              </div>
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

const NUM_CELL = `${COMPACT_CELL_CLASS} whitespace-nowrap text-right tabular-nums`;

export function UsersControlPanel({ rows, page, pageSize, total, permissions }: UsersControlPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  // U1/U2: the table is READ-ONLY. Editing happens in a modal opened per row.
  const [editing, setEditing] = useState<AdminUserRow | null>(null);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

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
      {editing && (
        <UserEditModal
          row={editing}
          permissions={permissions}
          onClose={() => setEditing(null)}
          onSaved={() => startTransition(() => router.refresh())}
        />
      )}

      <CompactTableShell minWidth="1240px">
        <thead className="sticky top-0 z-10 bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
          <tr>
            <th className={COMPACT_HEADER_CLASS}>
              <SortHeader field="name" label="Пользователь" />
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
              <SortHeader field="channel" label="Канал" />
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
            <th className={COMPACT_HEADER_CLASS}>
              <SortHeader field="credits" label="Баллы" />
              <HeaderSpacer />
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <SortHeader field="createdAt" label="Регистрация" />
              <FilterInput param="created" placeholder="дата" type="date" />
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <SortHeader field="lastLogin" label="Последний вход" hint="Дата последней сессии (IP и устройство — в карточке)" />
              <HeaderSpacer />
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <SortHeader field="freeToolsLimit" label="Лимит/мес" hint="Лимит бесплатных инструментов в месяц (0 = безлимит)" />
              <FilterInput param="limit" placeholder="0/3/∞" />
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <SortHeader field="bookings" label="Брони" />
              <HeaderSpacer />
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <SortHeader field="entitlements" label="Покупки" />
              <HeaderSpacer />
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <SortHeader field="subscriptions" label="Подписки" />
              <HeaderSpacer />
            </th>
            <th className={`${COMPACT_HEADER_CLASS} border-r-0`}><PlainHeader label="Действия" /></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={12} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">Пользователи не найдены</td>
            </tr>
          ) : rows.map((row) => {
            const status = statusOf(row);
            return (
              <tr key={row.id} className="hover:bg-[var(--soft-surface)]">
                <td className={`${COMPACT_CELL_CLASS} min-w-[13rem]`}>
                  <div className="truncate font-medium text-[var(--soft-ink-strong)]">{row.name || "—"}</div>
                  <div className="truncate text-[10px] text-[var(--soft-ink-faint)]">{row.email}</div>
                </td>
                <td className={`${COMPACT_CELL_CLASS} font-semibold ${roleColor(row.role)}`}>{ROLE_LABELS[row.role]}</td>
                <td className={`${COMPACT_CELL_CLASS} ${channelColor(row.provider)}`}>{channelLabel(row.provider)}</td>
                <td className={`${COMPACT_CELL_CLASS} font-medium ${status.className}`}>{status.label}</td>
                <td className={NUM_CELL}>{row.role === "CLIENT" ? row.clarityCredits : "—"}</td>
                <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap text-[var(--soft-ink-soft)]`}>{new Date(row.createdAt).toLocaleDateString("ru-RU")}</td>
                <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap text-[var(--soft-ink-soft)]`}>{row.lastLogin ? new Date(row.lastLogin.at).toLocaleDateString("ru-RU") : "—"}</td>
                <td className={NUM_CELL}>{row.freeToolsLimit == null ? "—" : row.freeToolsLimit === 0 ? "∞" : row.freeToolsLimit}</td>
                <td className={NUM_CELL}>{row.bookingsCount}</td>
                <td className={NUM_CELL}>{row.entitlementsCount}</td>
                <td className={NUM_CELL}>{row.subscriptionsCount}</td>
                <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
                  <button type="button" className="soft-admin-action" onClick={() => setEditing(row)} title="Открыть карточку пользователя">
                    <Pencil className="size-3.5" aria-hidden="true" />
                    Изменить
                  </button>
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
