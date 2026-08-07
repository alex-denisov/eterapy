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

import { dzenLoginUrlFrom, dzenStudioUrlFrom } from "@/lib/marketing/dzen-studio";
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
  /** Логин аккаунта, под которым живёт сессия. `null` — не вошёл никто. */
  account: string | null;
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

/**
 * Адрес студии. Сервис его не выдумывает: у него нет ни настроек площадки, ни
 * тестов, а ошибка в этом адресе уже стоила владельцу входа (студия живёт по
 * `/profile/editor/<канал>`, а мы ходили на `/profile/editor`).
 */
async function dzenStudioUrl(): Promise<string> {
  // Хвост `is not configured` — не украшение: по нему отказ распознаётся как
  // отказ КАНАЛА (B636). Неисправная настройка ставит площадку на паузу, а не
  // бракует материал и не сжигает его слот.
  const channelUrl = await marketingPlatformValue("DZEN_CHANNEL_URL");
  if (!channelUrl) {
    throw new Error("не задан адрес канала Дзена в «Площадки и возможности» (DZEN_CHANNEL_URL is not configured)");
  }
  try {
    return dzenStudioUrlFrom(channelUrl);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`${detail} (DZEN_CHANNEL_URL is not configured)`);
  }
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
    return { reachable: false, authorized: false, reason: "браузерный сервис не настроен", account: null };
  }

  // Без адреса канала пробу делать нечем — но спросить сервис, жив ли он, всё
  // равно надо: окно входа показывается именно по этому признаку, а владельцу
  // без окна не войти.
  let studioUrl: string | null = null;
  let studioProblem: string | null = null;
  try {
    studioUrl = await dzenStudioUrl();
  } catch (error) {
    studioProblem = error instanceof Error ? error.message : String(error);
  }

  try {
    // `probe=1` — просим сервис реально сходить на площадку. Дешёвая проверка
    // без пробы отвечает «жив ли процесс», а нам здесь нужно «узнаёт ли нас
    // Дзен»: путать эти два ответа мы уже научены на Meta (B685).
    const health = await callBrowser<{
      authorized: boolean | null;
      reason: string | null;
      account?: string | null;
    }>({
      path: studioUrl ? `/health?probe=1&studio=${encodeURIComponent(studioUrl)}` : "/health",
      method: "GET",
      timeoutMs: CONTROL_TIMEOUT_MS,
    });
    return {
      reachable: true,
      authorized: studioProblem === null && health.authorized === true,
      reason: studioProblem ?? health.reason,
      account: health.account ?? null,
    };
  } catch (error) {
    return {
      reachable: false,
      authorized: false,
      reason: error instanceof Error ? error.message : String(error),
      account: null,
    };
  }
}

/**
 * Поднять окно входа.
 *
 * Окно наводится на форму Яндекс ID, а НЕ на страницу площадки: со страницы
 * Дзена вход не начинается, а с несуществующей — тем более. Ровно на этом
 * владелец и застрял: окно открывалось на 404-странице без единой кнопки.
 */
export async function openDzenBrowserSession(): Promise<{ vncPort: number }> {
  const studioUrl = await dzenStudioUrl();
  return callBrowser<{ vncPort: number }>({
    path: "/session/open",
    method: "POST",
    body: { studioUrl, loginUrl: dzenLoginUrlFrom(studioUrl) },
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
      // Тот же адрес, что и у проверки: разъедься они — «подключено» перестало
      // бы означать «получится выпустить».
      studioUrl: await dzenStudioUrl(),
    },
    timeoutMs: PUBLISH_TIMEOUT_MS,
  });
  if (!result.publicUrl) throw new Error("Браузерный сервис не вернул адрес публикации");
  return { externalPostId: result.externalPostId, publicUrl: result.publicUrl };
}
