import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";

export async function GET(
  _request: Request,
  context: { params: Promise<{ resultId: string }> },
) {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!["ADMIN", "SUPERADMIN"].includes(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { resultId } = await context.params;
  const result = await db.productResult.findUnique({
    where: { id: resultId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return new Response([
    result.title,
    `Клиент: ${result.user.name} <${result.user.email}>`,
    `Продукт: ${result.productKey}`,
    `Статус: ${result.status}`,
    "",
    result.resultText ?? result.previewText ?? "Текст результата отсутствует.",
  ].join("\n"), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
