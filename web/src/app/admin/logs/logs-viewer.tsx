"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminCompactDataTable, type AdminCompactColumn, type AdminCompactRow } from "@/components/admin/compact-client-table";
import { COMPACT_INPUT_CLASS } from "@/components/admin/compact-table";

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
  diagnostics: "Диагностика",
  runtime: "Runtime",
} as const;

const diagnosticsColumns: AdminCompactColumn[] = [
  { key: "service", label: "Сервис", sortable: true },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "ok", label: "OK" },
      { value: "down", label: "Сбой" },
      { value: "unknown", label: "Неизвестно" },
    ],
  },
  { key: "snapshot", label: "Снимок", sortable: true },
];

const sourcesColumns: AdminCompactColumn[] = [
  { key: "label", label: "Источник", sortable: true },
  {
    key: "exists",
    label: "Доступ",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "доступен", label: "Доступен" },
      { value: "не найден", label: "Не найден" },
    ],
  },
  { key: "size", label: "Размер", sortable: true, align: "right" },
  { key: "updatedAt", label: "Обновлен", sortable: true, filterKind: "date" },
  { key: "path", label: "Путь", sortable: true },
];

function runtimeColumns(sources: RuntimeLogSource[]): AdminCompactColumn[] {
  return [
    { key: "timestamp", label: "Время", sortable: true, filterKind: "date" },
    {
      key: "level",
      label: "Уровень",
      sortable: true,
      filterKind: "select",
      options: [
        { value: "error", label: "Ошибка" },
        { value: "warn", label: "Предупреждение" },
        { value: "info", label: "Информация" },
        { value: "debug", label: "Отладка" },
        { value: "unknown", label: "Не распознано" },
      ],
    },
    {
      key: "source",
      label: "Источник",
      sortable: true,
      filterKind: "select",
      options: sources.map((item) => ({ value: item.label, label: item.label })),
    },
    { key: "event", label: "Событие", sortable: true },
    { key: "file", label: "Файл", sortable: true },
    { key: "actions", label: "Действия", filterKind: "none", align: "center" },
  ];
}

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

function diagLabel(status: string) {
  if (status === "ok") return "OK";
  if (status === "down") return "Сбой";
  return "Неизвестно";
}

function runtimeTone(level: RuntimeLogEntry["level"]): "ok" | "warn" | "danger" {
  if (level === "error") return "danger";
  if (level === "warn") return "warn";
  return "ok";
}

function runtimeLevelLabel(level: RuntimeLogEntry["level"]) {
  const labels: Record<RuntimeLogEntry["level"], string> = {
    debug: "Отладка",
    info: "Информация",
    warn: "Предупреждение",
    error: "Ошибка",
    unknown: "Не распознано",
  };
  return labels[level];
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

function sourceReadinessLabel(exists: boolean) {
  return exists ? "доступен" : "не найден";
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
      if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Диагностика недоступна");
      setSnapshot(data as DiagnosticsSnapshot);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Не удалось загрузить диагностику");
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
    ["database", "База данных", snapshot?.database],
    ["yookassa", "ЮKassa", snapshot?.yookassa],
    ["telegram", "Telegram", snapshot?.telegram],
    ["env", "Переменные окружения", snapshot?.env],
  ] as const;

  const diagnosticsRows: AdminCompactRow[] = services.map(([key, label, value]) => {
    const status = key === "env" ? (value ? "ok" : "unknown") : asStatus(value);
    const snapshotText = prettyJson(value ?? { status: "loading" });
    return {
      id: key,
      cells: {
        service: label,
        status: {
          kind: "status",
          label: diagLabel(status),
          tone: diagTone(status),
          filterValue: `${status} ${diagLabel(status)}`,
          sortValue: diagLabel(status),
        },
        snapshot: {
          kind: "node",
          filterValue: snapshotText,
          sortValue: snapshotText,
          node: (
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--soft-surface)] p-2 text-[11px] leading-relaxed text-[var(--soft-ink-soft)]">
              {snapshotText}
            </pre>
          ),
        },
      },
    };
  });

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
              <span className="ml-auto text-xs text-[var(--soft-ink-faint)]">снимок {formatDate(snapshot.timestamp)}</span>
            )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</div>
      )}

      <AdminCompactDataTable
        columns={diagnosticsColumns}
        rows={diagnosticsRows}
        empty="Диагностика еще не загружена"
        minWidth="820px"
        pageSize={20}
      />
    </div>
  );
}

/**
 * T7: runtime log files rendered in the soft-admin data-table style with the
 * same level/search/source filtering the legacy console offered.
 */
