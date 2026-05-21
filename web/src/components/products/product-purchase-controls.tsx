"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Coins, CreditCard, Loader2, Wallet } from "lucide-react";
import { appUrl } from "@/lib/subdomain";
import { cn } from "@/lib/utils";

type ProductPurchaseControlsProps = {
  productKey: string;
  label: string;
  checkoutSource: string;
  creditCost?: number | null;
  className?: string;
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

export function ProductPurchaseControls({
  productKey,
  label,
  checkoutSource,
  creditCost,
  className,
  onUnlocked,
}: ProductPurchaseControlsProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { status } = useSession();
  const [action, setAction] = useState<"idle" | "balance" | "credits" | "card">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const search = searchParams.toString();
  const currentUrl = `${pathname}${search ? `?${search}` : ""}`;
  const busy = status === "loading" || action !== "idle";

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

  async function payFromBalance() {
    setAction("balance");
    setMessage(null);
    try {
      await jsonRequest("/api/billing/pay-from-balance", { productKey, checkoutSource });
      onUnlocked?.();
      setMessage("Доступ открыт. Можно сразу пользоваться услугой.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось списать баланс";
      setMessage(`${text}. Пополните баланс или выберите оплату картой.`);
    } finally {
      setAction("idle");
    }
  }

  async function payWithCredits() {
    setAction("credits");
    setMessage(null);
    try {
      await jsonRequest("/api/billing/spend-credits", { productKey });
      onUnlocked?.();
      setMessage("Доступ открыт за кредиты ясности.");
    } catch (error) {
      const text = error instanceof Error ? error.message : "Не удалось списать кредиты";
      setMessage(`${text}. Можно оплатить с баланса или картой.`);
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

  return (
    <div className="soft-product-purchase-controls" data-testid={`product-purchase-${productKey}`}>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={cn("soft-button soft-button-primary", className)}
          disabled={busy}
          onClick={payFromBalance}
          data-analytics-event="balance_product_checkout_clicked"
          data-analytics-product={productKey}
          data-analytics-checkout-source={checkoutSource}
        >
          {action === "balance" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Wallet className="size-4" aria-hidden="true" />}
          {action === "balance" ? "Списываем баланс" : label}
        </button>
        {typeof creditCost === "number" && creditCost > 0 && (
          <button
            type="button"
            className="soft-button soft-button-ghost"
            disabled={busy}
            onClick={payWithCredits}
            data-analytics-event="credits_spend_clicked"
            data-analytics-product={productKey}
            data-analytics-checkout-source={checkoutSource}
          >
            {action === "credits" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <Coins className="size-4" aria-hidden="true" />}
            {action === "credits" ? "Списываем кредиты" : `${creditCost} кредита`}
          </button>
        )}
        <button
          type="button"
          className="soft-button soft-button-ghost"
          disabled={busy}
          onClick={payWithCard}
          data-analytics-event="direct_product_checkout_clicked"
          data-analytics-product={productKey}
          data-analytics-checkout-source={checkoutSource}
        >
          {action === "card" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <CreditCard className="size-4" aria-hidden="true" />}
          {action === "card" ? "Открываем оплату" : "Картой"}
        </button>
      </div>
      {message && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--soft-bordeaux)]" role="status">
          {message}{" "}
          {message.includes("Пополните") && (
            <Link href={appUrl("/cabinet/billing")} className="font-semibold underline">
              Пополнить
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
