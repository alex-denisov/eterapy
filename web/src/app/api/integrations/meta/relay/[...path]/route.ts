/**
 * B631 — исходящий контур Meta через нашу же зарубежную ноду.
 *
 * Замер 2026-07-30, один и тот же запрос с двух наших нод:
 *
 * | Имя                  | eterapy-1 (RU) | eterapy-3 (US) |
 * |----------------------|----------------|----------------|
 * | `graph.facebook.com` | таймаут        | 400            |
 * | `graph.instagram.com`| таймаут        | 400            |
 * | `api.instagram.com`  | таймаут        | 404            |
 * | `graph.threads.net`  | 500            | 500            |
 *
 * `graph.instagram.com` и `graph.threads.net` резолвятся в ОДИН адрес
 * `157.240.205.63`: с российской ноды режется имя, а не сеть и не маршрут.
 * Значит Instagram оттуда не опубликуется никогда — сколько бы ни было верных
 * токенов и настроек.
 *
 * Зарубежная нода у нас уже есть и уже получает выкатку (`fleet-matrix.json`,
 * `eterapy-3`, `eterapy-4`). Этот маршрут делает из неё узкий шлюз: только
 * четыре адреса Meta, только с общим секретом, без журналирования тел и
 * токенов.
 *
 * Почему не Cloudflare Worker: доступный агенту токен Cloudflare умеет только
 * DNS (проверено вызовом API — на Workers и Rulesets он отвечает
 * `Authentication error`). Входящее направление это не задело: там достаточно
 * оранжевой записи `hooks.eterapy.com`, которую тот же токен создать может.
 */

import { timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import { META_DIRECT_HOSTS, type MetaUpstream } from "@/lib/marketing/meta-endpoints";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UPSTREAM_KEYS = Object.keys(META_DIRECT_HOSTS) as MetaUpstream[];

/** Заголовки, которые имеет смысл пронести к площадке. Остальное отбрасываем. */
const FORWARDED_HEADERS = ["content-type", "authorization", "accept"];

function unauthorized() {
  return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
}

function secretMatches(provided: string | null) {
  const expected = process.env.META_GRAPH_PROXY_SECRET?.trim();
  if (!expected || !provided) return false;
  const left = Buffer.from(expected);
  const right = Buffer.from(provided);
  return left.length === right.length && timingSafeEqual(left, right);
}

async function relay(request: NextRequest, segments: string[]) {
  if (!secretMatches(request.headers.get("x-eterapy-proxy"))) return unauthorized();

  const [scope, upstreamKey, ...rest] = segments;
  // Единственный разрешённый вид пути — `/graph/<площадка>/<остальное>`.
  if (scope !== "graph") return Response.json({ ok: false, error: "Unknown route" }, { status: 404 });
  if (!UPSTREAM_KEYS.includes(upstreamKey as MetaUpstream)) {
    return Response.json({ ok: false, error: "Unknown upstream" }, { status: 404 });
  }

  const target = new URL(
    `${META_DIRECT_HOSTS[upstreamKey as MetaUpstream]}/${rest.join("/")}`,
  );
  target.search = new URL(request.url).search;

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  try {
    const response = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      signal: AbortSignal.timeout(20_000),
    });
    // Ответ отдаётся как есть: разбирает его вызывающая сторона, а не шлюз.
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
      error: `Meta relay failed: ${error instanceof Error ? error.message : String(error)}`,
    }, { status: 502 });
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return relay(request, (await context.params).path ?? []);
}

export async function POST(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return relay(request, (await context.params).path ?? []);
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  return relay(request, (await context.params).path ?? []);
}
