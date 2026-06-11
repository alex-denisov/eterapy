"use client";

import { useState } from "react";
import { Coins } from "lucide-react";
import { Button } from "@/components/ui/button";
import { pointsWord } from "@/lib/points";

type CreditSpendButtonProps = {
  productKey: string;
  creditCost: number;
  disabled?: boolean;
  onUnlocked: () => void;
};

async function spendCredits(productKey: string) {
  const response = await fetch("/api/billing/spend-credits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productKey }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error ?? payload.message ?? "Не удалось списать баллы");
  }
  return payload as { balanceAfter?: number };
}

export function CreditSpendButton({
  productKey,
  creditCost,
  disabled,
  onUnlocked,
}: CreditSpendButtonProps) {
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  async function handleSpend() {
    setStatus("loading");
    setMessage(null);
    try {
      await spendCredits(productKey);
      onUnlocked();
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Не удалось списать баллы");
      setStatus("error");
    }
  }

  return (
    <div className="soft-credit-spend" data-testid={`credit-spend-${productKey}`}>
      <Button
        onClick={handleSpend}
        disabled={disabled || status === "loading"}
        className="soft-button soft-button-ghost"
        data-analytics-event="credits_spend_clicked"
        data-analytics-product={productKey}
      >
        <Coins className="size-4" aria-hidden="true" />
        {status === "loading" ? "Проверяем баллы..." : `Открыть за ${creditCost} ${pointsWord(creditCost)}`}
      </Button>
      {message && (
        <p className="mt-2 text-xs leading-relaxed text-[var(--soft-bordeaux)]" role={status === "error" ? "alert" : undefined}>
          {message}
        </p>
      )}
    </div>
  );
}
