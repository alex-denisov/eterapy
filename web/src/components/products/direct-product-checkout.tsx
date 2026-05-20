"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, Loader2 } from "lucide-react";

type DirectProductCheckoutProps = {
  productKey: string;
  label: string;
  checkoutSource: string;
  className?: string;
};

async function createPayment(productKey: string, checkoutSource: string) {
  const response = await fetch("/api/billing/create-payment", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productKey, checkoutSource }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? "Не удалось открыть оплату");
  }
  return payload as { confirmationUrl?: string };
}

export function DirectProductCheckout({
  productKey,
  label,
  checkoutSource,
  className = "soft-button soft-button-primary",
}: DirectProductCheckoutProps) {
  const pathname = usePathname();
  const { status } = useSession();
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  if (status === "unauthenticated") {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(pathname)}&intent=buy-product&productKey=${encodeURIComponent(productKey)}`}
        className={className}
        data-analytics-event="direct_product_login_clicked"
        data-analytics-product={productKey}
      >
        {label}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    );
  }

  async function handleClick() {
    setState("loading");
    setMessage(null);
    try {
      const payload = await createPayment(productKey, checkoutSource);
      if (payload.confirmationUrl) {
        window.location.href = payload.confirmationUrl;
        return;
      }
      throw new Error("Платёжная ссылка не получена");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось открыть оплату");
      setState("error");
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-2">
      <button
        type="button"
        className={className}
        disabled={status === "loading" || state === "loading"}
        onClick={handleClick}
        data-analytics-event="direct_product_checkout_clicked"
        data-analytics-product={productKey}
        data-analytics-checkout-source={checkoutSource}
      >
        {state === "loading" ? (
          <>
            Открываем оплату
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          </>
        ) : (
          <>
            {label}
            <ArrowRight className="size-4" aria-hidden="true" />
          </>
        )}
      </button>
      {message && (
        <span className="text-xs leading-relaxed text-[var(--soft-bordeaux)]" role={state === "error" ? "alert" : undefined}>
          {message}
        </span>
      )}
    </span>
  );
}
