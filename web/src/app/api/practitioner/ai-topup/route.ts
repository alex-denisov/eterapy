/**
 * B434 — докупка пакета AI-разборов (+10/+25/+50 = 790/1790/2990 ₽) из дохода
 * практика. Списание — внутренняя транзакция (checkoutSource =
 * practitioner_earnings_balance, как оплата подписки с баланса) + строка
 * PractitionerAiTopup в ledger. Оплата картой — follow-up (тикет B434).
 */
import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { AI_TOPUP_PACKS } from "@/lib/practitioner-ai-quota";
import { computePractitionerBalance } from "@/lib/practitioner-balance";
import { requestContextFromHeaders } from "@/lib/request-context";
import { log, serializeError } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || session.user?.role !== "PRACTITIONER") {
    return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);
  }

  const payload = await request.json().catch(() => ({}));
  const units = Number(payload?.units);
  const pack = AI_TOPUP_PACKS.find((p) => p.units === units);
  if (!pack) {
    return errorWithRequestContext("BAD_REQUEST", "Неизвестный пакет разборов", 400, context);
  }

  try {
    const practitioner = await db.practitioner.findUnique({
      where: { userId },
      select: { id: true },
    });
    if (!practitioner) {
      return errorWithRequestContext("NOT_FOUND", "Профиль практика не найден", 404, context);
    }

    const priceKopecks = pack.priceRub * 100;
    const balance = await computePractitionerBalance(practitioner.id);
    const availableKopecks = Math.max(0, balance?.currentBalance ?? 0) * 100;
    if (availableKopecks < priceKopecks) {
      return errorWithRequestContext("INSUFFICIENT_EARNINGS", "Недостаточно средств на балансе практика", 402, context);
    }

    const result = await db.$transaction(async (tx) => {
      const transaction = await tx.transaction.create({
        data: {
          userId,
          amount: priceKopecks,
          status: "SUCCEEDED",
          provider: "internal",
          description: `Пакет AI-разборов +${pack.units}: оплата из дохода практика`,
          metadata: {
            purchaseKind: "practitioner_ai_topup",
            units: pack.units,
            checkoutSource: "practitioner_earnings_balance",
          } as Prisma.InputJsonObject,
        },
        select: { id: true },
      });
      const topup = await tx.practitionerAiTopup.create({
        data: {
          practitionerId: practitioner.id,
          units: pack.units,
          amountKopecks: priceKopecks,
          transactionId: transaction.id,
        },
        select: { id: true, units: true },
      });
      return { transactionId: transaction.id, topup };
    });

    return jsonWithRequestContext({ ok: true, ...result }, undefined, context);
  } catch (error) {
    log.warn("practitioner-ai-topup-failed", {
      requestId: context.requestId,
      userId,
      units,
      error: serializeError(error),
    });
    return errorWithRequestContext("INTERNAL_ERROR", "Не удалось купить пакет разборов", 500, context);
  }
}
