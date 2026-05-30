"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_HEADER_CLASS,
} from "@/components/admin/compact-table";

// Header label cell for the compact diagnostics/runtime tables.
function LogHeaderLabel({ label }: { label: string }) {
  return (
    <th className={COMPACT_HEADER_CLASS} scope="col">
      <div className="flex h-7 items-center px-1.5 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">
        {label}
      </div>
    </th>
  );
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
  audit: "Аудит",
  diagnostics: "Диагностика (live)",
  runtime: "Runtime",
} as const;

function asStatus(value: Record<string, unknown> | undefined) {
  if (!value) return "unknown";
  if (value.ok === true || value.status === "ok") return "ok";
  if (value.ok === false || value.status === "down") return "down";
  return "unknown";
}

function diagTone(status: string): "ok" | "warn" | "danger" {
  if (status === "ok") return "ok";
  if (status === "down") return "danger";
  return "warn";
}

function runtimeTone(level: RuntimeLogEntry["level"]): "ok" | "warn" | "danger" {
  if (level === "error") return "danger";
  if (level === "warn") return "warn";
  return "ok";
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

/**
 * T7: live infrastructure diagnostics rendered in the same soft-admin
 * data-table style as the audit log, so all observability surfaces share
 * one visual language.
 */
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
    const timer = window.setTimeout(() => { void refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh]);

  const services = [
    ["database", "Database", snapshot?.database],
    ["yookassa", "YooKassa", snapshot?.yookassa],
    ["telegram", "Telegram", snapshot?.telegram],
    ["env", "Environment", snapshot?.env],
  ] as const;

  return (
    <div className="space-y-4" data-testid="admin-diagnostics-live-panel">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void refresh()}
          className="soft-admin-action"
          data-variant="subtle"
        >
          {loading ? "Обновляем..." : "Обновить"}
        </button>
        <label className="inline-flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
          <input type="checkbox" checked={autoRefresh} onChange={(event) => setAutoRefresh(event.target.checked)} />
          автообновление 5 сек
        </label>
        {snapshot?.timestamp && (
          <span className="ml-auto text-xs text-[var(--soft-ink-faint)]">sample {formatDate(snapshot.timestamp)}</span>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <CompactTableShell minWidth="720px">
          <thead className="sticky top-0 z-10 bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <LogHeaderLabel label="Сервис" />
              <LogHeaderLabel label="Статус" />
              <LogHeaderLabel label="Снимок" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {services.map(([key, label, value]) => {
              const status = key === "env" ? (value ? "ok" : "unknown") : asStatus(value);
              return (
                <tr key={key} className="hover:bg-[var(--soft-surface)]">
                  <td className={`${COMPACT_CELL_CLASS} font-medium`}>{label}</td>
                  <td className={COMPACT_CELL_CLASS}><span className="soft-admin-status-pill" data-tone={diagTone(status)}>{status}</span></td>
                  <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
                    <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--soft-surface)] p-2 text-[11px] leading-relaxed text-[var(--soft-ink-soft)]">
                      {prettyJson(value ?? { status: "loading" })}
                    </pre>
                  </td>
                </tr>
              );
            })}
          </tbody>
      </CompactTableShell>
    </div>
  );
}

/**
 * T7: runtime log files rendered in the soft-admin data-table style with the
 * same level/search/source filtering the legacy console offered.
 */
