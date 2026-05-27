"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

interface LogEntry {
  id: string;
  userId: string;
  targetId: string | null;
  action: string;
  details: string | null;
  ip: string | null;
  createdAt: string;
  actorName: string;
  actorEmail: string;
  actorRole: string;
  targetName: string | null;
}

interface DiagnosticsSnapshot {
  timestamp?: string;
  requestId?: string;
  env?: Record<string, unknown>;
  database?: Record<string, unknown>;
  yookassa?: Record<string, unknown>;
  telegram?: Record<string, unknown>;
  error?: string;
}

interface RuntimeLogSource {
  key: string;
  label: string;
  path: string;
  exists: boolean;
  sizeBytes?: number;
  updatedAt?: string;
  error?: string;
}

interface RuntimeLogEntry {
  id: string;
  source: string;
  sourceLabel: string;
  filePath: string;
  level: "debug" | "info" | "warn" | "error" | "unknown";
  event: string;
  timestamp: string | null;
  raw: string;
  fields: Record<string, unknown>;
}

interface RuntimeLogSnapshot {
  generatedAt: string;
  entries: RuntimeLogEntry[];
  sources: RuntimeLogSource[];
  warning?: string;
  requestId?: string;
}

const LOG_TABS = {
  audit: "Audit",
  diagnostics: "Diagnostics live",
  runtime: "Runtime logs",
} as const;

const ACTION_META: Record<string, { label: string; color: string; icon: string }> = {
  REGISTER:                { label: "Регистрация",         color: "bg-green-500/10 text-green-400",   icon: "👤" },
  LOGIN:                   { label: "Вход",                color: "bg-blue-500/10 text-blue-400",     icon: "🔑" },
  LOGOUT:                  { label: "Выход",               color: "bg-gray-500/10 text-gray-400",     icon: "🚪" },
  PASSWORD_RESET:          { label: "Сброс пароля",        color: "bg-yellow-500/10 text-yellow-400", icon: "🔄" },
  PASSWORD_CHANGE:         { label: "Смена пароля",        color: "bg-yellow-500/10 text-yellow-400", icon: "🔒" },
  PASSWORD_SET:            { label: "Назначение пароля",   color: "bg-orange-500/10 text-orange-400", icon: "🔧" },
  PROFILE_UPDATE:          { label: "Обновление профиля",  color: "bg-blue-500/10 text-blue-400",     icon: "✏️" },
  AVATAR_ADD:              { label: "Аватар загружен",     color: "bg-purple-500/10 text-purple-400", icon: "🖼️" },
  AVATAR_REMOVE:           { label: "Аватар удалён",       color: "bg-red-500/10 text-red-400",       icon: "🗑️" },
  ACCOUNT_BLOCK:           { label: "Заблокирован",        color: "bg-red-500/10 text-red-400",       icon: "🚫" },
  ACCOUNT_UNBLOCK:         { label: "Разблокирован",       color: "bg-green-500/10 text-green-400",   icon: "✓" },
  ACCOUNT_DELETE:          { label: "Удаление аккаунта",   color: "bg-red-500/20 text-red-400",       icon: "❌" },
  EMAIL_VERIFY:            { label: "Email подтверждён",   color: "bg-green-500/10 text-green-400",   icon: "✉️" },
  BOOKING_CREATE:          { label: "Запись создана",      color: "bg-primary/10 text-primary",       icon: "📅" },
  BOOKING_CANCEL:          { label: "Запись отменена",     color: "bg-orange-500/10 text-orange-400", icon: "📅" },
  BOOKING_CONFIRM:         { label: "Запись подтверждена", color: "bg-primary/10 text-primary",       icon: "✓" },
  IMPERSONATE:             { label: "Вход как пользователь", color: "bg-purple-500/20 text-purple-400", icon: "👁️" },
  PRACTITIONER_CREATE:     { label: "Практик создан",      color: "bg-primary/10 text-primary",       icon: "🔮" },
  PRACTITIONER_STATUS:     { label: "Статус практика",     color: "bg-yellow-500/10 text-yellow-400", icon: "🔄" },
  PRACTITIONER_PROFILE_UPDATE: { label: "Профиль практика", color: "bg-blue-500/10 text-blue-400",   icon: "✏️" },
};

