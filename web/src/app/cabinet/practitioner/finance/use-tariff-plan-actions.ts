"use client";

import { useState } from "react";
import { toast } from "sonner";

// B466 R9-4 P4 — общие обработчики оплаты/отмены тарифа для десктопной
// (tariff-plans) и мобильной (tariff-plans-mobile) карточек. Одна логика,
// две разметки: подтверждение покупки, оплата с баланса / картой, отмена
// продления. Эндпоинты те же, что и раньше.

export interface TariffSubscriptionInfo {
  id: string;
  planKey: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

export interface PendingPurchase {
  planKey: string;
  planName: string;
  priceRub: number;
  method: "earnings" | "card";
}

async function readError(res: Response) {
  const data = await res.json().catch(() => ({}));
  return typeof data?.error === "string" ? data.error : "Не удалось выполнить действие";
}

export function planNameOf(planKey: string): string {
  return planKey === "practitioner_pro_plus" ? "Pro+" : "Pro";
}

export function useTariffPlanActions({
  earningsBalanceRub,
  subscription,
}: {
  earningsBalanceRub: number;
  subscription: TariffSubscriptionInfo | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);
  const [pending, setPending] = useState<PendingPurchase | null>(null);

  function confirmPurchase() {
    if (!pending) return;
    const { planKey, priceRub, method } = pending;
    setPending(null);
    if (method === "earnings") void startFromEarnings(planKey, priceRub);
    else void startByCard(planKey);
  }

  async function startFromEarnings(planKey: string, priceRub: number) {
    if (earningsBalanceRub < priceRub) {
      toast.error("Недостаточно средств на балансе для оплаты подписки");
      return;
    }
    setBusy(`earnings:${planKey}`);
    try {
      const res = await fetch("/api/practitioner/subscriptions/start-from-earnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      if (!res.ok) throw new Error(await readError(res));
      toast.success("Тариф активирован — оплачено с баланса");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось активировать тариф");
      setBusy(null);
    }
  }

  async function startByCard(planKey: string) {
    setBusy(`card:${planKey}`);
    try {
      const res = await fetch("/api/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey,
          checkoutSource: "practitioner_subscription_card",
          returnPath: "/cabinet/practitioner/finance?tab=tariff",
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      if (typeof data.confirmationUrl !== "string") throw new Error("Платёжная ссылка не получена");
      window.location.href = data.confirmationUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть оплату");
      setBusy(null);
    }
  }

  async function cancelAtPeriodEnd() {
    if (!subscription) return;
    setBusy("cancel");
    try {
      const res = await fetch("/api/billing/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: subscription.id, action: "cancel_at_period_end" }),
      });
      if (!res.ok) throw new Error(await readError(res));
      toast.success("Тариф не продлится после текущего периода");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отменить продление");
      setBusy(null);
    }
  }

  return { busy, manageOpen, setManageOpen, pending, setPending, confirmPurchase, cancelAtPeriodEnd };
}
