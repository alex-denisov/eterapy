"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, ArrowUpRight, Shield, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  getSubscriptionPlanLabel,
  getSubscriptionStatusLabel,
} from "@/lib/billing-labels";
import { mainUrl } from "@/lib/subdomain";
import { BillingHistoryTable } from "@/components/cabinet/billing-history-table";

// Static metadata mirrors V5_SUBSCRIPTION_PLANS so we don't drag the
// server-only entitlements module (uses prisma) into the client bundle.
const CLIENT_PLANS: Record<"plus" | "premium", { name: string; amountKopecks: number; trialDays: number; creditsPerPeriod: number; includedProductsCount: number }> = {
  plus: { name: "Plus", amountKopecks: 49000, trialDays: 7, creditsPerPeriod: 12, includedProductsCount: 1 },
  premium: { name: "Premium", amountKopecks: 129000, trialDays: 7, creditsPerPeriod: 35, includedProductsCount: 2 },
};

const MIN_TOPUP_RUB = 100;
const MAX_TOPUP_RUB = 100000;

const FEATURES = [
  "История вопросов и сохранение выводов",
  "Моя карта и мягкое возвращение к темам",
  "Безопасная оплата углублений и сессий",
];

interface SavedCard {
  id: string;
  paymentMethodId: string;
  last4: string;
  brand: string;
  expiryMonth: string;
  expiryYear: string;
  cardholderName: string | null;
  isDefault: boolean;
  createdAt: string;
}

interface BillingTransaction {
  id: string;
  amountRub: string | number;
  status: string;
  description: string | null;
  createdAt: string;
}

interface BillingLedgerEntry {
  id: string;
  amountRub: string | number;
  type: string;
  description: string | null;
  createdAt: string;
}

