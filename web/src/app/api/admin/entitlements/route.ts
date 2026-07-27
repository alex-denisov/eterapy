/**
 * GET /api/admin/entitlements?userId=…
 *
 * INC-087 (владелец 2026-07-27): «оплата прошла, но разбора нет ни в кабинете,
 * ни в админке нигде».
 *
 * Оплата действительно прошла и доступ был выдан — `product_entitlements`
 * получил строку `reframe · purchase · ACTIVE`. Но карточка пользователя в
 * админке показывает баллы, подписку и платежи и **не показывает выданные
 * доступы**. С точки зрения того, кто смотрит в админку, оплаченная услуга
 * просто не существует — и единственный доступный вывод «деньги пропали».
 *
 * Ключевое поле — `consumedAt`. Пустое `consumedAt` при `ACTIVE` значит не
 * «сбой», а «оплачено, разбор ещё не сделан»: человек может открыть услугу и
 * получить её без повторной оплаты. Это разные состояния, и различать их
 * должно быть видно без запроса в базу.
 */
import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getProductLabel, getProductRoute } from "@/lib/billing-labels";

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!["ADMIN", "SUPERADMIN"].includes(session?.user?.role ?? "")) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 403 });
  }

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) {
    return NextResponse.json({ error: "userId обязателен" }, { status: 400 });
  }

  const rows = await db.productEntitlement.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      productKey: true,
      source: true,
      status: true,
      transactionId: true,
      validFrom: true,
      validUntil: true,
      consumedAt: true,
      revokedAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    entitlements: rows.map((row) => ({
      ...row,
      label: getProductLabel(row.productKey),
      route: getProductRoute(row.productKey),
      /** Оплачено и ещё не израсходовано — то, ради чего этот эндпоинт и есть. */
      awaitingUse: row.status === "ACTIVE" && !row.consumedAt && !row.revokedAt,
    })),
  });
}
