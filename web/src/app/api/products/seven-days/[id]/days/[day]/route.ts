import type { NextRequest } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import db from "@/lib/db";
import { requestContextFromHeaders } from "@/lib/request-context";
import { generateFinalReport } from "@/lib/seven-days";
import { userHasActiveEntitlement } from "@/lib/entitlements";

const PRODUCT_KEY = "seven-days";

const postSchema = z.object({
  action: z.literal("complete"),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string; day: string }> }) {
  const context = requestContextFromHeaders(request.headers);
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return errorWithRequestContext("UNAUTHORIZED", "Unauthorized", 401, context);

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorWithRequestContext("VALIDATION_ERROR", "Invalid payload", 400, context);

  const { id, day } = await params;
  const targetDay = parseInt(day, 10);
  
  const route = await db.clarityRoute.findUnique({
    where: { id },
  });

  if (!route || route.userId !== userId) {
    return errorWithRequestContext("NOT_FOUND", "Route not found", 404, context);
  }

  if (route.status !== "ACTIVE") {
    return errorWithRequestContext("CONFLICT", "Route is not active", 409, context);
  }

  if (route.currentDay !== targetDay) {
    return errorWithRequestContext("CONFLICT", "Can only complete the current day", 409, context);
  }

  // G9 · Day 1 is free (13_Prices_Breakdown §11). Completing day 1 unlocks
  // days 2–7 + the final report, so payment is required from this point on.
  // Days 2–7 are only reachable after a paid completion of day 1, but we
  // re-check on every completion to stay safe if an entitlement lapses.
  const hasEntitlement = await userHasActiveEntitlement(userId, PRODUCT_KEY);
  if (!hasEntitlement) {
    return errorWithRequestContext(
      "PAYMENT_REQUIRED",
      "День 1 бесплатный. Откройте полный маршрут, чтобы продолжить к дням 2–7 и получить итоговый отчёт.",
      402,
      context,
    );
  }

  if (targetDay < 7) {
    const updated = await db.clarityRoute.update({
      where: { id },
      data: {
        currentDay: route.currentDay + 1,
      },
    });
    return jsonWithRequestContext({ result: updated }, { status: 200 }, context);
  } else {
    // Generate final report on day 7
    const generated = await generateFinalReport({
      userId,
      dialogueId: route.dialogueId ?? "",
      requestId: context.requestId,
    });

    const productResult = await db.productResult.create({
      data: {
        userId,
        productKey: PRODUCT_KEY,
        title: "Итоги маршрута 7 дней",
        status: "READY",
        resultText: generated.text,
        metadata: {
          generationMetadata: generated.metadata,
        },
      },
    });

    const updated = await db.clarityRoute.update({
      where: { id },
      data: {
        status: "COMPLETED",
        completedAt: new Date(),
        reportId: productResult.id,
      },
    });

    return jsonWithRequestContext({ result: updated }, { status: 200 }, context);
  }
}
