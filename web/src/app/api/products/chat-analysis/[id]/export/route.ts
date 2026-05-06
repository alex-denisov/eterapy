import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { errorWithRequestContext } from "@/lib/api-response";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const { id } = await params;
  const result = await db.productResult.findFirst({
    where: { id, userId, productKey: "chat-analysis", deletedAt: null },
  });

  if (!result || result.status !== "READY" || !result.resultText) {
    return errorWithRequestContext("NOT_FOUND", "Result not found", 404, context);
  }

  await db.productResult.update({ where: { id }, data: { exportedAt: new Date() } });

  const safeFilename = result.title.replace(/[^a-z0-9а-яё]/gi, "-").replace(/-+/g, "-").toLowerCase();
  
  return new Response(result.resultText, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="eterapy-${safeFilename}-${result.id.slice(-6)}.txt"`,
    },
  });
}
