"use client";

import { type InputHTMLAttributes, type ReactNode, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDown, ArrowUp, Ban, CalendarDays, ChevronDown, ChevronLeft, ChevronRight, ChevronsUpDown, LogIn, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
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

function valuesOf(value: string | null) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function compactValue(values: string[]) {
  return values.length > 0 ? values.join(",") : null;
}

async function patchJson(url: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(url, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.ok === false || data?.error) {
    throw new Error(typeof data?.error === "string" ? data.error : "Не удалось выполнить действие");
  }
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

function PlainHeader({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="grid gap-1 p-1">
      <div
        className="flex h-7 items-center px-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]"
        title={hint}
      >
        {label}
      </div>
      {children}
    </div>
  );
}

function HeaderCell({ field, label, hint, children }: { field: string; label: string; hint?: string; children?: ReactNode }) {
  return (
    <div className="grid gap-1 p-1">
      <SortHeader field={field} label={label} hint={hint} />
      {children}
    </div>
  );
}

function FilterInput({ param, placeholder, inputMode }: { param: string; placeholder: string; inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(param) ?? "");

  function apply(nextValue: string) {
    router.push(makeUrl(searchParams, { [param]: nextValue.trim() }));
  }

  function clear() {
    setValue("");
    router.push(makeUrl(searchParams, { [param]: null }));
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-1.5 top-1/2 size-3 -translate-y-1/2 text-[var(--soft-ink-faint)]" aria-hidden="true" />
      <input
        type="text"
        inputMode={inputMode}
        className={`${COMPACT_INPUT_CLASS} pl-5 pr-6`}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") apply(value);
        }}
      />
      {value ? (
        <button
          type="button"
          className="absolute right-1 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded text-[var(--soft-ink-faint)] hover:bg-[var(--soft-surface)] hover:text-[var(--soft-bordeaux)]"
          onClick={clear}
          aria-label="Очистить фильтр"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}

function MultiSelectFilter({
  param,
  placeholder,
  options,
}: {
  param: string;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = valuesOf(searchParams.get(param));
  const selectedSet = new Set(selected);
  const summary = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? options.find((option) => option.value === selected[0])?.label ?? placeholder
      : `Выбрано: ${selected.length}`;

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  function toggle(value: string) {
    const next = new Set(selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    router.push(makeUrl(searchParams, { [param]: compactValue([...next]) }));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`${COMPACT_SELECT_CLASS} flex items-center justify-between gap-1 text-left`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="truncate">{summary}</span>
        <ChevronDown className="size-3 shrink-0 text-[var(--soft-ink-faint)]" aria-hidden="true" />
      </button>
      {open ? (
        <div className="absolute left-0 top-[calc(100%+4px)] z-[80] min-w-full rounded-md border border-[var(--soft-paper-edge)] bg-white p-1 shadow-[var(--soft-shadow-sm)]">
          {selected.length > 0 ? (
            <button
              type="button"
              className="mb-1 flex h-7 w-full items-center rounded px-2 text-left text-[11px] text-[var(--soft-ink-faint)] hover:bg-[var(--soft-surface)]"
              onClick={() => router.push(makeUrl(searchParams, { [param]: null }))}
            >
              Сбросить
            </button>
          ) : null}
          {options.map((option) => (
            <label
              key={option.value}
              className="flex h-7 w-full cursor-pointer items-center gap-2 rounded px-2 text-[11px] text-[var(--soft-ink)] hover:bg-[var(--soft-surface)]"
            >
              <input
                type="checkbox"
                className="accent-[var(--soft-bordeaux)]"
                checked={selectedSet.has(option.value)}
                onChange={() => toggle(option.value)}
              />
              <span className="truncate">{option.label}</span>
            </label>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function dateLabel(value: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}` : "";
}

function parseRuDate(value: string) {
  const match = value.trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  const date = new Date(Number(year), Number(month) - 1, Number(day), 12);
  if (
    date.getFullYear() !== Number(year)
    || date.getMonth() !== Number(month) - 1
    || date.getDate() !== Number(day)
  ) {
    return null;
  }
  return isoDate(date);
}

function isoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function HeaderDateFilter({ param }: { param: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const value = searchParams.get(param) ?? "";
  const initialDate = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(dateLabel(value));
  const [viewDate, setViewDate] = useState(() => new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
  const rootRef = useRef<HTMLDivElement | null>(null);
  const days = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const last = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0);
    const leading = (first.getDay() + 6) % 7;
    const trailing = 6 - ((last.getDay() + 6) % 7);
    const start = new Date(first);
    start.setDate(first.getDate() - leading);
    const total = leading + last.getDate() + trailing;
    return Array.from({ length: total }, (_, index) => {
      const date = new Date(start);
      date.setDate(start.getDate() + index);
      return date;
    });
  }, [viewDate]);

  useEffect(() => {
    if (!open) return;
    function close(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [open]);

  function apply(nextValue: string | null) {
    router.push(makeUrl(searchParams, { [param]: nextValue }));
    setOpen(false);
  }

  function commitDraft() {
    const trimmed = draft.trim();
    if (!trimmed) {
      if (value) apply(null);
      return;
    }
    const parsed = parseRuDate(trimmed);
    if (parsed && parsed !== value) apply(parsed);
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        type="text"
        inputMode="numeric"
        className={`${COMPACT_INPUT_CLASS} pr-12`}
        value={draft}
        placeholder="дд.мм.гггг"
        autoComplete="off"
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commitDraft}
        onKeyDown={(event) => {
          if (event.key === "Enter") commitDraft();
          if (event.key === "Escape") setOpen(false);
        }}
        aria-label="Дата фильтра"
      />
      {value ? (
        <button
          type="button"
          className="absolute right-6 top-1/2 inline-flex size-4 -translate-y-1/2 items-center justify-center rounded text-[var(--soft-ink-faint)] hover:bg-[var(--soft-surface)] hover:text-[var(--soft-bordeaux)]"
          onClick={(event) => {
            event.stopPropagation();
            setDraft("");
            apply(null);
          }}
          aria-label="Очистить дату"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : null}
      <button
        type="button"
        className="absolute right-1 top-1/2 inline-flex size-5 -translate-y-1/2 items-center justify-center rounded text-[var(--soft-ink-faint)] hover:bg-[var(--soft-surface)] hover:text-[var(--soft-bordeaux)]"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setOpen((current) => !current)}
        aria-label="Открыть календарь"
      >
        <CalendarDays className="size-3" aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="absolute left-0 top-[calc(100%+4px)] z-[90] w-56 rounded-md border border-[var(--soft-paper-edge)] bg-white p-2 shadow-[var(--soft-shadow-sm)]"
          onMouseDown={(event) => event.preventDefault()}
        >
          <div className="mb-1 flex items-center justify-between gap-1">
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded hover:bg-[var(--soft-surface)]"
              onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() - 1, 1))}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft className="size-3" aria-hidden="true" />
            </button>
            <span className="text-[10px] font-semibold text-[var(--soft-ink-soft)]">
              {new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric" }).format(viewDate)}
            </span>
            <button
              type="button"
              className="inline-flex size-6 items-center justify-center rounded hover:bg-[var(--soft-surface)]"
              onClick={() => setViewDate((date) => new Date(date.getFullYear(), date.getMonth() + 1, 1))}
              aria-label="Следующий месяц"
            >
              <ChevronRight className="size-3" aria-hidden="true" />
            </button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] font-semibold text-[var(--soft-ink-faint)]">
            {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="mt-1 grid grid-cols-7 gap-0.5">
            {days.map((date) => {
              const current = isoDate(date);
              const inMonth = date.getMonth() === viewDate.getMonth();
              const selected = current === value;
              return (
                <button
                  key={current}
                  type="button"
                  className={`h-6 rounded text-[10px] tabular-nums ${selected ? "bg-[var(--soft-bordeaux)] text-white" : inMonth ? "text-[var(--soft-ink)] hover:bg-[var(--soft-surface)]" : "text-[var(--soft-ink-faint)] hover:bg-[var(--soft-surface)]"}`}
                  onClick={() => {
                    setDraft(dateLabel(current));
                    apply(current);
                  }}
                >
                  {date.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
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
            <select className={`${COMPACT_SELECT_CLASS} mt-1 h-9`} value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
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
                <textarea className={`${COMPACT_INPUT_CLASS} mt-1 min-h-20 py-2`} value={bio} onChange={(event) => setBio(event.target.value)} placeholder="Коротко о подходе практика" />
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

type PaginationItem = number | { type: "jump"; target: number; label: "..." };

function paginationItems(page: number, pageCount: number): PaginationItem[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);
  const items: PaginationItem[] = [1];
  let start = Math.max(2, page - 1);
  let end = Math.min(pageCount - 1, page + 1);

  if (page <= 4) {
    start = 2;
    end = 5;
  } else if (page >= pageCount - 3) {
    start = pageCount - 4;
    end = pageCount - 1;
  }

  if (start > 2) items.push({ type: "jump", target: Math.max(1, page - 3), label: "..." });
  for (let item = start; item <= end; item += 1) items.push(item);
  if (end < pageCount - 1) items.push({ type: "jump", target: Math.min(pageCount, page + 3), label: "..." });
  items.push(pageCount);
  return items;
}

function PaginationPageLink({ pageNumber, active, href }: { pageNumber: number; active: boolean; href: string }) {
  return (
    <Link
      className={`soft-admin-pagination-page inline-flex h-7 min-w-7 items-center justify-center rounded border px-2 tabular-nums ${active ? "font-bold shadow-sm" : "border-[var(--soft-paper-edge)] bg-white text-[var(--soft-ink-soft)] hover:bg-[var(--soft-surface)]"}`}
      style={active ? { outline: "2px solid #5c2a2c", outlineOffset: "-1px" } : undefined}
      href={href}
      aria-current={active ? "page" : undefined}
    >
      <span style={active ? { color: "#5c2a2c", fontWeight: 800 } : undefined}>{pageNumber}</span>
    </Link>
  );
}

export function UsersControlPanel({ rows, page, pageSize, total, permissions }: UsersControlPanelProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [createOpen, setCreateOpen] = useState(false);
  // U1/U2: the table is READ-ONLY. Editing happens in a modal opened per row.
  const [editing, setEditing] = useState<AdminUserRow | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());

  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const selectableRows = rows.filter((row) => row.role !== "SUPERADMIN");
  const selectedOnPage = selectableRows.filter((row) => selectedIds.has(row.id)).length;
  const allVisibleSelected = selectableRows.length > 0 && selectedOnPage === selectableRows.length;

  function toggleRow(id: string, checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function toggleVisibleRows(checked: boolean) {
    setSelectedIds((current) => {
      const next = new Set(current);
      for (const row of selectableRows) {
        if (checked) next.add(row.id);
        else next.delete(row.id);
      }
      return next;
    });
  }

  async function runBulkAction(action: "block" | "soft_delete") {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    const label = action === "block" ? "заблокировать" : "удалить";
    if (!window.confirm(`${label[0].toUpperCase()}${label.slice(1)} выбранных пользователей: ${ids.length}?`)) return;
    try {
      await Promise.all(ids.map((id) => patchJson(`/api/admin/users/${id}`, { action, comment: "bulk admin users table" })));
      toast.success(action === "block" ? "Пользователи заблокированы" : "Пользователи помечены на удаление");
      setSelectedIds(new Set());
      startTransition(() => router.refresh());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Массовое действие не выполнено");
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {selectedIds.size > 0 ? (
          <div className="mr-auto flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-[var(--soft-ink-soft)]">Выбрано: {selectedIds.size}</span>
            {permissions.canBlock && (
              <button type="button" className="soft-admin-action" data-variant="subtle" onClick={() => void runBulkAction("block")}>
                <Ban className="size-3.5" aria-hidden="true" />
                Заблокировать
              </button>
            )}
            {permissions.canDelete && (
              <button type="button" className="soft-admin-action" data-variant="danger" onClick={() => void runBulkAction("soft_delete")}>
                <Trash2 className="size-3.5" aria-hidden="true" />
                Удалить
              </button>
            )}
          </div>
        ) : null}
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

      <CompactTableShell minWidth="1420px">
        <thead className="sticky top-0 z-10 bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
          <tr>
            <th className={COMPACT_HEADER_CLASS}>
              <PlainHeader label="">
                <label className="flex h-7 items-center justify-center" title="Выбрать пользователей на странице">
                  <input
                    type="checkbox"
                    className="accent-[var(--soft-bordeaux)]"
                    checked={allVisibleSelected}
                    disabled={selectableRows.length === 0}
                    onChange={(event) => toggleVisibleRows(event.target.checked)}
                  />
                </label>
              </PlainHeader>
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <HeaderCell field="name" label="Пользователь">
                <FilterInput param="q" placeholder="имя/email" />
              </HeaderCell>
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <HeaderCell field="role" label="Роль">
                <MultiSelectFilter
                  param="role"
                  placeholder="Все роли"
                  options={[
                    { value: "CLIENT", label: "Клиенты" },
                    { value: "PRACTITIONER", label: "Практики" },
                    { value: "ADMIN", label: "Модераторы" },
                    { value: "SUPERADMIN", label: "Суперадмины" },
                  ]}
                />
              </HeaderCell>
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <HeaderCell field="channel" label="Канал">
                <MultiSelectFilter
                  param="channel"
                  placeholder="Все каналы"
                  options={[
                    { value: "web", label: "Web" },
                    { value: "app", label: "App" },
                    { value: "telegram", label: "Telegram" },
                    { value: "vk", label: "VK" },
                    { value: "manual", label: "Manual" },
                  ]}
                />
              </HeaderCell>
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <HeaderCell field="status" label="Статус">
                <MultiSelectFilter
                  param="status"
                  placeholder="Все статусы"
                  options={[
                    { value: "active", label: "Активные" },
                    { value: "blocked", label: "Блок" },
                    { value: "deleted", label: "Удалённые" },
                    { value: "unverified", label: "Email нет" },
                  ]}
                />
              </HeaderCell>
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <HeaderCell field="credits" label="Баллы">
                <FilterInput param="credits" placeholder="поиск" />
              </HeaderCell>
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <HeaderCell field="createdAt" label="Регистрация">
                <HeaderDateFilter param="created" />
              </HeaderCell>
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <HeaderCell field="lastLogin" label="Последний вход" hint="Дата последней сессии (IP и устройство — в карточке)">
                <HeaderDateFilter param="lastLogin" />
              </HeaderCell>
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <HeaderCell field="bookings" label="Брони">
                <FilterInput param="bookings" placeholder="поиск" />
              </HeaderCell>
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <HeaderCell field="entitlements" label="Покупки">
                <FilterInput param="entitlements" placeholder="поиск" />
              </HeaderCell>
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <HeaderCell field="subscriptions" label="Подписка">
                <MultiSelectFilter
                  param="subscription"
                  placeholder="Все"
                  options={[
                    { value: "free", label: "Бесплатный" },
                    { value: "plus", label: "Plus" },
                    { value: "premium", label: "Premium" },
                    { value: "practitioner_pro", label: "Практик Pro" },
                    { value: "practitioner_pro_plus", label: "Практик Pro+" },
                  ]}
                />
              </HeaderCell>
            </th>
            <th className={COMPACT_HEADER_CLASS}>
              <HeaderCell field="antifraud" label="Антифрод" hint="Скоринг клиента 0–10: 10 = максимальный риск">
                <MultiSelectFilter
                  param="antifraud"
                  placeholder="Все"
                  options={[
                    { value: "0", label: "0/10" },
                    { value: "1-4", label: "1–4" },
                    { value: "5-7", label: "5–7" },
                    { value: "8-10", label: "8–10" },
                  ]}
                />
              </HeaderCell>
            </th>
            <th className={`${COMPACT_HEADER_CLASS} border-r-0`}><PlainHeader label="Действия" /></th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={13} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">Пользователи не найдены</td>
            </tr>
          ) : rows.map((row) => {
            const status = statusOf(row);
            const fraudScore = row.clientAntifraudScore ?? 0;
            const fraudClass = fraudScore >= 8 ? "text-red-600" : fraudScore >= 5 ? "text-amber-600" : "text-emerald-600";
            return (
              <tr key={row.id} className="hover:bg-[var(--soft-surface)]">
                <td className={`${COMPACT_CELL_CLASS} text-center`}>
                  <input
                    type="checkbox"
                    className="accent-[var(--soft-bordeaux)]"
                    checked={selectedIds.has(row.id)}
                    disabled={row.role === "SUPERADMIN"}
                    onChange={(event) => toggleRow(row.id, event.target.checked)}
                    aria-label={`Выбрать ${row.name || row.email}`}
                  />
                </td>
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
                <td className={NUM_CELL}>{row.bookingsCount}</td>
                <td className={NUM_CELL}>{row.entitlementsCount}</td>
                <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap`}>{row.subscriptionLabel}</td>
                <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap font-semibold tabular-nums ${row.role === "CLIENT" ? fraudClass : "text-[var(--soft-ink-faint)]"}`}>
                  {row.role === "CLIENT" ? `${fraudScore}/10` : "—"}
                </td>
                <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
                  <div className="soft-admin-table-actions">
                    <button
                      type="button"
                      className="soft-admin-icon-button"
                      onClick={() => setEditing(row)}
                      title="Редактировать"
                      aria-label={`Редактировать ${row.name || row.email}`}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                    </button>
                    {permissions.canImpersonate && row.role !== "SUPERADMIN" ? (
                      <form action="/api/admin/impersonate" method="post" target="_blank">
                        <input type="hidden" name="userId" value={row.id} />
                        <button
                          type="submit"
                          className="soft-admin-icon-button"
                          title="Войти как пользователь"
                          aria-label={`Войти как ${row.name || row.email}`}
                        >
                        <LogIn className="size-3.5" aria-hidden="true" />
                        </button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </CompactTableShell>

      <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="text-[var(--soft-ink-faint)]">
          {total === 0 ? "0 из 0" : `${(page - 1) * pageSize + 1}-${Math.min(page * pageSize, total)} из ${total.toLocaleString("ru-RU")}`}
        </div>
        {pageCount > 1 ? (
          <div className="flex flex-wrap items-center gap-1">
            {page > 1 ? (
              <Link className="soft-admin-action" data-variant="subtle" href={makeUrl(searchParams, { page: String(page - 1) })}>
                Предыдущая
              </Link>
            ) : null}
            {paginationItems(page, pageCount).map((item, index) => {
              if (typeof item !== "number") {
                return (
                  <Link
                    key={`${item.label}-${index}`}
                    className="inline-flex h-7 min-w-7 items-center justify-center rounded border border-[var(--soft-paper-edge)] bg-white px-2 text-[var(--soft-ink-soft)] hover:bg-[var(--soft-surface)]"
                    href={makeUrl(searchParams, { page: String(item.target) })}
                    title={`Перейти на ${item.target} страницу`}
                  >
                    {item.label}
                  </Link>
                );
              }
              const active = item === page;
              return (
                <PaginationPageLink
                  key={item}
                  pageNumber={item}
                  active={active}
                  href={makeUrl(searchParams, { page: String(item) })}
                />
              );
            })}
            {page < pageCount ? (
              <Link className="soft-admin-action" data-variant="subtle" href={makeUrl(searchParams, { page: String(page + 1) })}>
                Следующая
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
