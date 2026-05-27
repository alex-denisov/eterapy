import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { redactForLog } from "@/lib/logger";

const DEFAULT_MAX_LINES = 200;
const MAX_LINES = 500;
const MAX_TAIL_BYTES = 512 * 1024;
const MAX_RAW_LENGTH = 3000;

const STRING_REDACTIONS: Array<[RegExp, string]> = [
  [/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[EMAIL]"],
  [/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]"],
  [/\b(eterapy_guest_session|next-auth\.session-token|__Secure-next-auth\.session-token)=([^;\s]+)/gi, "$1=[REDACTED]"],
  [/\b(api[_-]?key|access[_-]?key|secret|token|password|authorization|cookie)=([^&\s]+)/gi, "$1=[REDACTED]"],
];

export interface RuntimeLogSource {
  key: string;
  label: string;
  path: string;
  exists: boolean;
  sizeBytes?: number;
  updatedAt?: string;
  error?: string;
}

export interface RuntimeLogEntry {
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

export interface RuntimeLogSnapshot {
  generatedAt: string;
  entries: RuntimeLogEntry[];
  sources: RuntimeLogSource[];
  warning?: string;
}

export interface RuntimeLogQuery {
  limit?: number;
  source?: string;
  level?: string;
  search?: string;
}

function sanitizeString(value: string) {
  return STRING_REDACTIONS.reduce((current, [pattern, replacement]) => current.replace(pattern, replacement), value);
}

function sanitizeValue(value: unknown): unknown {
  if (typeof value === "string") return sanitizeString(value);
  if (Array.isArray(value)) return value.map(sanitizeValue);
  if (typeof value === "object" && value !== null) {
    const redacted = redactForLog(value as Record<string, unknown>);
    return Object.fromEntries(
      Object.entries(redacted).map(([key, entry]) => [key, sanitizeValue(entry)]),
    );
  }
  return value;
}

function stripAnsi(value: string) {
  return value.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

function clampLimit(value: number | undefined) {
  if (!Number.isFinite(value) || !value || value < 1) return DEFAULT_MAX_LINES;
  return Math.min(Math.floor(value), MAX_LINES);
}

function normalizeSourceKey(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "runtime";
}

function configuredSources(): Array<{ key: string; label: string; path: string }> {
  const raw = process.env.ETERAPY_RUNTIME_LOG_FILES;
  if (!raw) return [];

  return raw
    .split(/[,\n;]/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((entry, index) => {
      const separator = entry.indexOf("=");
      if (separator > 0) {
        const label = entry.slice(0, separator).trim();
        return {
          key: normalizeSourceKey(label),
          label,
          path: entry.slice(separator + 1).trim(),
        };
      }
      return {
        key: `configured-${index + 1}`,
        label: `Configured ${index + 1}`,
        path: entry,
      };
    });
}

function defaultSources(): Array<{ key: string; label: string; path: string }> {
  const pm2Home = process.env.PM2_HOME || path.join(os.homedir(), ".pm2");
  return [
    { key: "app-out", label: "ETerapy app stdout", path: path.join(pm2Home, "logs", "eterapy-out.log") },
    { key: "app-error", label: "ETerapy app stderr", path: path.join(pm2Home, "logs", "eterapy-error.log") },
    { key: "worker-out", label: "ETerapy worker stdout", path: path.join(pm2Home, "logs", "eterapy-worker-out.log") },
    { key: "worker-error", label: "ETerapy worker stderr", path: path.join(pm2Home, "logs", "eterapy-worker-error.log") },
  ];
}

async function sourceWithStats(source: { key: string; label: string; path: string }): Promise<RuntimeLogSource> {
  try {
    const stats = await fs.stat(source.path);
    return {
      ...source,
      exists: stats.isFile(),
      sizeBytes: stats.size,
      updatedAt: stats.mtime.toISOString(),
    };
  } catch (error) {
    return {
      ...source,
      exists: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export async function resolveRuntimeLogSources(): Promise<RuntimeLogSource[]> {
  const sources = configuredSources();
  const candidates = sources.length > 0 ? sources : defaultSources();
  return Promise.all(candidates.map(sourceWithStats));
}

async function tailFile(filePath: string, maxBytes = MAX_TAIL_BYTES) {
  const handle = await fs.open(filePath, "r");
  try {
    const stats = await handle.stat();
    const length = Math.min(stats.size, maxBytes);
    const position = Math.max(0, stats.size - length);
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, position);
    return buffer.toString("utf8").split(/\r?\n/).filter((line) => line.trim().length > 0);
  } finally {
    await handle.close();
  }
}

function parseStructuredLine(rawLine: string): {
  level: RuntimeLogEntry["level"];
  event: string;
  timestamp: string | null;
  fields: Record<string, unknown>;
} {
  const line = stripAnsi(rawLine).trim();
  const jsonStart = line.indexOf("{");
  if (jsonStart >= 0) {
    try {
      const parsed = JSON.parse(line.slice(jsonStart)) as Record<string, unknown>;
      const redacted = sanitizeValue(parsed) as Record<string, unknown>;
      const level = typeof redacted.level === "string" && ["debug", "info", "warn", "error"].includes(redacted.level)
        ? redacted.level as RuntimeLogEntry["level"]
        : "unknown";
      const event = typeof redacted.event === "string"
        ? redacted.event
        : typeof redacted.message === "string"
          ? redacted.message.slice(0, 120)
          : "structured-log";
      const timestamp = typeof redacted.ts === "string"
        ? redacted.ts
        : typeof redacted.timestamp === "string"
          ? redacted.timestamp
          : typeof redacted.time === "string"
            ? redacted.time
            : null;
      const { level: _level, event: _event, ts: _ts, timestamp: _timestamp, time: _time, ...fields } = redacted;
      void _level;
      void _event;
      void _ts;
      void _timestamp;
      void _time;
      return { level, event, timestamp, fields };
    } catch {
      // Fall through to raw parsing.
    }
  }

  const timestampMatch = line.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?):?\s*(.*)$/);
  const timestamp = timestampMatch?.[1] ?? null;
  const afterTimestamp = timestampMatch?.[2]?.trim() ?? line;
  const bracketTags = [...afterTimestamp.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]).slice(0, 8);
  const withoutTags = afterTimestamp.replace(/^(?:\[[^\]]+\]\s*)+/, "").trim();
  const levelTag = bracketTags.find((tag) => /^(error|warn|warning|info|debug)$/i.test(tag));
  const levelMatch = levelTag ? [levelTag, levelTag] : afterTimestamp.match(/\b(error|warn|warning|info|debug)\b/i);
  const normalizedLevel = levelMatch?.[1]?.toLowerCase();
  const level = normalizedLevel === "warning" ? "warn"
    : ["error", "warn", "info", "debug"].includes(normalizedLevel ?? "")
      ? normalizedLevel as RuntimeLogEntry["level"]
      : "unknown";
  return {
    level,
    event: (withoutTags || afterTimestamp).slice(0, 160) || "raw-log",
    timestamp,
    fields: bracketTags.length > 0 ? { tags: bracketTags } : {},
  };
}

function parseLogLine(source: RuntimeLogSource, rawLine: string, index: number): RuntimeLogEntry {
  const parsed = parseStructuredLine(rawLine);
  const cleanLine = stripAnsi(rawLine).trim();
  const jsonStart = cleanLine.indexOf("{");
  let raw = sanitizeString(cleanLine);
  if (jsonStart >= 0) {
    try {
      raw = JSON.stringify(sanitizeValue(JSON.parse(cleanLine.slice(jsonStart))));
    } catch {
      raw = sanitizeString(cleanLine);
    }
  }
  raw = raw.slice(0, MAX_RAW_LENGTH);
  return {
    id: `${source.key}:${index}:${raw.slice(0, 32)}`,
    source: source.key,
    sourceLabel: source.label,
    filePath: source.path,
    level: parsed.level,
    event: sanitizeString(parsed.event),
    timestamp: parsed.timestamp,
    raw,
    fields: parsed.fields,
  };
}

function compareEntriesDesc(a: RuntimeLogEntry, b: RuntimeLogEntry) {
  const aTime = a.timestamp ? Date.parse(a.timestamp) : 0;
  const bTime = b.timestamp ? Date.parse(b.timestamp) : 0;
  return bTime - aTime;
}

export async function readRuntimeLogSnapshot(query: RuntimeLogQuery = {}): Promise<RuntimeLogSnapshot> {
  const limit = clampLimit(query.limit);
  const level = query.level && query.level !== "all" ? query.level.toLowerCase() : null;
  const sourceFilter = query.source && query.source !== "all" ? query.source : null;
  const search = query.search?.trim().toLowerCase() || null;
  const sources = await resolveRuntimeLogSources();
  const readableSources = sources.filter((source) => source.exists && (!sourceFilter || source.key === sourceFilter));
  const entries: RuntimeLogEntry[] = [];
  const warnings: string[] = [];

  await Promise.all(readableSources.map(async (source) => {
    try {
      const lines = await tailFile(source.path);
      const parsed = lines.slice(-limit).map((line, index) => parseLogLine(source, line, index));
      entries.push(...parsed);
    } catch (error) {
      warnings.push(`${source.label}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }));

  const filtered = entries
    .filter((entry) => !level || entry.level === level)
    .filter((entry) => !search || [
      entry.level,
      entry.event,
      entry.raw,
      JSON.stringify(entry.fields),
      entry.sourceLabel,
    ].join(" ").toLowerCase().includes(search))
    .sort(compareEntriesDesc)
    .slice(0, limit);

  return {
    generatedAt: new Date().toISOString(),
    entries: filtered,
    sources,
    warning: warnings.length > 0 ? warnings.join("; ") : undefined,
  };
}
