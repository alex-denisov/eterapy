/**
 * B742 — маршрут к Gemini через Vertex AI, ради бонусных кредитов Google Cloud.
 *
 * ⚠ ЧТО ИМЕННО ЭТО МЕНЯЕТ ДЛЯ ВЛАДЕЛЬЦА. Ровно одно: чей кошелёк платит.
 * Модель та же, качество то же, тело запроса то же. $300 пробного периода
 * Google Cloud нельзя потратить на Gemini API в AI Studio — Google вынес его
 * из покрытия — и МОЖНО на Vertex AI (с мая 2026 он же Gemini Enterprise
 * Agent Platform). Перевод головы пула на этот маршрут превращает недоступные
 * бонусы в оплаченные обращения, не добавляя ни рубля своих денег.
 *
 * ⚠ ПОЧЕМУ ЭТО НЕ НОВЫЙ ПРОВАЙДЕР В ЕНУМЕ. Провайдер у нас — единица учёта:
 * у него свой потолок расхода, своё место в очереди, свои предпочтения модели
 * у автора и редактора, своя строка в панели и свои credential'ы. Vertex — не
 * другой поставщик, а другая дверь к тому же. Заведи мы `AIProvider.VERTEX` —
 * пришлось бы раздваивать потолок ($1/сутки на каждого вместо $1 на обоих),
 * ротацию и предпочтения, то есть чинить руками ровно то, что сейчас работает
 * само. Поэтому Vertex — это СВОЙСТВО КЛЮЧА, а не новый провайдер: секрет в
 * виде JSON сервисного аккаунта означает «этот ключ ходит через Vertex».
 * Ровно тот «признак is vertex», о котором спрашивал владелец, только живёт он
 * в самом ключе и не требует второй настройки, которую можно забыть.
 *
 * ⚠ РЕГИОН. Vertex адресуется регионом в хосте И в пути. `global` — то, что
 * Google советует по умолчанию для моделей Gemini: он не привязывает нас к
 * одной площадке и не требует угадывать, где модель уже выкачена.
 */

import { AIProvider } from "@prisma/client";
import type { AIGatewayAdapter } from "@/lib/ai-gateway/adapters";
import { createGeminiAdapter, type GeminiTransport } from "@/lib/ai-gateway/gemini-adapter";
import {
  parseServiceAccount,
  serviceAccountAccessToken,
  type GoogleServiceAccount,
} from "@/lib/ai-gateway/google-service-account";
import { cloudflareGatewayAuthHeaders, isCloudflareAIGatewayUrl } from "@/lib/ai-gateway/cloudflare-gateway";

export const VERTEX_DEFAULT_LOCATION = "global";

export interface VertexAdapterOptions {
  /** Секрет credential'а: JSON сервисного аккаунта Google Cloud. */
  serviceAccountJson?: string;
  /** Готовый разобранный аккаунт — короткий путь для прогонов. */
  account?: GoogleServiceAccount | null;
  /**
   * Адрес шлюза. Пусто — идём прямо на `{регион}-aiplatform.googleapis.com`.
   * Непусто — это шлюз Cloudflare или наш собственный, и путь к нему тот же.
   */
  baseURL?: string;
  location?: string;
  defaultModel?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

/**
 * Адрес модели у Vertex.
 *
 * ⚠ В ПУТИ ДВАЖДЫ ОДНО И ТО ЖЕ — РЕГИОН В ХОСТЕ И РЕГИОН В ПУТИ. Это не
 * дублирование по невнимательности, так устроен сам Vertex: хост выбирает
 * площадку, путь называет ресурс. Несовпадение даёт 404, а не понятный отказ.
 */
export function vertexModelUrl(input: {
  projectId: string;
  location: string;
  model: string;
  baseURL?: string;
}): string {
  const path = `v1/projects/${input.projectId}/locations/${input.location}`
    + `/publishers/google/models/${input.model}:generateContent`;
  const host = input.baseURL?.trim()
    ? input.baseURL.replace(/\/+$/, "")
    : `https://${input.location === "global" ? "" : `${input.location}-`}aiplatform.googleapis.com`;
  return `${host}/${path}`;
}

export function createVertexAdapter(options: VertexAdapterOptions = {}): AIGatewayAdapter {
  const account = options.account ?? parseServiceAccount(options.serviceAccountJson);
  const location = options.location?.trim() || VERTEX_DEFAULT_LOCATION;
  const fetchImpl = options.fetchImpl ?? fetch;
  const baseURL = options.baseURL?.trim() || undefined;

  const transport: GeminiTransport = {
    configured: Boolean(account),
    missingConfigMessage:
      "Vertex service account is not configured (нужен JSON сервисного аккаунта Google Cloud)",
    url(model) {
      // Проверка `configured` уже прошла в адаптере — здесь аккаунт есть.
      return vertexModelUrl({
        projectId: account!.projectId,
        location,
        model,
        baseURL,
      });
    },
    async headers() {
      const token = await serviceAccountAccessToken({ account: account!, fetchImpl });
      return {
        authorization: `Bearer ${token}`,
        // Шлюз (Cloudflare или наш собственный) требует собственного ключа
        // поверх авторизации провайдера — тот же приём, что у AI Studio.
        ...(baseURL ? cloudflareGatewayAuthHeaders(baseURL) : {}),
      };
    },
  };

  return createGeminiAdapter({
    transport,
    // ⚠ Тело запроса собирает адаптер Gemini, и `baseURL` ему НЕ передаётся:
    // при сменном транспорте адрес строит транспорт, а `baseURL` внутри
    // включил бы ещё и подстановку системной инструкции в первое сообщение,
    // которая нужна только шлюзу AI Studio.
    ...(options.defaultModel ? { defaultModel: options.defaultModel } : {}),
    ...(options.timeoutMs ? { timeoutMs: options.timeoutMs } : {}),
    fetchImpl,
  });
}

/** Ходит ли этот ключ через Vertex. Ответ живёт в самом секрете. */
export function credentialUsesVertex(secret: string | null | undefined): boolean {
  return parseServiceAccount(secret) !== null;
}

/** Провайдер остаётся GEMINI: Vertex — дверь, а не поставщик. */
export const VERTEX_PROVIDER = AIProvider.GEMINI;

/** Узнаём адрес шлюза Cloudflare, настроенный на Vertex. */
export function isVertexGatewayUrl(url: string | undefined | null): boolean {
  return isCloudflareAIGatewayUrl(url) && Boolean(url?.includes("google-vertex-ai"));
}