const ACTION_GROUPS = {
  all: "Все",
  auth: "Авторизация",
  account: "Аккаунт",
  admin: "Администрирование",
  booking: "Бронирования",
};

function getGroup(action: string): keyof typeof ACTION_GROUPS {
  if (["LOGIN", "LOGOUT", "REGISTER", "EMAIL_VERIFY"].includes(action)) return "auth";
  if (["PASSWORD_RESET", "PASSWORD_CHANGE", "PASSWORD_SET", "PROFILE_UPDATE", "AVATAR_ADD", "AVATAR_REMOVE", "ACCOUNT_DELETE"].includes(action)) return "account";
  if (["ACCOUNT_BLOCK", "ACCOUNT_UNBLOCK", "IMPERSONATE", "PRACTITIONER_CREATE", "PRACTITIONER_STATUS", "PRACTITIONER_PROFILE_UPDATE"].includes(action)) return "admin";
  if (action.startsWith("BOOKING")) return "booking";
  return "all";
}

function asStatus(value: Record<string, unknown> | undefined) {
  if (!value) return "unknown";
  if (value.ok === true || value.status === "ok") return "ok";
  if (value.ok === false || value.status === "down") return "down";
  return "unknown";
}

function statusClass(status: string) {
  if (status === "ok") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-300";
  if (status === "down") return "border-red-500/30 bg-red-500/10 text-red-300";
  return "border-amber-500/30 bg-amber-500/10 text-amber-300";
}

