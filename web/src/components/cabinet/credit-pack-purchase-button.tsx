"use client";

import { useState } from "react";
import { Loader2, ShoppingCart } from "lucide-react";

export function CreditPackPurchaseButton({
  creditPackKey,
  credits,
}: {
  creditPackKey: string;
  credits: number;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function startCheckout() {
    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          creditPackKey,
          checkoutSource: `cabinet-wallet-pack-${credits}`,
          returnPath: "/cabinet/wallet",
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.confirmationUrl) {
        throw new Error(data.error ?? "Не удалось начать оплату");
      }
      window.location.assign(data.confirmationUrl);
    } catch (err) {
      setPending(false);
      setError(err instanceof Error ? err.message : "Не удалось начать оплату");
    }
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        className="soft-button soft-button-primary w-full justify-center"
        onClick={startCheckout}
        disabled={pending}
        aria-busy={pending}
      >
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <ShoppingCart className="size-4" aria-hidden="true" />}
        Купить пакет
      </button>
      {error && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--soft-bordeaux)]" role="status">
          {error}
        </p>
      )}
    </div>
  );
}
