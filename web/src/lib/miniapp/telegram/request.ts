import type { NextRequest } from "next/server";

const MINIAPP_AUTH_BODY_MAX_BYTES = 20_000;

function firstForwarded(value: string | null) {
  return value?.split(",")[0]?.trim() || null;
}

function publicOrigin(request: NextRequest) {
  const host = firstForwarded(request.headers.get("x-forwarded-host"))
    ?? request.headers.get("host")
    ?? request.nextUrl.host;
  const proto = firstForwarded(request.headers.get("x-forwarded-proto"))
    ?? request.nextUrl.protocol.replace(":", "");
  return `${proto}://${host}`;
}

export function isSameOriginMiniAppRequest(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return false;
  try {
    return new URL(origin).origin === new URL(publicOrigin(request)).origin;
  } catch {
    return false;
  }
}

export async function readMiniAppInitData(request: NextRequest) {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { ok: false as const, status: 415, error: "Ожидается JSON" };
  }
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MINIAPP_AUTH_BODY_MAX_BYTES) {
    return { ok: false as const, status: 413, error: "Запрос слишком большой" };
  }

  const reader = request.body?.getReader();
  if (!reader) return { ok: false as const, status: 400, error: "Пустой запрос" };
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MINIAPP_AUTH_BODY_MAX_BYTES) {
        await reader.cancel();
        return { ok: false as const, status: 413, error: "Запрос слишком большой" };
      }
      chunks.push(value);
    }
    const body = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      body.set(chunk, offset);
      offset += chunk.byteLength;
    }
    const parsed = JSON.parse(new TextDecoder().decode(body)) as { initData?: unknown };
    return { ok: true as const, initData: typeof parsed.initData === "string" ? parsed.initData : "" };
  } catch {
    return { ok: false as const, status: 400, error: "Некорректный запрос" };
  }
}
