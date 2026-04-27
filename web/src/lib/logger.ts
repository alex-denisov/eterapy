type LogLevel = "debug" | "info" | "warn" | "error";
type LogFields = Record<string, unknown>;

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 6;

const SENSITIVE_KEY_PATTERN =
  /(authorization|cookie|set-cookie|password|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential|code_verifier|verification|reset|email|phone|telegram|card|last4|prompt|question|content|body|text)/i;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value) && !(value instanceof Date) && !(value instanceof Error);
}

function redactValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[MaxDepth]";
  if (value instanceof Error) return serializeError(value);
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map((item) => redactValue(item, depth + 1));
  if (!isPlainObject(value)) return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redactValue(entry, depth + 1),
    ])
  );
}

export function redactForLog(fields: LogFields = {}): LogFields {
  return redactValue(fields) as LogFields;
}

export function serializeError(error: unknown): LogFields {
  if (error instanceof Error) {
    const serialized: LogFields = {
      name: error.name,
      message: error.message,
    };
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" || typeof code === "number") {
      serialized.code = code;
    }
    if (process.env.NODE_ENV !== "production" && error.stack) {
      serialized.stack = error.stack;
    }
    return serialized;
  }
  return { message: String(error) };
}

function write(level: LogLevel, event: string, fields: LogFields = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...redactForLog(fields),
  };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  if (level === "debug") {
    console.debug(line);
    return;
  }
  console.info(line);
}

export const log = {
  debug: (event: string, fields?: LogFields) => write("debug", event, fields),
  info: (event: string, fields?: LogFields) => write("info", event, fields),
  warn: (event: string, fields?: LogFields) => write("warn", event, fields),
  error: (event: string, fields?: LogFields) => write("error", event, fields),
};
