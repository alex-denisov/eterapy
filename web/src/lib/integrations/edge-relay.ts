/**
 * B633 — общий шлюз наружу через нашу зарубежную ноду.
 *
 * Замер прода 2026-07-30 22:00 UTC (живая проба всех провайдеров с боевой ноды):
 *
 * | Провайдер | Путь | Ответ |
 * |---|---|---|
 * | OpenAI | Cloudflare AI Gateway | `403 Country, region, or territory not supported` |
 * | OpenRouter | Cloudflare AI Gateway | `403 "Access denied by security policy."` |
 * | Groq | напрямую | `403 Forbidden` |
 * | Cerebras | напрямую | `403` (страница защиты Cloudflare) |
 * | Gemini, Mistral, Cohere | напрямую | успех |
 *
 * Главный вывод: **Cloudflare AI Gateway географию не скрывает.** Он ходит к
 * провайдеру из ближайшей к нам точки присутствия, провайдер видит российский
 * выход и отказывает — то есть три провайдера из пула мертвы не по ключам и не
 * по квоте, а по стране. У Anthropic причина другая и к стране отношения не
 * имеет: `INSUFFICIENT_CREDITS` с 6 июня.
 *
 * Шлюз — тот же приём, что уже сработал для Meta (B631): наша собственная
 * зарубежная нода из `fleet-matrix.json`, тот же образ, та же выкатка. Отличие
 * от стороннего прокси принципиальное: ключи провайдеров не покидают наш контур.
 *
 * Границы намеренно узкие:
 *  • список адресов закрытый — произвольный хост через шлюз не пройдёт;
 *  • обязателен общий секрет в заголовке, иначе 403;
 *  • тела запросов и ответов не журналируются вовсе.
 */

import { timingSafeEqual } from "node:crypto";

/** Адреса, к которым шлюзу разрешено ходить. Ключ — первый сегмент пути. */
export const EDGE_RELAY_UPSTREAMS = {
  // Meta (B631)
  instagram: "https://graph.instagram.com",
  facebook: "https://graph.facebook.com",
  threads: "https://graph.threads.net",
  "instagram-oauth": "https://api.instagram.com",
  // Модели (B633)
  openai: "https://api.openai.com",
  openrouter: "https://openrouter.ai",
  groq: "https://api.groq.com",
  cerebras: "https://api.cerebras.ai",
  mistral: "https://api.mistral.ai",
  // Канонический хост Cohere. `api.cohere.ai` — живой legacy-алиас (отвечает
  // корректной ошибкой авторизации), но именно на `api.cohere.com` пересылал
  // запросы шлюз Cloudflare, на котором Cohere работал. Держим тот же адрес,
  // чтобы разница с прежним рабочим маршрутом была нулевой.
  cohere: "https://api.cohere.com",
  anthropic: "https://api.anthropic.com",
  gemini: "https://generativelanguage.googleapis.com",
  // Бесплатные тарифы (B703). Адреса — те, что реально отвечают боевым
  // ключам: `kilo.ai` (а не `kilocode.ai`, который переносит редиректом) и
  // `api.tokenrouter.com` (а не `.io`, который ждёт ключ другого формата).
  kilocode: "https://kilo.ai",
  nvidia: "https://integrate.api.nvidia.com",
  "opencode-zen": "https://opencode.ai",
  tokenrouter: "https://api.tokenrouter.com",
  sambanova: "https://api.sambanova.ai",
  pollinations: "https://text.pollinations.ai",
  huggingface: "https://router.huggingface.co",
} as const;

export type EdgeRelayUpstream = keyof typeof EDGE_RELAY_UPSTREAMS;

export const EDGE_RELAY_SECRET_HEADER = "x-eterapy-proxy";

/**
 * Заголовки, которые до провайдера не доходят.
 *
 * `host` и `content-length` пересобирает сам `fetch`; секрет шлюза наружу
 * отдавать нельзя; `cookie` не относится к вызову модели вовсе и мог бы унести
 * сессию нашего же домена третьей стороне.
 */