interface BillingSubscription {
  id: string;
  planKey: string;
  status: string;
  active: boolean;
  trialEndsAt: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

function getBrandLabel(brand: string) {
  const b = brand.toLowerCase();
  if (b.includes("visa")) return "VISA";
  if (b.includes("master")) return "MC";
  if (b.includes("mir")) return "МИР";
  return "CARD";
}

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [balanceRub, setBalanceRub] = useState("0.00");
  // B11/D9: keep the raw input as a string so the field can be fully cleared
  // (a numeric state coerced "" → 0 and trapped a leading "0"). topUpAmount is
  // the derived number used by validation and payment calls.
  const [topUpRaw, setTopUpRaw] = useState("500");
  const topUpAmount = topUpRaw.trim() === "" ? 0 : Math.max(0, Math.floor(Number(topUpRaw)) || 0);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [payingWithSaved, setPayingWithSaved] = useState(false);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [subscriptions, setSubscriptions] = useState<BillingSubscription[]>([]);
  const [linkedCards, setLinkedCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [settingDefaultCardId, setSettingDefaultCardId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (!session) return;

    fetch("/api/billing/balance")
      .then(r => r.json())
      .then(d => { setBalanceRub(d.balanceRub); })
      .catch(() => {});

    fetch("/api/billing/cards")
      .then(r => r.json())
      .then(d => { setLinkedCards(d.cards ?? []); })
      .catch(() => {})
      .finally(() => { setLoadingCards(false); });

    fetch("/api/billing/transactions")
      .then(r => r.json())
      .then(d => {
        setTransactions(d.transactions ?? []);
        setLedger(d.ledger ?? []);
        const hasPending = (d.transactions ?? []).some((t: { status: string }) => t.status === "PENDING");
        if (hasPending) {
          fetch("/api/billing/reconcile", { method: "POST" })
            .then(() => {
              fetch("/api/billing/balance").then(r2 => r2.json()).then(d2 => { setBalanceRub(d2.balanceRub); }).catch(() => {});
              fetch("/api/billing/transactions").then(r2 => r2.json()).then(d2 => { setTransactions(d2.transactions ?? []); setLedger(d2.ledger ?? []); }).catch(() => {});
              fetch("/api/billing/cards").then(r2 => r2.json()).then(d2 => { setLinkedCards(d2.cards ?? []); }).catch(() => {});
            })
            .catch(() => {});
        }
      })
      .catch(() => {});

    fetch("/api/billing/entitlements")
      .then(r => r.json())
      .then(d => {
        setSubscriptions(d.subscriptions ?? []);
      })
      .catch(() => {});
  }, [session]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payment = searchParams?.get("payment");
    if (payment !== "success" && payment !== "card-saved") return;

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 6;
    const initialBalance = balanceRub;

    async function reconcileAndRefresh() {
      // Attempt reconcile first — don't assume success
      let reconcileOk = false;
      try {
        const rec = await fetch("/api/billing/reconcile", { method: "POST" });
        reconcileOk = rec.ok;
      } catch { /* network or server error — will retry */ }

      if (cancelled) return;

      const [balRes, cardsRes, txRes, entRes] = await Promise.all([
        fetch("/api/billing/balance").then(r => r.json()).catch(() => null),
        fetch("/api/billing/cards").then(r => r.json()).catch(() => null),
        fetch("/api/billing/transactions").then(r => r.json()).catch(() => null),
        fetch("/api/billing/entitlements").then(r => r.json()).catch(() => null),
      ]);
      if (cancelled) return;

      if (balRes?.balanceRub) setBalanceRub(balRes.balanceRub);
      if (cardsRes?.cards) setLinkedCards(cardsRes.cards);
      if (txRes?.transactions) setTransactions(txRes.transactions);
      if (txRes?.ledger) setLedger(txRes.ledger);
      if (entRes?.subscriptions) setSubscriptions(entRes.subscriptions);

      const stillPending = (txRes?.transactions ?? []).some((t: { status: string }) => t.status === "PENDING");
      const balanceChanged = balRes?.balanceRub && Number(balRes.balanceRub) !== Number(initialBalance);

      attempts += 1;

      // Show toast only when we know the outcome
      if (attempts === 1) {
        if (payment === "success") {
          if (balanceChanged) {
            toast.success("Баланс успешно пополнен!");
          } else if (!reconcileOk && !stillPending) {
            toast.error("Не удалось подтвердить платёж. Обновите страницу или обратитесь в поддержку.");
          }
          // If still pending, we'll retry silently
        }
        if (payment === "card-saved" && !stillPending) {
          toast.success("Карта успешно привязана!");
        }
      }

      if (stillPending && attempts < maxAttempts && !cancelled) {
        setTimeout(reconcileAndRefresh, 2000);
      } else if (stillPending && attempts >= maxAttempts) {
        toast.error("Платёж обрабатывается. Обновите страницу через минуту.");
      }
    }

    reconcileAndRefresh();
    router.replace("/cabinet/billing");
    return () => { cancelled = true; };
  }, [searchParams, router, balanceRub]);

  async function handleTopUp() {
    if (!Number.isFinite(topUpAmount) || topUpAmount < MIN_TOPUP_RUB || topUpAmount > MAX_TOPUP_RUB) {
      toast.error(`Сумма от ${MIN_TOPUP_RUB} до ${MAX_TOPUP_RUB.toLocaleString("ru-RU")} ₽`);
      return;
    }
    setCreatingPayment(true);
    try {
      const res = await fetch("/api/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountKopecks: topUpAmount * 100,
          description: `Пополнение баланса ${topUpAmount} ₽`,
        }),
      });
      const data = await res.json();
      if (data.confirmationUrl) {
        window.location.assign(data.confirmationUrl);
      } else {
        toast.error(data.error || "Ошибка создания платежа");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setCreatingPayment(false);
    }
  }

  async function handleLinkCard() {
    setSavingCard(true);
    try {
      const res = await fetch("/api/billing/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountKopecks: 100,
          description: "Привязка банковской карты",
        }),
      });
      const data = await res.json();
      if (data.confirmationUrl) {
        window.location.assign(data.confirmationUrl);
      } else {
        toast.error(data.error || "Ошибка привязки карты");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setSavingCard(false);
    }
  }

  async function handleRemoveCard(cardId: string) {
    try {
      const res = await fetch(`/api/billing/cards?cardId=${cardId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.ok) {
        setLinkedCards(prev => prev.filter(c => c.id !== cardId));
        toast.success("Карта удалена");
      } else {
        toast.error(data.error || "Ошибка удаления карты");
      }
    } catch {
      toast.error("Ошибка сети");
    }
  }

  async function handleSetDefaultCard(cardId: string) {
    setSettingDefaultCardId(cardId);
    // Optimistic single-default flip so the UI feels instant.
    setLinkedCards(prev => prev.map(c => ({ ...c, isDefault: c.id === cardId })));
    try {
      const res = await fetch("/api/billing/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, action: "set_default" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Основная карта обновлена");
      } else {
        toast.error(data.error || "Не удалось назначить основную карту");
        loadData();
      }
    } catch {
      toast.error("Ошибка сети");
      loadData();
    } finally {
      setSettingDefaultCardId(null);
    }
  }

  async function handlePayWithSavedCard(cardId: string) {
    if (!Number.isFinite(topUpAmount) || topUpAmount < MIN_TOPUP_RUB || topUpAmount > MAX_TOPUP_RUB) {
      toast.error(`Сумма от ${MIN_TOPUP_RUB} до ${MAX_TOPUP_RUB.toLocaleString("ru-RU")} ₽`);
      return;
    }
    setPayingWithSaved(true);
    try {
      const res = await fetch("/api/billing/pay-with-saved-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, amountKopecks: topUpAmount * 100 }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.confirmationUrl) {
          window.location.assign(data.confirmationUrl);
        } else if (data.paid || data.credited) {
          toast.success(`Баланс пополнен на ${topUpAmount} ₽`);
          loadData();
        } else {
          toast.success("Платёж обрабатывается");
          let attempts = 0;
          const tick = async () => {
            attempts += 1;
            try { await fetch("/api/billing/reconcile", { method: "POST" }); } catch {}
            loadData();
            if (attempts < 5) setTimeout(tick, 2000);
          };
          tick();
        }
      } else {
        toast.error(data.error || "Ошибка платежа");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setPayingWithSaved(false);
    }
  }

  async function handleStartSubscription(planKey: string, payVia: "card" | "balance" = "card") {
    setCreatingPayment(true);
    try {
      if (payVia === "balance") {
        const res = await fetch("/api/billing/subscriptions/start-from-balance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ planKey, checkoutSource: "client_billing_balance" }),
        });
        const data = await res.json();
        if (data.ok) {
          toast.success("Подписка активирована");
          loadData();
        } else {
          toast.error(data.error || "Не удалось активировать подписку с баланса");
        }
        return;
      }

      const res = await fetch("/api/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, checkoutSource: "client_billing" }),
      });
      const data = await res.json();
      if (data.confirmationUrl) {
        window.location.assign(data.confirmationUrl);
      } else {
        toast.error(data.error || "Не удалось открыть оплату подписки");
      }
    } catch {
      toast.error("Ошибка сети");
    } finally {
      setCreatingPayment(false);
    }
  }

  async function handleCancelSubscription(subscriptionId: string) {
    try {
      const res = await fetch("/api/billing/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId, action: "cancel_at_period_end" }),
      });
      const data = await res.json();
      if (data.ok) {
        toast.success("Подписка будет отменена в конце периода");
        loadData();
      } else {
        toast.error(data.error || "Не удалось отменить подписку");
      }
    } catch {
      toast.error("Ошибка сети");
    }
  }

  if (status === "loading") return null;
  if (!session) { router.push("/login"); return null; }
  // Y6: client-only surface — a practitioner/admin reaching /cabinet/billing by
  // direct link is routed back to /cabinet, which sends them to the home their
  // role is entitled to.
  const sessionRole = (session.user as { role?: string } | undefined)?.role;
  if (sessionRole && sessionRole !== "CLIENT") { router.replace("/cabinet"); return null; }

  const activeSub = subscriptions.find(s => s.active);
  const currentPlanLabel = getSubscriptionPlanLabel(activeSub?.planKey);
  const currentSubscriptionStatus = activeSub
    ? activeSub.cancelAtPeriodEnd
      ? "Отменяется в конце периода"
      : getSubscriptionStatusLabel(activeSub.status)
    : "Базовый доступ";

  // Show every consumer-facing plan (Plus + Premium) so the user can pick.
  // Pricing/credits/included products are sourced from the canonical
  // V5_SUBSCRIPTION_PLANS registry via getSubscriptionPlan(slug).
  const CLIENT_PLAN_KEYS: Array<"plus" | "premium"> = ["plus", "premium"];
  const balanceKopecks = Math.round(Number(balanceRub) * 100);
  const topUpValid = Number.isFinite(topUpAmount) && topUpAmount >= MIN_TOPUP_RUB && topUpAmount <= MAX_TOPUP_RUB;
  // W12: the default card drives the single top-up CTA in the unified wallet.
  const defaultCard = linkedCards.find((c) => c.isDefault) ?? linkedCards[0] ?? null;

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <div className="soft-eyebrow">оплата</div>
        <h1 className="soft-h1 mt-2">Подписка и оплата</h1>
      </div>

      {/* Current subscription overview */}
      <div className="soft-card p-6" data-testid="client-billing-subscription" style={{ background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="soft-eyebrow">текущая подписка</div>
            <div className="mt-2" style={{ fontFamily: "var(--font-heading)", fontSize: 36, color: "var(--soft-bordeaux)", fontWeight: 600 }}>
              {currentPlanLabel}
            </div>
            <div className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
              {currentSubscriptionStatus}
            </div>
            {activeSub?.currentPeriodEnd && (
              <div className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
                {activeSub.cancelAtPeriodEnd ? "доступ до" : "следующее списание"} {new Date(activeSub.currentPeriodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
              </div>
            )}
            <ul className="mt-3 space-y-1">
              {FEATURES.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
                  <span style={{ color: "var(--soft-terracotta)" }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Link href={mainUrl("/pricing")} className="soft-button soft-button-ghost" style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
              Сравнить тарифы
            </Link>
            {activeSub && !activeSub.cancelAtPeriodEnd && (
              <button
                onClick={() => handleCancelSubscription(activeSub.id)}
                className="soft-chip"
                style={{ color: "var(--soft-ink-faint)" }}
              >
                Отменить подписку
              </button>
            )}
          </div>
        </div>
      </div>

      {/* All available plans */}
      <div className="grid gap-4 md:grid-cols-2" data-testid="client-billing-plans">
        {CLIENT_PLAN_KEYS.map((key) => {
          const plan = CLIENT_PLANS[key];
          if (!plan) return null;
          const priceRub = (plan.amountKopecks / 100).toLocaleString("ru-RU");
          const isCurrent = activeSub?.planKey === key;
          const canPayFromBalance = balanceKopecks >= plan.amountKopecks;
          return (
            <div key={key} className="soft-card p-6" data-testid={`client-billing-plan-${key}`}>
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <div className="soft-eyebrow">{key === "plus" ? "стартовая подписка" : "расширенная подписка"}</div>
                  <div className="mt-2" style={{ fontFamily: "var(--font-heading)", fontSize: 28, color: "var(--soft-bordeaux)", fontWeight: 600 }}>
                    {plan.name}
                  </div>
                </div>
                <div className="text-right">
                  <div style={{ fontFamily: "var(--font-heading)", fontSize: 26, color: "var(--soft-bordeaux)", fontWeight: 600 }}>
                    {priceRub} ₽
                  </div>
                  <div className="text-xs text-[var(--soft-ink-faint)]">в месяц</div>
                </div>
              </div>
              <p className="mt-3 text-sm text-[var(--soft-ink-soft)]">
                +{plan.creditsPerPeriod} кредитов ясности каждый месяц
                · {plan.includedProductsCount} цифровых продуктов включено
                {plan.trialDays > 0 ? ` · ${plan.trialDays} дней пробного периода` : ""}
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {isCurrent ? (
                  <span className="soft-button soft-button-soft" style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                    Активна
                  </span>
                ) : (
                  <>
                    <button
                      onClick={() => handleStartSubscription(key, "card")}
                      disabled={creatingPayment}
                      className="soft-button soft-button-primary"
                      style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
                      data-testid={`client-billing-${key}-pay-card`}
                    >
                      {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : "Оплатить картой"}
                    </button>
                    <button
                      onClick={() => handleStartSubscription(key, "balance")}
                      disabled={creatingPayment || !canPayFromBalance}
                      className="soft-button soft-button-ghost"
                      style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
                      data-testid={`client-billing-${key}-pay-balance`}
                    >
                      {canPayFromBalance ? "Оплатить с баланса" : "Недостаточно средств"}
                    </button>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* W12: unified «Кошелёк» — balance, a single top-up flow and saved cards
          live in ONE coherent block. The previous design split these into three
          cards with three different «Пополнить» buttons + an always-on «Привязать
          карту» that read as «no card linked» even after a card was added. */}
      <div className="soft-card p-6" data-testid="client-wallet">
        {/* Header: purpose on the left, balance figure on the right */}
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="soft-eyebrow">кошелёк</div>
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
              Баланс для оплаты разборов, услуг и подписки
            </p>
          </div>
          <div className="text-right" data-testid="client-wallet-balance">
            <div className="text-xs text-[var(--soft-ink-faint)]">на балансе</div>
            <div style={{ fontFamily: "var(--font-heading)", fontSize: 30, color: "var(--soft-bordeaux)", fontWeight: 600, lineHeight: 1.1 }}>
              {Number(balanceRub).toLocaleString("ru", { minimumFractionDigits: 2 })} ₽
            </div>
          </div>
        </div>

        {/* Top-up amount — borderless big number inside a soft panel */}
        <div className="mt-5 rounded-2xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4">
          <label htmlFor="client-topup-amount" className="block text-xs font-medium text-[var(--soft-ink-faint)]">
            Сумма пополнения
          </label>
          <div className="mt-1 flex items-baseline gap-2">
            <input
              id="client-topup-amount"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              value={topUpRaw}
              onChange={(e) => {
                const cleaned = e.target.value.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "");
                setTopUpRaw(cleaned);
              }}
              className="w-full min-w-0 border-0 bg-transparent p-0 font-heading text-4xl font-semibold text-[var(--soft-bordeaux)] outline-none placeholder:text-[var(--soft-ink-faint)] focus:outline-none focus:ring-0"
              data-testid="client-topup-amount"
              aria-label="Сумма пополнения"
            />
            <span className="shrink-0 font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">₽</span>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {[500, 1000, 2000, 3000, 5000].map((amount) => (
              <button
                key={amount}
                onClick={() => setTopUpRaw(String(amount))}
                className={topUpAmount === amount ? "soft-chip soft-chip-warm" : "soft-chip"}
              >
                {amount.toLocaleString("ru-RU")} ₽
              </button>
            ))}
          </div>
          {!topUpValid && topUpAmount > 0 && (
            <p className="mt-3 text-xs" style={{ color: "var(--soft-bordeaux)" }}>
              Сумма от {MIN_TOPUP_RUB} до {MAX_TOPUP_RUB.toLocaleString("ru-RU")} ₽
            </p>
          )}
        </div>

        {/* Single top-up action — pays with the default card when one exists */}
        <div className="mt-4" data-testid="client-checkout-panel">
          {defaultCard ? (
            <div className="space-y-2">
              <button
                onClick={() => handlePayWithSavedCard(defaultCard.id)}
                disabled={payingWithSaved || !topUpValid}
                className="soft-button soft-button-primary w-full"
                data-testid="client-topup-submit"
              >
                {payingWithSaved
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <>Пополнить на {topUpAmount.toLocaleString("ru-RU")} ₽ · •••• {defaultCard.last4}<ArrowUpRight className="h-4 w-4" /></>
                }
              </button>
              <button
                onClick={handleTopUp}
                disabled={creatingPayment || !topUpValid}
                className="soft-button soft-button-ghost w-full"
              >
                {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
                Оплатить другой картой
              </button>
            </div>
          ) : (
            <button
              onClick={handleTopUp}
              disabled={creatingPayment || !topUpValid}
              className="soft-button soft-button-primary w-full"
              data-testid="client-topup-submit"
            >
              {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Пополнить на {topUpAmount.toLocaleString("ru-RU")} ₽<ArrowUpRight className="h-4 w-4" /></>}
            </button>
          )}
        </div>

        <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
          <Shield className="h-3 w-3" />
          Платёж защищён через ЮKassa · мы не храним данные карты
        </div>

        {/* Saved cards — a subsection, not a competing card. «Привязать» is the
            primary affordance only when there are no cards; once a card exists it
            becomes a quiet «+ ещё карта». */}
        <div className="mt-6 border-t border-[var(--soft-paper-edge)] pt-5" data-testid="client-saved-cards">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className="soft-eyebrow">мои карты</div>
            {linkedCards.length > 0 && (
              <button
                onClick={handleLinkCard}
                disabled={savingCard}
                className="soft-chip"
                data-testid="client-link-card"
              >
                {savingCard ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Ещё карта
              </button>
            )}
          </div>

          {loadingCards ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--soft-ink-faint)" }} />
            </div>
          ) : linkedCards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--soft-paper-edge)] py-6 px-4 text-center">
              <p className="text-sm" style={{ color: "var(--soft-ink-soft)" }}>Карта не привязана</p>
              <p className="text-xs mt-1" style={{ color: "var(--soft-ink-faint)" }}>Привяжите карту, чтобы пополнять баланс в один тап</p>
              <button
                onClick={handleLinkCard}
                disabled={savingCard}
                className="soft-button soft-button-primary mt-3"
                style={{ minHeight: "2.25rem", padding: "0.5rem 1.1rem", fontSize: "0.875rem" }}
                data-testid="client-link-card"
              >
                {savingCard ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                Привязать карту
              </button>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {linkedCards.map((card) => (
                <div
                  key={card.id}
                  // X12/Y8: a real bank-card aspect ratio (≈1.6:1) capped at a
                  // compact width — smaller than before so it reads as a wallet
                  // chip, not a hero card.
                  className="relative flex aspect-[1.6/1] w-full max-w-[16.5rem] flex-col justify-between overflow-hidden rounded-[1.1rem] p-4 text-white shadow-md"
                  style={{
                    background: card.isDefault
                      ? "linear-gradient(135deg, #4a2122 0%, #6d3328 55%, #9c4a37 100%)"
                      : "linear-gradient(135deg, #2f2b29 0%, #4a423d 100%)",
                  }}
                  data-testid="client-saved-card"
                >
                  <div className="flex items-start justify-between">
                    <span className="text-sm font-bold uppercase tracking-wider text-white/95">{getBrandLabel(card.brand)}</span>
                    {card.isDefault && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/25 px-2 py-0.5 text-[11px] font-semibold text-white">
                        <Check className="h-3 w-3" /> основная
                      </span>
                    )}
                  </div>
                  <div className="mt-3">
                    <div
                      className="font-heading text-base font-semibold tracking-[0.18em] text-white"
                      style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
                    >
                      •••• •••• •••• {card.last4}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs text-white/85">
                      <span className="truncate pr-2">{card.cardholderName || "—"}</span>
                      <span className="shrink-0 tabular-nums">{card.expiryMonth}/{card.expiryYear.slice(-2)}</span>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    {!card.isDefault && (
                      <button
                        onClick={() => handleSetDefaultCard(card.id)}
                        disabled={settingDefaultCardId === card.id}
                        className="rounded-full bg-white/20 px-3 py-1 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                        data-testid="client-set-default-card"
                      >
                        {settingDefaultCardId === card.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Сделать основной"}
                      </button>
                    )}
                    <button
                      onClick={() => handleRemoveCard(card.id)}
                      className="ml-auto rounded-full bg-white/15 p-1.5 transition-opacity hover:opacity-80"
                      title="Удалить карту"
                      aria-label="Удалить карту"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Payment history — unified deposits + spends table (T21) */}
      <div className="soft-card p-6" data-testid="client-billing-history">
        <div className="flex items-center justify-between gap-3 mb-4">
          <span className="soft-eyebrow">история платежей</span>
          {transactions.some(t => t.status === "PENDING") && (
            <button
              onClick={() => {
                fetch("/api/billing/reconcile", { method: "POST" })
                  .then(() => loadData())
                  .then(() => toast.success("Статус обновлён"))
                  .catch(() => toast.error("Не удалось проверить статус"));
              }}
              className="soft-chip"
              style={{ fontSize: 11 }}
            >
              Проверить статус
            </button>
          )}
        </div>
        <BillingHistoryTable transactions={transactions} ledger={ledger} />
      </div>
    </div>
  );
}
