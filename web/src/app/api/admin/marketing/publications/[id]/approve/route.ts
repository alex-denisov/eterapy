/**
 * B589 фаза 1 · Утверждение черновика: DRAFT → SCHEDULED.
 *
 * ⚠ ЭТО НЕ ПУБЛИКАЦИЯ. Наружу ничего не уходит — адаптеры каналов появятся в
 * фазе 2, и даже тогда выпуск будет гейтиться `MARKETING_AUTOPUBLISH`.
 * `SCHEDULED` означает ровно одно: человек прочитал текст и не возражает.
 *
 * Переход разрешён только из `DRAFT`. Иначе повторное нажатие на уже
 * опубликованном материале сбросило бы его обратно в очередь выпуска — то есть
 * привело бы к второй публикации того же поста.
 */

import { NextResponse } from "next/server";

import { auth } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import db from "@/lib/db";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SUPERADMIN") {
    return NextResponse.json({ error: "Недостаточно прав" }, { status: 403 });
  }

  const { id } = await context.params;

  const updated = await db.externalPublication.updateMany({
    where: { id, status: "DRAFT" },
    data: { status: "SCHEDULED", updatedBy: session.user.id },
  });

  if (updated.count === 0) {
    return NextResponse.json(
      { error: "Утвердить можно только черновик" },
      { status: 409 },
    );
  }

  await logAudit(session.user.id, "MARKETING_DRAFT_APPROVED", id, "Черновик поста утверждён к выпуску");

  return NextResponse.json({ ok: true });
}