const STRIPPED_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "cookie",
  EDGE_RELAY_SECRET_HEADER,
  // B703 — заголовки НАШЕГО перехода не должны доезжать до провайдера.
  //
  // Их проставляет nginx перед Next, и до появления Hugging Face они выглядели
  // безобидным шумом. Оказалось — нет: CDN провайдера маршрутизирует ПО
  // `x-forwarded-host`, и с ним `router.huggingface.co` отдаёт сайт
  // huggingface.co вместо API. Ответ при этом `200`, и разбор уходит искать
  // ошибку в адресе или в ключе. Воспроизведено голым curl: тот же запрос с
  // одним лишним заголовком возвращает HTML, без него — JSON каталога.
  //
  // `x-forwarded-for` и `x-real-ip` снимаются и по второй причине: это адрес
  // нашего же узла, и отдавать его третьей стороне незачем.
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-for",
  "x-forwarded-port",
  "x-forwarded-server",
  "x-real-ip",
]);

export function isEdgeRelayUpstream(value: string): value is EdgeRelayUpstream {
  return Object.prototype.hasOwnProperty.call(EDGE_RELAY_UPSTREAMS, value);
}

/**
 * B634 — база шлюза для моделей.
 *
 * Считается из `META_GRAPH_PROXY_BASE`, а не заводится второй переменной: нода
 * и секрет у контуров общие, и две переменные для одного шлюза означали бы
 * однажды настроить половину. Из значения берётся только origin — сама
 * переменная на проде указывает на путь контура Meta
 * (`…/api/integrations/meta/relay`), а моделям нужен свой маршрут.
 *
 * Без секрета база не возвращается вовсе: адрес без секрета получит от шлюза
 * 403, и подставлять его значило бы менять «шлюз не настроен» на «модель не
 * отвечает».
 */
export function edgeRelayModelBase(): string | null {
  const configured = process.env.META_GRAPH_PROXY_BASE?.trim();
  if (!configured || !process.env.META_GRAPH_PROXY_SECRET?.trim()) return null;
  try {
    return `${new URL(configured).origin}/api/integrations/edge/relay`;
  } catch {
    return null;
  }
}

export function edgeRelaySecretMatches(provided: string | null): boolean {
  const expected = process.env.META_GRAPH_PROXY_SECRET?.trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Собирает адрес у провайдера. Путь и строка запроса переносятся как есть:
 * шлюз ничего не нормализует — любая правка здесь сломала бы подписи и
 * пагинацию, которые считает сам провайдер.
 */
export function edgeRelayTarget(upstream: EdgeRelayUpstream, rest: string[], search: string) {
  const url = new URL(`${EDGE_RELAY_UPSTREAMS[upstream]}/${rest.join("/")}`);
  url.search = search;
  return url;
}

export function edgeRelayHeaders(source: Headers): Headers {
  const headers = new Headers();
  source.forEach((value, name) => {
    if (!STRIPPED_HEADERS.has(name.toLowerCase())) headers.set(name, value);
  });
  return headers;
}

/**
 * Единственный обработчик для обоих маршрутов шлюза. Ответ провайдера
 * отдаётся как есть: разбирает его вызывающая сторона.
 */
export async function handleEdgeRelay(request: Request, segments: string[]): Promise<Response> {
  if (!edgeRelaySecretMatches(request.headers.get(EDGE_RELAY_SECRET_HEADER))) {
    return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }
  const [upstreamKey, ...rest] = segments;
  if (!upstreamKey || !isEdgeRelayUpstream(upstreamKey)) {
    return Response.json({ ok: false, error: "Unknown upstream" }, { status: 404 });
  }
  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const response = await fetch(edgeRelayTarget(upstreamKey, rest, new URL(request.url).search), {
      method: request.method,
      headers: edgeRelayHeaders(request.headers),
      body: hasBody ? await request.arrayBuffer() : undefined,
      signal: AbortSignal.timeout(120_000),
    });
    return new Response(response.body, {
      status: response.status,
      headers: {
        "content-type": response.headers.get("content-type") ?? "application/json",
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    return Response.json({
      ok: false,
      error: `Edge relay failed: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 502 });
  }
}
