"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Coins, CreditCard, Loader2 } from "lucide-react";
import { appUrl } from "@/lib/subdomain";
import { cn } from "@/lib/utils";
import { pointsWord } from "@/lib/points";
import { dispatchBalanceChanged } from "@/lib/balance-events";
import { toMiniAppPath } from "@/lib/miniapp/navigation";

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
  const inMiniApp = pathname.startsWith("/miniapp");
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
          const reconcile = await fetch("/api/billing/reconcile", { method: "POST" })
            .then((response) => response.json())
            .catch(() => null) as {
              results?: Array<{ outcome?: string; message?: string | null }>;
            } | null;
          const declined = reconcile?.results?.find((result) => result.outcome === "cancelled" && result.message);
          if (declined?.message) {
            setMessage(declined.message);
            return;
          }
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
      // #3: header credit pill updates immediately after the spend.
      dispatchBalanceChanged();
      onUnlocked?.();
      setMessage("Доступ открыт за баллы.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось списать баллы";
      setMessage(`${text}. Можно оплатить картой.`);
    } finally {
      setAction("idle");
    }
  }

  async function payWithCard() {
    if (inMiniApp) {
      window.location.href = `/miniapp/checkout/review?offer=${encodeURIComponent(`service:${productKey}`)}`;
      return;
    }
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
        href={inMiniApp
          ? `/miniapp/account?mode=login&intent=buy-product&productKey=${encodeURIComponent(productKey)}&returnTo=${encodeURIComponent(currentUrl)}`
          : `/login?next=${encodeURIComponent(currentUrl)}&intent=buy-product&productKey=${encodeURIComponent(productKey)}`}
        className={cn("soft-button soft-button-primary", className)}
        data-analytics-event="direct_product_login_clicked"
        data-analytics-product={productKey}
      >
        {label}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  const creditsLabel = hasCredits ? `${label} · ${creditCost} ${pointsWord(creditCost as number)}` : label;
  const messageBlock = message && (
    <p className="mt-2 text-xs leading-relaxed text-[var(--soft-bordeaux)]" role={message.includes("Недостаточно") || message.includes("Не удалось") ? "alert" : "status"}>
      {message}{" "}
      {message.includes("балл") && (
        <Link href={inMiniApp ? toMiniAppPath(appUrl("/wallet")) : appUrl("/wallet")} prefetch={false} className="font-semibold underline">
          Пополнить баллы
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
                title={`Открыть за баллы: ${creditCost}`}
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

  // Round-5 #4: «Открыть …» и «Картой» always share ONE row; on phones the
  // primary label collapses to «Открыть за N баллов» so the pair fits without
  // wrapping or an oversized button.
  const mobileCreditsLabel = hasCredits
    ? `Открыть за ${creditCost} ${pointsWord(creditCost as number)}`
    : label;

  return (
    <div className="soft-product-purchase-controls" data-testid={`product-purchase-${productKey}`}>
      <div className={hasCredits ? "soft-purchase-row" : "flex flex-wrap gap-2"}>
        {hasCredits && (
          <button
            type="button"
            className={cn("soft-button soft-button-primary min-w-0 flex-1 justify-center", className)}
            disabled={busy}
            onClick={payWithCredits}
            data-analytics-event="credits_spend_clicked"
            data-analytics-product={productKey}
            data-analytics-checkout-source={checkoutSource}
          >
            {action === "credits" ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : <Coins className="size-4 shrink-0" aria-hidden="true" />}
            {action === "credits" ? "Списываем баллы" : (
              <>
                <span className="min-w-0 truncate sm:hidden">{mobileCreditsLabel}</span>
                <span className="hidden min-w-0 truncate sm:inline">{creditsLabel}</span>
              </>
            )}
          </button>
        )}
        <button
          type="button"
          className={cn(hasCredits ? "soft-button soft-button-ghost shrink-0" : "soft-button soft-button-primary", !hasCredits ? className : undefined)}
          disabled={busy}
          onClick={payWithCard}
          data-analytics-event="direct_product_checkout_clicked"
          data-analytics-product={productKey}
          data-analytics-checkout-source={checkoutSource}
        >
          {action === "card" ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4 shrink-0" aria-hidden="true" />}
          {action === "card" ? "Открываем оплату" : hasCredits ? "Картой" : label}
        </button>
      </div>
      {messageBlock}
    </div>
  );
}
