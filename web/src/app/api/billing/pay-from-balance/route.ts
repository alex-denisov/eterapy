/**
 * POST /api/billing/pay-from-balance
 * Opens a paid v5 product by debiting the user's internal RUB balance.
 */
import { NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { errorWithRequestContext, jsonWithRequestContext } from "@/lib/api-response";
import { purchaseProductWithBalance } from "@/lib/product-purchase";
import { requestContextFromHeaders } from "@/lib/request-context";

function parseProductKey(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function POST(req: NextRequest) {
  const context = requestContextFromHeaders(req.headers);
  const session = await auth();
  if (!session?.user?.id) {
    return errorWithRequestContext("UNAUTHORIZED", "Не авторизован", 401, context);
  }

  const body = await req.json().catch(() => null) as { productKey?: unknown; checkoutSource?: unknown } | null;
  const productKey = parseProductKey(body?.productKey);
  const checkoutSource = typeof body?.checkoutSource === "string" ? body.checkoutSource : null;
  if (!productKey) {
    return errorWithRequestContext("INVALID_PRODUCT", "Неизвестный платный продукт", 400, context);
  }

  try {
    const result = await purchaseProductWithBalance({
      userId: session.user.id,
      productKey,
      checkoutSource,
    });

    if (result.status === "insufficient_balance") {
      return jsonWithRequestContext(
        {
          ok: false,
          code: "INSUFFICIENT_BALANCE",
          error: "Недостаточно средств на балансе",
          productKey,
          priceKopecks: result.priceKopecks,
          balanceKopecks: result.balanceKopecks,
        },
        { status: 402 },
        context,
      );
    }

    return jsonWithRequestContext({ ok: true, ...result }, undefined, context);
  } catch (error) {
    return errorWithRequestContext(
      "BALANCE_PURCHASE_FAILED",
      error instanceof Error ? error.message : "Не удалось оплатить с баланса",
      500,
      context,
    );
  }
}
