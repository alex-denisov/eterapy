/**
 * B633 — общий шлюз наружу (модели и Meta). Логика в
 * `@/lib/integrations/edge-relay`: маршрут здесь только разбирает путь.
 *
 * Живёт на всех нодах, но смысл имеет только на зарубежной: с российской он
 * упрётся в ту же блокировку, что и прямой вызов.
 */

import { NextRequest } from "next/server";
import { handleEdgeRelay } from "@/lib/integrations/edge-relay";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Context = { params: Promise<{ path: string[] }> };

export async function GET(request: NextRequest, context: Context) {
  return handleEdgeRelay(request, (await context.params).path ?? []);
}

export async function POST(request: NextRequest, context: Context) {
  return handleEdgeRelay(request, (await context.params).path ?? []);
}

export async function DELETE(request: NextRequest, context: Context) {
  return handleEdgeRelay(request, (await context.params).path ?? []);
}
