import type { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext } from "@/lib/api-response";
import { listMyMapItems } from "@/lib/my-map";
import { requestContextFromHeaders } from "@/lib/request-context";

export async function GET(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const items = await listMyMapItems(userId);
  const body = [
    "Моя карта ETerapy",
    `Экспорт: ${new Date().toLocaleString("ru-RU")}`,
    "",
    ...items.map((item, index) => [
      `${index + 1}. ${item.title}`,
      item.eyebrow,
      `Обновлено: ${item.updatedAt.toLocaleDateString("ru-RU")}`,
      item.exportText,
    ].join("\n")),
  ].join("\n\n---\n\n");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "attachment; filename=\"eterapy-my-map.txt\"",
      "Cache-Control": "no-store",
    },
  });
}
