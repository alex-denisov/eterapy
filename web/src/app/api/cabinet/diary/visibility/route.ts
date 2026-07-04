import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { mergeDiaryMetadata } from "@/lib/diary";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { requestContextFromHeaders } from "@/lib/request-context";

// B464 round-6 #6 — hide/unhide a разбор from the «ваши результаты» preview
// (and the diary map) straight from the redesigned result row. Same effect as
// the /diary server action (hiddenFromMap metadata flag), reachable from the
// client dashboard row. Reversible: unhide lives on /diary.
const bodySchema = z.object({
  kind: z.enum(["dialogue", "product"]),
  id: z.string().min(1),
  hidden: z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorWithRequestContext("VALIDATION_ERROR", "Invalid body", 400, context);
  }
  const { kind, id, hidden } = parsed.data;
  const patch = hidden
    ? { hiddenFromMap: true, hiddenFromMapAt: new Date().toISOString() }
    : { hiddenFromMap: false };

  if (kind === "dialogue") {
    const item = await db.dialogue.findFirst({ where: { id, userId }, select: { id: true, metadata: true } });
    if (!item) return errorWithRequestContext("NOT_FOUND", "Not found", 404, context);
    await db.dialogue.update({ where: { id: item.id }, data: { metadata: mergeDiaryMetadata(item.metadata, patch) } });
  } else {
    const item = await db.productResult.findFirst({ where: { id, userId }, select: { id: true, metadata: true } });
    if (!item) return errorWithRequestContext("NOT_FOUND", "Not found", 404, context);
    await db.productResult.update({ where: { id: item.id }, data: { metadata: mergeDiaryMetadata(item.metadata, patch) } });
  }

  return jsonWithRequestContext({ ok: true, hidden }, { status: 200 }, context);
}