function RuntimeLogsPanel() {
  const [snapshot, setSnapshot] = useState<RuntimeLogSnapshot | null>(null);
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
    const params = new URLSearchParams({ limit: "1000", tailBytes: "2097152", level: "all", source: "all", intervalMs: "3000" });
    if (search.trim()) params.set("q", search.trim());
    return `/api/admin/logs/runtime/stream?${params.toString()}`;
  }, [search]);

  const snapshotUrl = useMemo(() => {
    const params = new URLSearchParams({ limit: "1000", tailBytes: "2097152", level: "all", source: "all" });
    if (search.trim()) params.set("q", search.trim());
    return `/api/admin/logs/runtime?${params.toString()}`;
  }, [search]);

  const fetchSnapshot = useCallback(async () => {
    if (pausedRef.current) return; // B5: don't overwrite while reading an expanded log
    const response = await fetch(snapshotUrl, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof data.error === "string" ? data.error : "Runtime logs недоступны");
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
        setError(err instanceof Error ? err.message : "Runtime logs недоступны");
      });
      pollTimer = window.setInterval(() => {
        void fetchSnapshot().catch((err) => {
          setStreamState("error");
          setError(err instanceof Error ? err.message : "Runtime logs недоступны");
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
  const sourceRows: AdminCompactRow[] = sources.map((source) => ({
    id: source.key,
    cells: {
      label: {
        value: source.label,
        subvalue: source.key,
        filterValue: `${source.label} ${source.key}`,
        sortValue: source.label,
      },
      exists: {
        kind: "status",
        label: sourceReadinessLabel(source.exists),
        tone: source.exists ? "ok" : "danger",
        filterValue: sourceReadinessLabel(source.exists),
        sortValue: source.exists ? 1 : 0,
      },
      size: { value: formatBytes(source.sizeBytes), sortValue: source.sizeBytes ?? 0, filterValue: formatBytes(source.sizeBytes) },
      updatedAt: {
        value: formatDate(source.updatedAt),
        sortValue: source.updatedAt ? new Date(source.updatedAt).getTime() : 0,
        filterValue: formatDate(source.updatedAt),
      },
      path: { value: source.path, title: source.path, filterValue: source.path, sortValue: source.path },
    },
  }));
  const rows: AdminCompactRow[] = entries.map((entry) => {
    const isExpanded = expandedId === entry.id;
    const fieldsText = Object.keys(entry.fields).length > 0 ? prettyJson(entry.fields) : "нет дополнительных полей";
    const eventText = `${entry.event} ${entry.raw} ${fieldsText}`;
    return {
      id: entry.id,
      cells: {
        timestamp: {
          value: formatDate(entry.timestamp),
          filterValue: formatDate(entry.timestamp),
          sortValue: entry.timestamp ? new Date(entry.timestamp).getTime() : 0,
        },
        level: {
          kind: "status",
          label: runtimeLevelLabel(entry.level),
          tone: runtimeTone(entry.level),
          filterValue: `${entry.level} ${runtimeLevelLabel(entry.level)}`,
          sortValue: runtimeLevelLabel(entry.level),
        },
        source: {
          value: entry.sourceLabel,
          filterValue: `${entry.source} ${entry.sourceLabel}`,
          sortValue: entry.sourceLabel,
        },
        event: {
          kind: "node",
          filterValue: eventText,
          sortValue: entry.event,
          node: (
            <span className="block min-w-[18rem] max-w-[42rem]">
              <span className="soft-admin-cell-truncate font-medium text-[var(--soft-ink)]" title={entry.event}>{entry.event}</span>
              {isExpanded ? (
                <span className="mt-2 grid gap-2 rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-2 text-[11px] leading-relaxed text-[var(--soft-ink)] lg:grid-cols-2">
                  <span>
                    <span className="mb-1 block font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Исходная запись</span>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-white/75 p-2">{entry.raw}</pre>
                  </span>
                  <span>
                    <span className="mb-1 block font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Разобранные поля</span>
                    <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded bg-white/75 p-2">{fieldsText}</pre>
                  </span>
                </span>
              ) : null}
            </span>
          ),
        },
        file: {
          value: entry.filePath,
          title: entry.filePath,
          filterValue: entry.filePath,
          sortValue: entry.filePath,
        },
        actions: {
          kind: "actions",
          actions: [{
            label: isExpanded ? "Свернуть запись" : "Открыть запись",
            icon: isExpanded ? "cancel" : "open",
            onClick: () => setExpandedId(isExpanded ? null : entry.id),
          }],
        },
      },
    };
  });

  return (
    <div className="space-y-4" data-testid="admin-runtime-logs-panel">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--soft-ink-soft)]">
          Полнотекстовый поиск в реальном времени
        </span>
        <input
          placeholder="Поиск по событию, requestId, провайдеру, тексту..."
          value={search}
          onChange={(event) => { setStreamState("connecting"); setError(""); setSearch(event.target.value); }}
          className={`${COMPACT_INPUT_CLASS} max-w-sm`}
          aria-label="Полнотекстовый поиск по runtime-логам"
        />
        <span
          className="soft-admin-status-pill ml-auto"
          data-tone={expandedId ? "warn" : streamState === "live" ? "ok" : streamState === "error" ? "danger" : "warn"}
        >
          {expandedId
            ? "пауза · читаете лог"
            : streamState === "live" ? "онлайн" : streamState === "polling" ? "опрос" : streamState === "connecting" ? "подключение" : "ошибка"}
        </span>
      </div>

      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-700">{error}</div>
      )}
      {snapshot?.warning && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-700">{snapshot.warning}</div>
      )}

      {sources.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--soft-ink-soft)]">Источники Runtime</h3>
          <AdminCompactDataTable
            columns={sourcesColumns}
            rows={sourceRows}
            empty="Источники Runtime пока не обнаружены"
            minWidth="980px"
            pageSize={20}
          />
        </div>
      )}

      <AdminCompactDataTable
        columns={runtimeColumns(sources)}
        rows={rows}
        empty="Нет Runtime-записей или источники логов не найдены"
        minWidth="1240px"
        pageSize={20}
      />
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
              className="soft-admin-action"
              data-variant={active ? "primary" : "subtle"}
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
