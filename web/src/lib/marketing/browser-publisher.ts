/**
 * B698 — выпуск через браузерную сессию владельца.
 *
 * ЧТО ИЗМЕНИЛОСЬ ПРОТИВ B617. Раньше этот модуль сам запускал Playwright внутри
 * релизного образа. Chromium весил четверть образа и был снят в B664 — путь
 * остался в коде, но в проде падал понятной фразой и ни разу не сработал.
 *
 * Теперь браузер живёт в отдельном сервисе (`deploy/browser`), а здесь остался
 * его клиент. Три следствия, ради которых так и сделано:
 *
 *   1. Релизный образ не растёт — ограничение B664 в силе.
 *   2. Профиль браузера постоянный и стареет естественно. Слепок `storageState`,
 *      который возили строкой в настройках, — это профиль без прошлого, и для
 *      антифрода он подозрительнее любого флага драйвера.
 *   3. Вход владельца — интерактивный: у Яндекса капча и код из СМС, пройти их
 *      может только человек. Сервис показывает окно, админка его проксирует.
 *
 * ГРАНИЦА. Автоматизируется ТОЛЬКО собственный аккаунт владельца и только
 * собственные публикации — тот же периметр, что в `perimeter.ts`.
 */

import { marketingPlatformValue, requiredMarketingPlatformValue } from "@/lib/marketing/platform-settings";

type BrowserPlatform = "Dzen";

type BrowserPublication = {
  title: string;
  body: string;
  mediaUrl: string | null;
  engagementTargetUrl?: string | null;
};

export type BrowserPublishedPost = {
  externalPostId: string;
  publicUrl: string;
};

export type BrowserSessionHealth = {
  reachable: boolean;
  authorized: boolean;
  /** Почему не готово. `null` — готово. */
  reason: string | null;
};

/** Публикация статьи занимает минуты: ждём дольше обычного внешнего вызова. */
const PUBLISH_TIMEOUT_MS = 170_000;
const CONTROL_TIMEOUT_MS = 45_000;

async function browserService() {
  const endpoint = (await marketingPlatformValue("DZEN_BROWSER_ENDPOINT"))?.replace(/\/+$/, "");
  const token = await marketingPlatformValue("DZEN_BROWSER_TOKEN");
  if (!endpoint || !token) return null;
  return { endpoint, token };
}

/** Настроен ли браузерный путь. Не то же самое, что «сессия жива». */
export async function browserFallbackConfigured(_platform: BrowserPlatform) {
  return Boolean(await browserService());
}

async function callBrowser<T>(input: {
  path: string;
  method: "GET" | "POST";
  body?: unknown;
  timeoutMs: number;
}): Promise<T> {
  const endpoint = (await requiredMarketingPlatformValue("DZEN_BROWSER_ENDPOINT")).replace(/\/+$/, "");
  const token = await requiredMarketingPlatformValue("DZEN_BROWSER_TOKEN");
  const response = await fetch(`${endpoint}${input.path}`, {
    method: input.method,
    headers: {
      "x-eterapy-browser-token": token,
      ...(input.body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: input.body === undefined ? undefined : JSON.stringify(input.body),
    cache: "no-store",
    signal: AbortSignal.timeout(input.timeoutMs),
  });
  const payload = await response.json().catch(() => null) as { error?: string } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? `Браузерный сервис ответил HTTP ${response.status}`);
  }
  return payload as T;
}

/**
 * Состояние сессии. Спрашиваем сервис, а не смотрим на заполненность полей:
 * «поля заполнены» и «площадка нас узнаёт» — разные утверждения, и путать их мы
 * уже научены Meta (B685).
 */
export async function dzenBrowserHealth(): Promise<BrowserSessionHealth> {
  if (!(await browserService())) {
    return { reachable: false, authorized: false, reason: "браузерный сервис не настроен" };
  }
  try {
    const health = await callBrowser<{ authorized: boolean; reason: string | null }>({
      path: "/health",
      method: "GET",
      timeoutMs: CONTROL_TIMEOUT_MS,
    });
    return { reachable: true, authorized: health.authorized, reason: health.reason };
  } catch (error) {
    return {
      reachable: false,
      authorized: false,
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

/** Поднять окно входа. Возвращает то, что нужно проксирующему маршруту админки. */
export async function openDzenBrowserSession(): Promise<{ vncPort: number }> {
  return callBrowser<{ vncPort: number }>({
    path: "/session/open",
    method: "POST",
    body: {},
    timeoutMs: CONTROL_TIMEOUT_MS,
  });
}

export async function closeDzenBrowserSession(): Promise<void> {
  await callBrowser({ path: "/session/close", method: "POST", body: {}, timeoutMs: CONTROL_TIMEOUT_MS });
}

export async function publishToDzenBrowser(
  publication: BrowserPublication,
): Promise<BrowserPublishedPost> {
  const result = await callBrowser<BrowserPublishedPost>({
    path: "/publish/dzen",
    method: "POST",
    body: {
      title: publication.title,
      body: publication.body,
      mediaUrl: publication.mediaUrl,
    },
    timeoutMs: PUBLISH_TIMEOUT_MS,
  });
  if (!result.publicUrl) throw new Error("Браузерный сервис не вернул адрес публикации");
  return { externalPostId: result.externalPostId, publicUrl: result.publicUrl };
}
