import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext } from "@/lib/api-response";
import { readRuntimeLogSnapshot } from "@/lib/admin-runtime-logs";
import { requestContextFromHeaders } from "@/lib/request-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function parseNumber(value: string | null, fallback: number, max: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }
  const url = request.nextUrl ?? new URL(request.url);

  const limit = parseNumber(url.searchParams.get("limit"), 200, 500);
  const intervalMs = parseNumber(url.searchParams.get("intervalMs"), 3000, 15_000);
  const source = url.searchParams.get("source") ?? "all";
  const level = url.searchParams.get("level") ?? "all";
  const search = url.searchParams.get("q") ?? "";
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendSnapshot = async () => {
        try {
          const snapshot = await readRuntimeLogSnapshot({ limit, source, level, search });
          controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify(snapshot)}\n\n`));
        } catch (error) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({
            message: error instanceof Error ? error.message : String(error),
            generatedAt: new Date().toISOString(),
          })}\n\n`));
        }
      };

      await sendSnapshot();
      timer = setInterval(() => {
        void sendSnapshot();
      }, intervalMs);
    },
    cancel() {
      if (timer) clearInterval(timer);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