function formatBytes(value?: number) {
  if (!value) return "0 B";
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(value?: string | null) {
  if (!value) return "без времени";
  return new Date(value).toLocaleString("ru-RU");
}

function prettyJson(value: unknown) {
  return JSON.stringify(value, null, 2);
}

function softButton(active: boolean) {
  return active
    ? "border-[var(--soft-bordeaux)] bg-[var(--soft-bordeaux)] text-white shadow-sm"
    : "border-[var(--soft-paper-edge)] bg-white/65 text-[var(--soft-ink-soft)] hover:text-[var(--soft-ink)]";
}

function runtimeLevelClass(level: RuntimeLogEntry["level"]) {
  if (level === "error") return "border-red-500/30 bg-red-500/10 text-red-700";
  if (level === "warn") return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  if (level === "info") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  if (level === "debug") return "border-sky-500/30 bg-sky-500/10 text-sky-700";
  return "border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]";
}

function DiagnosticsPanel() {
  const [snapshot, setSnapshot] = useState<DiagnosticsSnapshot | null>(null);
  const [error, setError] = useState("");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/diagnostics", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Diagnostics unavailable");
      setSnapshot(data as DiagnosticsSnapshot);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить diagnostics");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh]);

  const services = [
    ["database", "Database", snapshot?.database],
    ["yookassa", "YooKassa", snapshot?.yookassa],
    ["telegram", "Telegram", snapshot?.telegram],
  ] as const;

  return (
    <div className="space-y-4" data-testid="admin-diagnostics-live-panel">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-lg border border-border/40 px-3 py-1.5 text-xs text-foreground hover:bg-white/5"
        >
          {loading ? "Обновляем..." : "Обновить"}
        </button>
        <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox"
            checked={autoRefresh}
            onChange={(event) => setAutoRefresh(event.target.checked)}
          />
          автообновление 5 сек
        </label>
        {snapshot?.timestamp && (
          <span className="ml-auto text-xs text-muted-foreground">sample {formatDate(snapshot.timestamp)}</span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        {services.map(([key, label, service]) => {
          const status = asStatus(service);
          return (
            <div key={key} className="rounded-lg border border-border/30 bg-card/30 p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold">{label}</h3>
                <span className={`rounded-full border px-2 py-0.5 text-[11px] uppercase ${statusClass(status)}`}>{status}</span>
              </div>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-black/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
                {prettyJson(service ?? { status: "loading" })}
              </pre>
            </div>
          );
        })}
      </div>

      <div className="rounded-lg border border-border/30 bg-card/20 p-4">
        <h3 className="mb-2 text-sm font-semibold">Environment</h3>
        <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-black/20 p-3 text-[11px] leading-relaxed text-muted-foreground">
          {prettyJson(snapshot?.env ?? { status: "loading" })}
        </pre>
      </div>
    </div>
  );
}

function RuntimeLogsPanel() {
  const [snapshot, setSnapshot] = useState<RuntimeLogSnapshot | null>(null);
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [streamState, setStreamState] = useState<"connecting" | "live" | "polling" | "error">("connecting");
  const [error, setError] = useState("");

  const snapshotUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "200", level, source });
    if (search.trim()) params.set("q", search.trim());
    return `/api/admin/logs/runtime?${params.toString()}`;
  }, [level, search, source]);

  const streamUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "200", level, source, intervalMs: "3000" });
    if (search.trim()) params.set("q", search.trim());
    return `/api/admin/logs/runtime/stream?${params.toString()}`;
  }, [level, search, source]);

  const fetchSnapshot = useCallback(async () => {
    const response = await fetch(snapshotUrl, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Runtime logs unavailable");
    setSnapshot(data as RuntimeLogSnapshot);
    setError("");
  }, [snapshotUrl]);

  useEffect(() => {
    const sourceEvents = new EventSource(streamUrl);
    let pollTimer: number | null = null;

    sourceEvents.addEventListener("snapshot", (event) => {
      setSnapshot(JSON.parse((event as MessageEvent).data) as RuntimeLogSnapshot);
      setStreamState("live");
      setError("");
    });
    sourceEvents.addEventListener("error", (event) => {
      if ((event as MessageEvent).data) {
        setError((event as MessageEvent).data);
      }
    });
    sourceEvents.onerror = () => {
      sourceEvents.close();
      setStreamState("polling");
      void fetchSnapshot().catch((err) => {
        setStreamState("error");
        setError(err instanceof Error ? err.message : "Runtime logs unavailable");
      });
      pollTimer = window.setInterval(() => {
        void fetchSnapshot().catch((err) => {
          setStreamState("error");
          setError(err instanceof Error ? err.message : "Runtime logs unavailable");
        });
      }, 5000);
    };

    return () => {
      sourceEvents.close();
      if (pollTimer) window.clearInterval(pollTimer);
    };
  }, [fetchSnapshot, streamUrl]);

  const sources = snapshot?.sources ?? [];
  const entries = snapshot?.entries ?? [];

  return (
    <div className="space-y-4" data-testid="admin-runtime-logs-panel">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Поиск по event, requestId, provider, тексту..."
          value={search}
          onChange={(event) => {
            setStreamState("connecting");
            setError("");
            setSearch(event.target.value);
          }}
          className="h-8 max-w-sm border-[var(--soft-paper-edge)] bg-white/70 text-sm"
        />
        <select
          value={level}
          onChange={(event) => {
            setStreamState("connecting");
            setError("");
            setLevel(event.target.value);
          }}
          className="h-8 rounded-lg border border-[var(--soft-paper-edge)] bg-white/70 px-2 text-xs text-[var(--soft-ink)]"
        >
          <option value="all">Все уровни</option>
          <option value="error">error</option>
          <option value="warn">warn</option>
          <option value="info">info</option>
          <option value="debug">debug</option>
          <option value="unknown">unknown</option>
        </select>
        <select
          value={source}
          onChange={(event) => {
            setStreamState("connecting");
            setError("");
            setSource(event.target.value);
          }}
          className="h-8 rounded-lg border border-[var(--soft-paper-edge)] bg-white/70 px-2 text-xs text-[var(--soft-ink)]"
        >
          <option value="all">Все источники</option>
          {sources.map((item) => (
            <option key={item.key} value={item.key}>{item.label}</option>
          ))}
        </select>
        <span className={`ml-auto rounded-full border px-2.5 py-1 text-xs ${streamState === "live" ? statusClass("ok") : streamState === "error" ? statusClass("down") : statusClass("unknown")}`}>
          {streamState === "live" ? "live SSE" : streamState === "polling" ? "polling fallback" : streamState}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </div>
      )}
      {snapshot?.warning && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          {snapshot.warning}
        </div>
      )}

      <div className="grid gap-2 lg:grid-cols-4">
        {sources.map((item) => (
          <div key={item.key} className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/65 p-3">
            <div className="mb-1 flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold">{item.label}</p>
              <span className={`rounded-full border px-1.5 py-0.5 text-[10px] ${statusClass(item.exists ? "ok" : "down")}`}>
                {item.exists ? "ready" : "missing"}
              </span>
            </div>
            <p className="truncate font-mono text-[10px] text-muted-foreground">{item.path}</p>
            <p className="mt-1 text-[10px] text-muted-foreground">{formatBytes(item.sizeBytes)} · {formatDate(item.updatedAt)}</p>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-xl border border-[var(--soft-paper-edge)] bg-white/65">
        <div className="flex items-center justify-between border-b border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-4 py-2 text-xs text-[var(--soft-ink-soft)]">
          <span>{entries.length} записей</span>
          <span>{snapshot?.generatedAt ? `snapshot ${formatDate(snapshot.generatedAt)}` : "ожидание"}</span>
        </div>
        <div className="max-h-[640px] divide-y divide-[var(--soft-paper-edge)] overflow-auto">
          {entries.length === 0 ? (
            <div className="py-12 text-center text-sm text-[var(--soft-ink-soft)]">Нет runtime-записей или источники логов не найдены</div>
          ) : entries.map((entry) => (
            <details key={entry.id} className="group px-4 py-3">
              <summary className="grid cursor-pointer list-none gap-2 lg:grid-cols-[11rem_9rem_minmax(0,1fr)]">
                <span className="font-mono text-[11px] text-[var(--soft-ink-soft)]">{formatDate(entry.timestamp)}</span>
                <div className="flex flex-col gap-1">
                  <Badge className={`${runtimeLevelClass(entry.level)} w-fit border text-[10px]`}>
                    {entry.level}
                  </Badge>
                  <span className="text-[10px] text-[var(--soft-ink-soft)]">{entry.sourceLabel}</span>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-[var(--soft-ink)]">{entry.event}</p>
                  <p className="mt-1 truncate font-mono text-[11px] text-[var(--soft-ink-soft)]">{entry.filePath}</p>
                </div>
              </summary>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Raw</p>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--soft-surface)] p-3 text-[11px] leading-relaxed text-[var(--soft-ink)]">
                    {entry.raw}
                  </pre>
                </div>
                <div>
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Parsed fields</p>
                  <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--soft-surface)] p-3 text-[11px] leading-relaxed text-[var(--soft-ink)]">
                    {Object.keys(entry.fields).length > 0 ? prettyJson(entry.fields) : "нет дополнительных полей"}
                  </pre>
                </div>
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminLogsConsole({ logs }: { logs: LogEntry[] }) {
  const [tab, setTab] = useState<keyof typeof LOG_TABS>("audit");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-1" data-testid="admin-observability-tabs">
        {Object.entries(LOG_TABS).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key as keyof typeof LOG_TABS)}
            className={`rounded-lg border px-3 py-1.5 text-sm transition-colors ${softButton(tab === key)}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === "audit" && <LogsViewer logs={logs} />}
      {tab === "diagnostics" && <DiagnosticsPanel />}
      {tab === "runtime" && <RuntimeLogsPanel />}
    </div>
  );
}

export function LogsViewer({ logs }: { logs: LogEntry[] }) {
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<keyof typeof ACTION_GROUPS>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter(l => {
      if (group !== "all" && getGroup(l.action) !== group) return false;
      if (!q) return true;
      return (
        l.actorName.toLowerCase().includes(q) ||
        l.actorEmail.toLowerCase().includes(q) ||
        l.action.toLowerCase().includes(q) ||
        (l.details?.toLowerCase().includes(q) ?? false) ||
        (l.targetName?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [logs, search, group]);

  return (
    <div className="space-y-4">
      {/* Фильтры */}
      <div className="flex flex-wrap gap-3 items-center">
        <Input placeholder="Поиск по пользователю, действию, деталям..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="max-w-sm h-8 border-[var(--soft-paper-edge)] bg-white/70 text-sm" />
        <div className="flex gap-1">
          {Object.entries(ACTION_GROUPS).map(([key, label]) => (
            <button key={key} onClick={() => setGroup(key as keyof typeof ACTION_GROUPS)}
              className={`rounded-lg border px-3 py-1 text-xs transition-colors ${softButton(group === key)}`}>
              {label}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} записей</span>
      </div>

      {/* Лог */}
      <div className="rounded-xl border border-border/30 overflow-hidden divide-y divide-border/10">
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">Нет записей</div>
        ) : filtered.map(l => {
          const meta = ACTION_META[l.action] ?? { label: l.action, color: "bg-muted/10 text-muted-foreground", icon: "•" };
          const isExpanded = expandedId === l.id;
          return (
            <div key={l.id}
              className="px-4 py-2.5 hover:bg-white/2 transition-colors cursor-pointer"
              onClick={() => setExpandedId(isExpanded ? null : l.id)}>
              <div className="flex items-center gap-3">
                {/* Время */}
                <span className="text-xs text-muted-foreground/60 shrink-0 w-32">
                  {new Date(l.createdAt).toLocaleDateString("ru-RU")} {new Date(l.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
                {/* Действие */}
                <Badge className={`${meta.color} text-[10px] shrink-0 gap-1`}>
                  {meta.icon} {meta.label}
                </Badge>
                {/* Актор */}
                <span className="text-sm font-medium truncate min-w-0">{l.actorName}</span>
                {l.actorRole && (
                  <span className="text-xs text-muted-foreground/50 shrink-0">{l.actorRole}</span>
                )}
                {/* Цель */}
                {l.targetName && l.targetName !== l.actorName && (
                  <>
                    <span className="text-muted-foreground/40 text-xs shrink-0">→</span>
                    <span className="text-xs text-muted-foreground truncate">{l.targetName}</span>
                  </>
                )}
                {/* Детали */}
                {l.details && !isExpanded && (
                  <span className="text-xs text-muted-foreground/50 truncate ml-auto max-w-48">{l.details}</span>
                )}
                <span className="ml-auto text-muted-foreground/30 text-xs shrink-0">{isExpanded ? "▲" : "▼"}</span>
              </div>
              {/* Раскрытые детали */}
              {isExpanded && (
                <div className="mt-2 ml-32 space-y-1">
                  <div className="rounded-lg bg-card/30 px-3 py-2 text-xs space-y-1">
                    <div className="flex gap-4">
                      <span className="text-muted-foreground w-16 shrink-0">ID</span>
                      <code className="text-muted-foreground/60">{l.id}</code>
                    </div>
                    <div className="flex gap-4">
                      <span className="text-muted-foreground w-16 shrink-0">Актор</span>
                      <span>{l.actorName} ({l.actorEmail})</span>
                    </div>
                    {l.targetId && (
                      <div className="flex gap-4">
                        <span className="text-muted-foreground w-16 shrink-0">Цель</span>
                        <span>{l.targetName ?? l.targetId}</span>
                      </div>
                    )}
                    {l.ip && (
                      <div className="flex gap-4">
                        <span className="text-muted-foreground w-16 shrink-0">IP</span>
                        <code>{l.ip}</code>
                      </div>
                    )}
                    {l.details && (
                      <div className="flex gap-4">
                        <span className="text-muted-foreground w-16 shrink-0">Детали</span>
                        <span>{l.details}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
