"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Coins, CreditCard, Loader2 } from "lucide-react";
import { appUrl } from "@/lib/subdomain";
import { cn } from "@/lib/utils";

type ProductPurchaseControlsProps = {
  productKey: string;
  label: string;
  checkoutSource: string;
  creditCost?: number | null;
  className?: string;
  variant?: "default" | "catalog";
  onUnlocked?: () => void;
};

async function jsonRequest<T>(url: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error ?? payload.message ?? "Не удалось выполнить действие");
    (error as Error & { status?: number; payload?: unknown }).status = response.status;
    (error as Error & { status?: number; payload?: unknown }).payload = payload;
    throw error;
  }
  return payload as T;
}

// Z1-Ф1: the client ₽ balance rail is gone. Digital products are opened with
// clarity credits (primary) or paid directly by card (fallback). Sessions and
// subscriptions are the card-only rails handled elsewhere.
export function ProductPurchaseControls({
  productKey,
  label,
  checkoutSource,
  creditCost,
  className,
  variant = "default",
  onUnlocked,
}: ProductPurchaseControlsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const cardReturnHandledRef = useRef(false);
  const [action, setAction] = useState<"idle" | "credits" | "card">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const search = searchParams.toString();
  const currentUrl = `${pathname}${search ? `?${search}` : ""}`;
  const paymentStatus = searchParams.get("payment");
  const returnedProductKey = searchParams.get("productKey");
  const busy = status === "loading" || action !== "idle";
  const hasCredits = typeof creditCost === "number" && creditCost > 0;

  useEffect(() => {
    if (status !== "authenticated") return;
    if (cardReturnHandledRef.current) return;
    if (paymentStatus !== "success" || returnedProductKey !== productKey) return;

    cardReturnHandledRef.current = true;
    let cancelled = false;

    async function reconcileCardReturn() {
      setMessage("Подтверждаем оплату и открываем доступ...");

      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          await fetch("/api/billing/reconcile", { method: "POST" });
          const entitlement = await fetch(`/api/billing/entitlements?productKey=${encodeURIComponent(productKey)}`)
            .then((response) => response.json())
            .catch(() => null) as { active?: boolean } | null;

          if (cancelled) return;
          if (entitlement?.active) {
            setMessage("Доступ открыт. Можно пользоваться услугой на этой странице.");
            onUnlocked?.();
            return;
          }
        } catch {
          // YooKassa webhook can lag behind the browser return; retry below.
        }

        if (attempt < 5) {
          await new Promise((resolve) => { setTimeout(resolve, 2000); });
        }
      }

      if (!cancelled) {
        setMessage("Платёж ещё обрабатывается. Обновите страницу через минуту или откройте раздел оплаты.");
      }
    }

    void reconcileCardReturn();
    return () => { cancelled = true; };
  }, [onUnlocked, paymentStatus, productKey, returnedProductKey, status]);

  async function payWithCredits() {
    setAction("credits");
    setMessage(null);
    try {
      await jsonRequest("/api/billing/spend-credits", { productKey });
      onUnlocked?.();
      setMessage("Доступ открыт за кредиты ясности.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось списать кредиты";
      setMessage(`${text}. Можно оплатить картой.`);
    } finally {
      setAction("idle");
    }
  }

  async function payWithCard() {
    setAction("card");
    setMessage(null);
    try {
      const payload = await jsonRequest<{ confirmationUrl?: string }>("/api/billing/create-payment", {
        productKey,
        checkoutSource,
        returnPath: currentUrl,
      });
      if (payload.confirmationUrl) {
        window.location.href = payload.confirmationUrl;
        return;
      }
      throw new Error("Платежная ссылка не получена");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось открыть оплату");
      setAction("idle");
    }
  }

  if (status === "unauthenticated") {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(currentUrl)}&intent=buy-product&productKey=${encodeURIComponent(productKey)}`}
        className={cn("soft-button soft-button-primary", className)}
        data-analytics-event="direct_product_login_clicked"
        data-analytics-product={productKey}
      >
        {label}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  const creditsLabel = hasCredits ? `${label} · ${creditCost} кр` : label;
  const messageBlock = message && (
    <p className="mt-2 text-xs leading-relaxed text-[var(--soft-bordeaux)]" role="status">
      {message}{" "}
      {message.includes("кредит") && (
        <Link href={appUrl("/credits")} prefetch={false} className="font-semibold underline">
          Кредиты
        </Link>
      )}
    </p>
  );

  if (variant === "catalog") {
    return (
      <div className="soft-product-purchase-controls min-w-0" data-testid={`product-purchase-${productKey}`}>
        <div className="flex flex-wrap items-center gap-2">
          {hasCredits ? (
            <>
              <button
                type="button"
                className={cn("soft-button soft-button-primary", className)}
                disabled={busy}
                onClick={payWithCredits}
                title={`Открыть за кредиты ясности: ${creditCost}`}
                data-analytics-event="credits_spend_clicked"
                data-analytics-product={productKey}
                data-analytics-checkout-source={checkoutSource}
              >
                {action === "credits" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Coins className="size-4" aria-hidden="true" />}
                {action === "credits" ? "Открываем" : creditsLabel}
              </button>
              <button
                type="button"
                className="soft-chip h-9 justify-center px-3"
                disabled={busy}
                onClick={payWithCard}
                title="Оплатить картой"
                aria-label="Оплатить картой"
                data-analytics-event="direct_product_checkout_clicked"
                data-analytics-product={productKey}
                data-analytics-checkout-source={checkoutSource}
              >
                {action === "card" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4" aria-hidden="true" />}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={cn("soft-button soft-button-primary", className)}
              disabled={busy}
              onClick={payWithCard}
              data-analytics-event="direct_product_checkout_clicked"
              data-analytics-product={productKey}
              data-analytics-checkout-source={checkoutSource}
            >
              {action === "card" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4" aria-hidden="true" />}
              {action === "card" ? "Открываем оплату" : label}
            </button>
          )}
        </div>
        {messageBlock}
      </div>
    );
  }

  return (
    <div className="soft-product-purchase-controls" data-testid={`product-purchase-${productKey}`}>
      <div className="flex flex-wrap gap-2">
        {hasCredits && (
          <button
            type="button"
            className={cn("soft-button soft-button-primary", className)}
            disabled={busy}
            onClick={payWithCredits}
            data-analytics-event="credits_spend_clicked"
            data-analytics-product={productKey}
            data-analytics-checkout-source={checkoutSource}
          >
            {action === "credits" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Coins className="size-4" aria-hidden="true" />}
            {action === "credits" ? "Списываем кредиты" : creditsLabel}
          </button>
        )}
        <button
          type="button"
          className={cn(hasCredits ? "soft-button soft-button-ghost" : "soft-button soft-button-primary", !hasCredits ? className : undefined)}
          disabled={busy}
          onClick={payWithCard}
          data-analytics-event="direct_product_checkout_clicked"
          data-analytics-product={productKey}
          data-analytics-checkout-source={checkoutSource}
        >
          {action === "card" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4" aria-hidden="true" />}
          {action === "card" ? "Открываем оплату" : hasCredits ? "Картой" : label}
        </button>
      </div>
      {messageBlock}
    </div>
  );
}
