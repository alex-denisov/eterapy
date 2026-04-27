export const REQUEST_ID_HEADER = "x-request-id";
export const CORRELATION_ID_HEADER = "x-correlation-id";

const REQUEST_ID_PATTERN = /^[a-zA-Z0-9._:-]{8,128}$/;

function safeRandomId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function normalizeRequestId(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!REQUEST_ID_PATTERN.test(trimmed)) return null;
  return trimmed;
}

export function getOrCreateRequestId(headers?: Headers | null): string {
  return normalizeRequestId(headers?.get(REQUEST_ID_HEADER)) ?? safeRandomId();
}

export function getCorrelationId(headers?: Headers | null, requestId = getOrCreateRequestId(headers)): string {
  return normalizeRequestId(headers?.get(CORRELATION_ID_HEADER)) ?? requestId;
}

export function requestContextFromHeaders(headers?: Headers | null) {
  const requestId = getOrCreateRequestId(headers);
  return {
    requestId,
    correlationId: getCorrelationId(headers, requestId),
  };
}

export function applyRequestContextHeaders(
  headers: Headers,
  context: { requestId: string; correlationId?: string }
) {
  headers.set(REQUEST_ID_HEADER, context.requestId);
  headers.set(CORRELATION_ID_HEADER, context.correlationId ?? context.requestId);
}
