"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Shield, Trash2, Check, Sparkles, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import {
  getSubscriptionPlanLabel,
  getSubscriptionStatusLabel,
} from "@/lib/billing-labels";
import { appUrl, mainUrl } from "@/lib/subdomain";
import { BillingHistoryTable } from "@/components/cabinet/billing-history-table";

// Static metadata mirrors V5_SUBSCRIPTION_PLANS so we don't drag the
// server-only entitlements module (uses prisma) into the client bundle.
const CLIENT_PLANS: Record<"plus" | "premium", { name: string; amountKopecks: number; trialDays: number; creditsPerPeriod: number; includedProductsCount: number }> = {
  plus: { name: "Plus", amountKopecks: 59000, trialDays: 7, creditsPerPeriod: 12, includedProductsCount: 1 },
  premium: { name: "Premium", amountKopecks: 149000, trialDays: 7, creditsPerPeriod: 20, includedProductsCount: 2 },
};

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

// Z1-Ф1: the client ₽ balance rail is removed. This surface manages the two
// card rails the client still needs — subscriptions (paid by card) and the
// saved-card wallet used for sessions/subscriptions. Digital products are
// opened with clarity credits on /cabinet/credits.
export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [creatingPayment, setCreatingPayment] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [subscriptions, setSubscriptions] = useState<BillingSubscription[]>([]);
  const [linkedCards, setLinkedCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);
  const [settingDefaultCardId, setSettingDefaultCardId] = useState<string | null>(null);

  const loadData = useCallback(() => {
    if (!session) return;

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

    async function reconcileAndRefresh() {
      // Attempt reconcile first — don't assume success
      let reconcileOk = false;
      try {
        const rec = await fetch("/api/billing/reconcile", { method: "POST" });
        reconcileOk = rec.ok;
      } catch { /* network or server error — will retry */ }

      if (cancelled) return;

      const [cardsRes, txRes, entRes] = await Promise.all([
        fetch("/api/billing/cards").then(r => r.json()).catch(() => null),
        fetch("/api/billing/transactions").then(r => r.json()).catch(() => null),
        fetch("/api/billing/entitlements").then(r => r.json()).catch(() => null),
      ]);
      if (cancelled) return;

      if (cardsRes?.cards) setLinkedCards(cardsRes.cards);
      if (txRes?.transactions) setTransactions(txRes.transactions);
      if (txRes?.ledger) setLedger(txRes.ledger);
      if (entRes?.subscriptions) setSubscriptions(entRes.subscriptions);

      const stillPending = (txRes?.transactions ?? []).some((t: { status: string }) => t.status === "PENDING");

      attempts += 1;

      // Show toast only when we know the outcome
      if (attempts === 1) {
        if (payment === "success" && !stillPending) {
          if (reconcileOk) {
            toast.success("Оплата подтверждена!");
          } else {
            toast.error("Не удалось подтвердить платёж. Обновите страницу или обратитесь в поддержку.");
          }
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
  }, [searchParams, router]);

  async function handleLinkCard() {
    setSavingCard(true);
    try {
      // Z1-Ф1: card binding holds 1 ₽ then releases it — verification, no charge.
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

  async function handleStartSubscription(planKey: string) {
    setCreatingPayment(true);
    try {
      // Баг 8: if a card is already linked, charge it in one tap via the saved
      // card instead of forcing a fresh YooKassa checkout. Same grant path, so
      // the subscription activates identically; the saved method also powers
      // auto-renewal. 3-D Secure may still return a confirmation_url to finish.
      const defaultCard = linkedCards.find((c) => c.isDefault) ?? linkedCards[0];
      if (defaultCard) {
        const res = await fetch("/api/billing/pay-with-saved-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: defaultCard.id, planKey, checkoutSource: "client_billing" }),
        });
        const data = await res.json();
        if (data.confirmationUrl) {
          window.location.assign(data.confirmationUrl);
        } else if (data.ok) {
          toast.success("Подписка оформлена!");
          loadData();
        } else {
          toast.error(data.error || "Не удалось оформить подписку");
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

  // B462 §3.4: while the next-auth session resolves, render the page shell with
  // skeleton cards instead of `return null` — the old null left a blank viewport
  // on a cold load of /cabinet/billing (the review's «blank content» screenshot).
  if (status === "loading") {
    return (
      <div className="p-6 md:p-8 space-y-6" data-testid="billing-loading" aria-busy="true">
        <div>
          <div className="soft-eyebrow">оплата</div>
          <h1 className="soft-h1 mt-2">Подписка и оплата</h1>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="soft-card p-6">
              <div className="h-3.5 w-24 animate-pulse rounded bg-[var(--soft-paper-edge)]" />
              <div className="mt-4 h-8 w-32 animate-pulse rounded bg-[var(--soft-paper-edge)]" />
              <div className="mt-6 h-10 w-full animate-pulse rounded bg-[var(--soft-paper-edge)]" />
            </div>
          ))}
        </div>
      </div>
    );
  }
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
  const CLIENT_PLAN_KEYS: Array<"plus" | "premium"> = ["plus", "premium"];

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <div className="soft-eyebrow">оплата</div>
        <h1 className="soft-h1 mt-2">Подписка и оплата</h1>
      </div>

      {/* B349/Механика 2: current subscription sits in the same row as the plan
          cards; the apricot gradient marks the active subscription. */}
      <div className="grid gap-4 md:grid-cols-3" data-testid="client-billing-plans">
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

        {/* Plans — paid by card (the ₽ balance rail is removed) */}
        {CLIENT_PLAN_KEYS.map((key) => {
          const plan = CLIENT_PLANS[key];
          if (!plan) return null;
          const priceRub = (plan.amountKopecks / 100).toLocaleString("ru-RU");
          const isCurrent = activeSub?.planKey === key;
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
                +{plan.creditsPerPeriod} баллов каждый месяц
                · {plan.includedProductsCount} цифровых продуктов включено
                {plan.trialDays > 0 ? ` · ${plan.trialDays} дней пробного периода` : ""}
              </p>
              <p className="mt-2 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                Подписочные баллы сгорают в конце периода. Купленные пакеты баллов действуют 12 месяцев.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                {isCurrent ? (
                  <span className="soft-button soft-button-soft" style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                    Активна
                  </span>
                ) : (
                  <button
                    onClick={() => handleStartSubscription(key)}
                    disabled={creatingPayment}
                    className="soft-button soft-button-primary"
                    style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
                    data-testid={`client-billing-${key}-pay-card`}
                  >
                    {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : "Оформить картой"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* B349/Механика 2: an attractive credit-purchase block right under the
          plans — для тех, кому подписка не нужна, но хочется докупить баллы. */}
      <Link
        href={appUrl("/wallet#wallet-topup")}
        className="soft-card block p-6"
        data-testid="client-billing-credits-cta"
        style={{ background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)", textDecoration: "none" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="soft-eyebrow flex items-center gap-2">
              <Sparkles className="size-4" aria-hidden="true" />
              баллы без подписки
            </div>
            <div className="mt-2" style={{ fontFamily: "var(--font-heading)", fontSize: 26, color: "var(--soft-bordeaux)", fontWeight: 600 }}>
              Докупить баллы
            </div>
            <p className="mt-1 max-w-xl text-sm" style={{ color: "var(--soft-ink-soft)" }}>
              Разовая дозаправка кошелька — открывайте полную картину, разборы, Таро и маршруты
              без ежемесячной подписки. Купленные баллы действуют 12 месяцев.
            </p>
          </div>
          <span className="soft-button soft-button-primary shrink-0" style={{ minHeight: "2.5rem" }}>
            Пополнить кошелёк
            <ArrowRight className="size-4" aria-hidden="true" />
          </span>
        </div>
      </Link>

      {/* Saved cards — the wallet used for sessions and subscriptions. Binding a
          card holds 1 ₽ then releases it (verification only, no charge). */}
      <div className="soft-card p-6" data-testid="client-saved-cards">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="soft-eyebrow">мои карты</div>
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
              Карты для оплаты сессий и подписки
            </p>
          </div>
        </div>

        {loadingCards ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--soft-ink-faint)" }} />
          </div>
        ) : (
          // Баг 8: compact cards, 3 per row, with a trailing "+" placeholder tile
          // as the single entry point to add a card (no separate "Ещё карта").
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {linkedCards.map((card) => (
              <div
                key={card.id}
                className="relative flex aspect-[1.6/1] w-full flex-col justify-between overflow-hidden rounded-[0.9rem] p-3 text-white shadow-md"
                style={{
                  background: card.isDefault
                    ? "linear-gradient(135deg, #4a2122 0%, #6d3328 55%, #9c4a37 100%)"
                    : "linear-gradient(135deg, #2f2b29 0%, #4a423d 100%)",
                }}
                data-testid="client-saved-card"
              >
                <div className="flex items-start justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-white/95">{getBrandLabel(card.brand)}</span>
                  {card.isDefault && (
                    <span className="inline-flex items-center gap-0.5 rounded-full bg-white/25 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      <Check className="h-2.5 w-2.5" /> основная
                    </span>
                  )}
                </div>
                <div>
                  <div
                    className="font-heading text-sm font-semibold tracking-[0.12em] text-white"
                    style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}
                  >
                    •••• {card.last4}
                  </div>
                  <div className="mt-1 flex items-center justify-between text-[10px] text-white/85">
                    <span className="truncate pr-2">{card.cardholderName || "—"}</span>
                    <span className="shrink-0 tabular-nums">{card.expiryMonth}/{card.expiryYear.slice(-2)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {!card.isDefault && (
                    <button
                      onClick={() => handleSetDefaultCard(card.id)}
                      disabled={settingDefaultCardId === card.id}
                      className="rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                      data-testid="client-set-default-card"
                    >
                      {settingDefaultCardId === card.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Основной"}
                    </button>
                  )}
                  <button
                    onClick={() => handleRemoveCard(card.id)}
                    className="ml-auto rounded-full bg-white/15 p-1 transition-opacity hover:opacity-80"
                    title="Удалить карту"
                    aria-label="Удалить карту"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
            <button
              onClick={handleLinkCard}
              disabled={savingCard}
              className="flex aspect-[1.6/1] w-full flex-col items-center justify-center gap-1.5 rounded-[0.9rem] border-2 border-dashed border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)] transition-colors hover:border-[var(--soft-bordeaux)]/50 hover:text-[var(--soft-bordeaux)] disabled:opacity-50"
              data-testid="client-link-card"
              title={linkedCards.length === 0 ? "Привязать карту" : "Добавить карту"}
            >
              {savingCard ? <Loader2 className="h-6 w-6 animate-spin" /> : <Plus className="h-7 w-7" />}
              <span className="text-[11px] font-medium">{linkedCards.length === 0 ? "Привязать карту" : "Ещё карта"}</span>
            </button>
          </div>
        )}
        {!loadingCards && linkedCards.length === 0 && (
          <p className="mt-2 text-center text-xs" style={{ color: "var(--soft-ink-faint)" }}>
            Привяжите карту, чтобы оплачивать сессии и подписку в один тап
          </p>
        )}

        <div className="flex items-center gap-2 mt-4 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
          <Shield className="h-3 w-3" />
          Платёж защищён через ЮKassa · мы не храним данные карты
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
