"use client";

import { useState } from "react";
import { Check, CreditCard, Wallet } from "lucide-react";
import { toast } from "sonner";

interface Plan {
  key: string;
  name: string;
  amountKopecks: number;
  trialDays: number;
  description: string;
  perks: string[];
}

interface Props {
  plans: Plan[];
  activePlanKey: string | null;
  cabinetBalanceKopecks: number;
  earningsBalanceRub: number;
}

function formatRubFromKopecks(value: number) {
  return (value / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

async function readError(res: Response) {
  const data = await res.json().catch(() => ({}));
  return typeof data?.error === "string" ? data.error : typeof data?.message === "string" ? data.message : "Не удалось выполнить действие";
}

export function PractitionerSubscriptionClient({
  plans,
  activePlanKey,
  earningsBalanceRub,
}: Props) {
  const [busy, setBusy] = useState<string | null>(null);

  async function startFromEarnings(planKey: string) {
    setBusy(`earnings:${planKey}`);
    try {
      const res = await fetch("/api/practitioner/subscriptions/start-from-earnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      if (!res.ok) throw new Error(await readError(res));
      toast.success("Подписка активирована из дохода практика");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось активировать подписку");
    } finally {
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
          returnPath: "/cabinet/practitioner/subscription",
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

  return (
    <div className="grid gap-4 lg:grid-cols-2" data-testid="practitioner-subscription-plans">
      {plans.map((plan) => {
        const isCurrent = activePlanKey === plan.key;
        const priceRub = formatRubFromKopecks(plan.amountKopecks);
        const canUseEarnings = earningsBalanceRub * 100 >= plan.amountKopecks;
        return (
          <section key={plan.key} className="soft-card p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="soft-eyebrow">тариф практика</p>
                <h2 className="soft-h3 mt-2">{plan.name}</h2>
                <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">{plan.description}</p>
              </div>
              {isCurrent ? (
                <span className="soft-badge soft-badge-sage">активен</span>
              ) : (
                <span className="soft-badge">{plan.trialDays > 0 ? `${plan.trialDays} дней теста` : "без теста"}</span>
              )}
            </div>

            <div className="mt-5 flex items-end gap-2">
              <span className="font-heading text-4xl font-semibold text-[var(--soft-bordeaux)]">{priceRub} ₽</span>
              <span className="pb-1 text-sm text-[var(--soft-ink-faint)]">/ месяц</span>
            </div>

            <ul className="mt-5 grid gap-2 text-sm text-[var(--soft-ink-soft)]">
              {plan.perks.map((perk) => (
                <li key={perk} className="flex gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                  <span>{perk}</span>
                </li>
              ))}
            </ul>

            {/* W6: exactly two ways to pay — from the practitioner balance
                (with an explicit insufficient-funds error on click) or by card.
                Y2: compact, auto-width buttons (flex, not a full-width grid) so
                they read as small actions, not banner CTAs. */}
            <div className="mt-5 flex flex-wrap gap-2">
              <button
                type="button"
                className="soft-button soft-button-primary"
                style={{ minHeight: "2rem", padding: "0.4rem 0.85rem", fontSize: "0.8125rem" }}
                disabled={isCurrent || busy !== null}
                onClick={() => canUseEarnings
                  ? startFromEarnings(plan.key)
                  : toast.error("Недостаточно средств на балансе для оплаты подписки")}
                data-testid="practitioner-subscribe-from-balance"
              >
                <Wallet className="size-3.5" aria-hidden="true" />
                Оплатить с баланса
              </button>
              <button
                type="button"
                className="soft-button soft-button-ghost"
                style={{ minHeight: "2rem", padding: "0.4rem 0.85rem", fontSize: "0.8125rem" }}
                disabled={isCurrent || busy !== null}
                onClick={() => startByCard(plan.key)}
              >
                <CreditCard className="size-3.5" aria-hidden="true" />
                Картой
              </button>
            </div>
          </section>
        );
      })}
    </div>
  );
}
