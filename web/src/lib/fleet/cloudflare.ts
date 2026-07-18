/**
 * B544 — Cloudflare-воркеры в мониторинге флота.
 *
 * Читает список Worker-скриптов аккаунта (TG-релей, geo-роутер B540) и когда
 * их деплоили. Токен — read-only, живёт только в `/opt/eterapy/.env`, уходит
 * заголовком и вычищается из любых сообщений об ошибке.
 */

export type CloudflareWorker = {
  name: string;
  modifiedOn: string | null;
};

export type CloudflareWorkersResult = {
  status: "ok" | "down" | "missing_config";
  detail: string;
  workers: CloudflareWorker[];
};

export type CloudflareOptions = {
  accountId: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

function redact(text: string, token: string): string {
  return token ? text.split(token).join("***") : text;
}

export async function checkCloudflareWorkers({
  accountId,
  token,
  fetchImpl = fetch,
  timeoutMs = 6000,
}: CloudflareOptions): Promise<CloudflareWorkersResult> {
  if (!accountId || !token) {
    return {
      status: "missing_config",
      detail: "Не заданы CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN",
      workers: [],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts`,
      {
        headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
        signal: controller.signal,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      return {
        status: "down",
        detail: `Cloudflare API: HTTP ${response.status} ${redact(body, token).slice(0, 200)}`.trim(),
        workers: [],
      };
    }

    const payload = (await response.json()) as { success?: boolean; result?: unknown };
    const list = Array.isArray(payload.result) ? payload.result : [];

    const workers: CloudflareWorker[] = list
      .map((raw) => {
        if (!raw || typeof raw !== "object") return null;
        const record = raw as Record<string, unknown>;
        const name = typeof record.id === "string" ? record.id : "";
        if (!name) return null;
        return {
          name,
          modifiedOn: typeof record.modified_on === "string" ? record.modified_on : null,
        };
      })
      .filter((worker): worker is CloudflareWorker => worker !== null);

    return {
      status: "ok",
      detail: `${workers.length} воркеров в аккаунте`,
      workers,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "down", detail: redact(message, token), workers: [] };
  } finally {
    clearTimeout(timer);
  }
}

export function getCloudflareConfig() {
  return {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
    token: process.env.CLOUDFLARE_API_TOKEN ?? "",
  };
}
