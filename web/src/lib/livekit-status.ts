/**
 * B543 — содержательный статус LiveKit для операционного центра.
 *
 * Прежняя проверка `Boolean(LIVEKIT_API_KEY)` считала «настроено» даже когда
 * сервис крутился на дефолтных `devkey/devsecret` — ровно та дыра, которой
 * оказался INC-067 (в терапевтическую комнату мог войти кто угодно). Теперь
 * дефолтные креды — это СБОЙ, а не «ок».
 */
import type { HealthStatus } from "./health";

/** Значения из docker-образа LiveKit «из коробки». */
const INSECURE_DEFAULTS = new Set(["devkey", "devsecret"]);

export type LivekitStatusInput = {
  url: string | undefined;
  apiKey: string | undefined;
  apiSecret: string | undefined;
};

export type LivekitStatus = {
  status: Extract<HealthStatus, "ok" | "down"> | "missing_config";
  detail: string;
};

/** Показываем только хост: сам URL может содержать токен в query. */
function displayHost(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url;
  }
}

export function evaluateLivekitStatus({ url, apiKey, apiSecret }: LivekitStatusInput): LivekitStatus {
  const missing = [
    ["LIVEKIT_URL", url],
    ["LIVEKIT_API_KEY", apiKey],
    ["LIVEKIT_API_SECRET", apiSecret],
  ]
    .filter(([, value]) => !value?.trim())
    .map(([name]) => name);

  if (missing.length > 0) {
    return { status: "missing_config", detail: `Не заданы: ${missing.join(", ")}` };
  }

  if (INSECURE_DEFAULTS.has(apiKey!.trim()) || INSECURE_DEFAULTS.has(apiSecret!.trim())) {
    return {
      status: "down",
      detail: "Креды по умолчанию (devkey/devsecret) — комната открыта всем, см. INC-067",
    };
  }

  return { status: "ok", detail: `${displayHost(url!)} · ключ ${apiKey!.trim()}` };
}

/** Читает статус из окружения текущего процесса. */
export function getLivekitStatus(): LivekitStatus {
  return evaluateLivekitStatus({
    url: process.env.LIVEKIT_URL,
    apiKey: process.env.LIVEKIT_API_KEY,
    apiSecret: process.env.LIVEKIT_API_SECRET,
  });
}
