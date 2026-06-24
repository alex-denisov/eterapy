import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { formatDateTime } from "@/app/admin/admin-analytics-ui";

export async function GET(
  _request: Request,
  context: { params: Promise<{ transactionId: string }> },
) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { transactionId } = await context.params;
  const tx = await db.transaction.findUnique({
    where: { id: transactionId },
    include: { user: { select: { name: true, email: true } } },
  });
  if (!tx) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = [
    "ETerapy · локальная карточка чека",
    `Timestamp: ${formatDateTime(tx.createdAt)}`,
    `Клиент: ${tx.user.name} <${tx.user.email}>`,
    `Сумма: ${tx.amount / 100} ${tx.currency}`,
    `Статус: ${tx.status}`,
    `Провайдер: ${tx.provider}`,
    `Provider payment id: ${tx.providerPaymentId ?? "—"}`,
    `Описание: ${tx.description ?? "—"}`,
  ].join("\n");

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "content-disposition": `attachment; filename="receipt-${tx.id}.txt"`,
    },
  });
}