function RuntimeLogsPanel() {
  const [snapshot, setSnapshot] = useState<RuntimeLogSnapshot | null>(null);
  const [level, setLevel] = useState("all");
  const [source, setSource] = useState("all");
  const [search, setSearch] = useState("");
  const [streamState, setStreamState] = useState<"connecting" | "live" | "polling" | "error">("connecting");
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // B5: while a log row is expanded, freeze incoming snapshots so the live
  // 3s refresh doesn't re-render the table out from under the reader. A ref
  // keeps the SSE/poll closures from going stale.
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = expandedId !== null; }, [expandedId]);

  const streamUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "200", level, source, intervalMs: "3000" });
    if (search.trim()) params.set("q", search.trim());
    return `/api/admin/logs/runtime/stream?${params.toString()}`;
  }, [level, search, source]);

  const snapshotUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "200", level, source });
    if (search.trim()) params.set("q", search.trim());
    return `/api/admin/logs/runtime?${params.toString()}`;
  }, [level, search, source]);

  const fetchSnapshot = useCallback(async () => {
    if (pausedRef.current) return; // B5: don't overwrite while reading an expanded log
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
      setStreamState("live");
      setError("");
      if (pausedRef.current) return; // B5: paused while a log is expanded
      setSnapshot(JSON.parse((event as MessageEvent).data) as RuntimeLogSnapshot);
    });
    sourceEvents.addEventListener("error", (event) => {
      if ((event as MessageEvent).data) setError((event as MessageEvent).data);
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
        <input
          placeholder="Поиск по event, requestId, provider, тексту..."
          value={search}
          onChange={(event) => { setStreamState("connecting"); setError(""); setSearch(event.target.value); }}
          className="soft-admin-table-filter max-w-sm"
        />
        <select
          value={level}
          onChange={(event) => { setStreamState("connecting"); setError(""); setLevel(event.target.value); }}
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
          onChange={(event) => { setStreamState("connecting"); setError(""); setSource(event.target.value); }}
          className="h-8 rounded-lg border border-[var(--soft-paper-edge)] bg-white/70 px-2 text-xs text-[var(--soft-ink)]"
        >
          <option value="all">Все источники</option>
          {sources.map((item) => (<option key={item.key} value={item.key}>{item.label}</option>))}
        </select>
        <span
          className="soft-admin-status-pill ml-auto"
          data-tone={expandedId ? "warn" : streamState === "live" ? "ok" : streamState === "error" ? "danger" : "warn"}
        >
          {expandedId
            ? "пауза · читаете лог"
            : streamState === "live" ? "live SSE" : streamState === "polling" ? "polling" : streamState}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {snapshot?.warning && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{snapshot.warning}</div>
      )}

      {sources.length > 0 && (
        <div className="flex flex-wrap gap-2 text-[11px] text-[var(--soft-ink-faint)]">
          {sources.map((item) => (
            <span key={item.key} className="inline-flex items-center gap-1 rounded-full border border-[var(--soft-paper-edge)] bg-white/65 px-2 py-0.5">
              <span className="soft-admin-status-pill" data-tone={item.exists ? "ok" : "danger"}>{item.exists ? "ready" : "missing"}</span>
              {item.label} · {formatBytes(item.sizeBytes)}
            </span>
          ))}
        </div>
      )}

      <CompactTableShell minWidth="960px">
          <thead className="sticky top-0 z-10 bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <LogHeaderLabel label="Время" />
              <LogHeaderLabel label="Уровень" />
              <LogHeaderLabel label="Источник" />
              <LogHeaderLabel label="Событие" />
              <LogHeaderLabel label="Файл" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {entries.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">Нет runtime-записей или источники логов не найдены</td></tr>
            ) : entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <>
                  <tr
                    key={entry.id}
                    className="cursor-pointer hover:bg-[var(--soft-surface)]"
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <td className={`${COMPACT_CELL_CLASS} whitespace-nowrap font-mono text-[10px]`}>{formatDate(entry.timestamp)}</td>
                    <td className={COMPACT_CELL_CLASS}><span className="soft-admin-status-pill" data-tone={runtimeTone(entry.level)}>{entry.level}</span></td>
                    <td className={COMPACT_CELL_CLASS}>{entry.sourceLabel}</td>
                    <td className={`${COMPACT_CELL_CLASS} max-w-md truncate font-medium`}>{entry.event}</td>
                    <td className={`${COMPACT_CELL_CLASS} max-w-xs truncate border-r-0 font-mono text-[10px] text-[var(--soft-ink-faint)]`}>{entry.filePath}</td>
                  </tr>
                  {isExpanded && (
                    <tr key={`${entry.id}-detail`}>
                      <td colSpan={5} className="border-r-0 px-1.5 py-2">
                        <div className="grid gap-2 lg:grid-cols-2">
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Raw</p>
                            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--soft-surface)] p-3 text-[11px] leading-relaxed text-[var(--soft-ink)]">{entry.raw}</pre>
                          </div>
                          <div>
                            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Parsed fields</p>
                            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--soft-surface)] p-3 text-[11px] leading-relaxed text-[var(--soft-ink)]">{Object.keys(entry.fields).length > 0 ? prettyJson(entry.fields) : "нет дополнительных полей"}</pre>
                          </div>
                        </div>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
      </CompactTableShell>
    </div>
  );
}

/**
 * T7: single observability surface. The audit log (server-rendered with its
 * own search/sort/pagination) is passed in as `auditTable`; diagnostics and
 * runtime render client-side. All three share the new soft-admin table style;
 * the legacy dark console table was removed.
 */
export function LogsTabs({ auditTable }: { auditTable: React.ReactNode }) {
  const [tab, setTab] = useState<keyof typeof LOG_TABS>("audit");

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 rounded-xl border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-1" data-testid="admin-observability-tabs">
        {Object.entries(LOG_TABS).map(([key, label]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key as keyof typeof LOG_TABS)}
              data-active={active}
              className="soft-admin-seg-btn"
            >
              {label}
            </button>
          );
        })}
      </div>
      <div hidden={tab !== "audit"}>{auditTable}</div>
      {tab === "diagnostics" && <DiagnosticsPanel />}
      {tab === "runtime" && <RuntimeLogsPanel />}
    </div>
  );
}
