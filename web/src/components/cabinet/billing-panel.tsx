"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2, Plus, Shield, Trash2, Check } from "lucide-react";
import { toast } from "sonner";
import { getSubscriptionPlanLabel, getSubscriptionStatusLabel } from "@/lib/billing-labels";
import { mainUrl } from "@/lib/subdomain";
import { BillingHistoryTable } from "@/components/cabinet/billing-history-table";

// B464 IB3 — the billing surface merged into «Кошелёк». Static plan metadata
// mirrors V5_SUBSCRIPTION_PLANS so we don't drag the server-only entitlements
// module (prisma) into the client bundle. All 3 tiers render in landing order at
// fixed positions (round-2 #2); the current plan is highlighted without moving.
const PLAN_CARDS: Array<{
  key: "free" | "plus" | "premium";
  name: string;
  eyebrow: string;
  amountKopecks: number;
  perMonth: boolean;
  summary: string;
}> = [
  { key: "free", name: "Базовый", eyebrow: "бесплатно", amountKopecks: 0, perMonth: false, summary: "История вопросов, дневник и первичные разборы — без подписки." },
  { key: "plus", name: "Plus", eyebrow: "стартовая подписка", amountKopecks: 59000, perMonth: true, summary: "+12 баллов каждый месяц · 1 цифровой продукт включён · 7 дней пробно." },
  { key: "premium", name: "Premium", eyebrow: "расширенная подписка", amountKopecks: 149000, perMonth: true, summary: "+20 баллов каждый месяц · 2 цифровых продукта включено · 7 дней пробно." },
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

export function BillingPanel() {
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
      .then(d => { setSubscriptions(d.subscriptions ?? []); })
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

      if (attempts === 1) {
        if (payment === "success" && !stillPending) {
          if (reconcileOk) toast.success("Оплата подтверждена!");
          else toast.error("Не удалось подтвердить платёж. Обновите страницу или обратитесь в поддержку.");
        }
        if (payment === "card-saved" && !stillPending) toast.success("Карта успешно привязана!");
      }

      if (stillPending && attempts < maxAttempts && !cancelled) {
        setTimeout(reconcileAndRefresh, 2000);
      } else if (stillPending && attempts >= maxAttempts) {
        toast.error("Платёж обрабатывается. Обновите страницу через минуту.");
      }
    }

    reconcileAndRefresh();
    router.replace("/cabinet/wallet");
    return () => { cancelled = true; };
  }, [searchParams, router]);

  async function handleLinkCard() {
    setSavingCard(true);
    try {
      const res = await fetch("/api/billing/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amountKopecks: 100, description: "Привязка банковской карты" }),
      });
      const data = await res.json();
      if (data.confirmationUrl) window.location.assign(data.confirmationUrl);
      else toast.error(data.error || "Ошибка привязки карты");
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
    setLinkedCards(prev => prev.map(c => ({ ...c, isDefault: c.id === cardId })));
    try {
      const res = await fetch("/api/billing/cards", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, action: "set_default" }),
      });
      const data = await res.json();
      if (data.ok) toast.success("Основная карта обновлена");
      else { toast.error(data.error || "Не удалось назначить основную карту"); loadData(); }
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
      const defaultCard = linkedCards.find((c) => c.isDefault) ?? linkedCards[0];
      if (defaultCard) {
        const res = await fetch("/api/billing/pay-with-saved-card", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cardId: defaultCard.id, planKey, checkoutSource: "client_billing" }),
        });
        const data = await res.json();
        if (data.confirmationUrl) window.location.assign(data.confirmationUrl);
        else if (data.ok) { toast.success("Подписка оформлена!"); loadData(); }
        else toast.error(data.error || "Не удалось оформить подписку");
        return;
      }
      const res = await fetch("/api/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey, checkoutSource: "client_billing" }),
      });
      const data = await res.json();
      if (data.confirmationUrl) window.location.assign(data.confirmationUrl);
      else toast.error(data.error || "Не удалось открыть оплату подписки");
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
      if (data.ok) { toast.success("Подписка будет отменена в конце периода"); loadData(); }
      else toast.error(data.error || "Не удалось отменить подписку");
    } catch {
      toast.error("Ошибка сети");
    }
  }

  if (status === "loading") {
    return (
      <div className="space-y-6" data-testid="billing-loading" aria-busy="true">
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
  if (!session) return null;

  const activeSub = subscriptions.find(s => s.active);
  const currentKey: "free" | "plus" | "premium" = (activeSub?.planKey === "plus" || activeSub?.planKey === "premium") ? activeSub.planKey : "free";
  const currentSubscriptionStatus = activeSub
    ? activeSub.cancelAtPeriodEnd
      ? "Отменяется в конце периода"
      : getSubscriptionStatusLabel(activeSub.status)
    : "Базовый доступ";

  return (
    <div className="space-y-6">
      {/* Подписка — 3 fixed plan cards, current highlighted (round-2 #2 / round-3 #2) */}
      <div>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="soft-eyebrow">подписка</p>
            <h2 className="soft-h2 mt-1">Ваш тариф — {getSubscriptionPlanLabel(activeSub?.planKey)}</h2>
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">{currentSubscriptionStatus}
              {activeSub?.currentPeriodEnd ? ` · ${activeSub.cancelAtPeriodEnd ? "доступ до" : "следующее списание"} ${new Date(activeSub.currentPeriodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : ""}
            </p>
          </div>
          <Link href={mainUrl("/pricing")} className="soft-button soft-button-ghost" style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
            Сравнить тарифы
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-3" data-testid="client-billing-plans">
          {PLAN_CARDS.map((plan) => {
            const isCurrent = plan.key === currentKey;
            const priceRub = (plan.amountKopecks / 100).toLocaleString("ru-RU");
            return (
              <div
                key={plan.key}
                className="soft-card p-6"
                data-testid={plan.key === "free" ? "client-billing-subscription" : `client-billing-plan-${plan.key}`}
                style={isCurrent ? { background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)", border: "1px solid var(--soft-terracotta)" } : undefined}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <div className="soft-eyebrow">{isCurrent ? "ваш тариф" : plan.eyebrow}</div>
                    <div className="mt-2" style={{ fontFamily: "var(--font-heading)", fontSize: 28, color: "var(--soft-bordeaux)", fontWeight: 600 }}>{plan.name}</div>
                  </div>
                  <div className="text-right">
                    <div style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: "var(--soft-bordeaux)", fontWeight: 600 }}>{priceRub} ₽</div>
                    {plan.perMonth && <div className="text-xs text-[var(--soft-ink-faint)]">в месяц</div>}
                  </div>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{plan.summary}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {isCurrent ? (
                    <span className="soft-button soft-button-soft" style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
                      {plan.key === "free" ? "Текущий" : "Активна"}
                    </span>
                  ) : plan.key === "free" ? null : (
                    <button
                      onClick={() => handleStartSubscription(plan.key)}
                      disabled={creatingPayment}
                      className="soft-button soft-button-primary"
                      style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
                      data-testid={`client-billing-${plan.key}-pay-card`}
                    >
                      {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : "Оформить картой"}
                    </button>
                  )}
                  {isCurrent && activeSub && !activeSub.cancelAtPeriodEnd && plan.key !== "free" && (
                    <button onClick={() => handleCancelSubscription(activeSub.id)} className="soft-chip" style={{ color: "var(--soft-ink-faint)" }}>
                      Отменить
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
          Подписочные баллы сгорают в конце периода. Купленные пакеты баллов действуют 12 месяцев.
        </p>
      </div>

      {/* Карты и платежи — saved cards (delete bottom-right) + history (round-3 #3) */}
      <div className="soft-card p-6" data-testid="client-saved-cards">
        <div className="mb-3">
          <div className="soft-eyebrow">карты и платежи</div>
          <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">Карты для оплаты сессий и подписки</p>
        </div>

        {loadingCards ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--soft-ink-faint)" }} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {linkedCards.map((card) => (
              <div
                key={card.id}
                className="relative flex aspect-[1.6/1] w-full flex-col justify-between overflow-hidden rounded-[0.9rem] p-3 text-white shadow-md"
                style={{ background: card.isDefault ? "linear-gradient(135deg, #4a2122 0%, #6d3328 55%, #9c4a37 100%)" : "linear-gradient(135deg, #2f2b29 0%, #4a423d 100%)" }}
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
                <div className="flex items-end justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-heading text-sm font-semibold tracking-[0.12em] text-white" style={{ textShadow: "0 1px 3px rgba(0,0,0,0.4)" }}>•••• {card.last4}</div>
                    <div className="mt-1 flex items-center gap-2 text-[10px] text-white/85">
                      <span className="truncate">{card.cardholderName || "—"}</span>
                      <span className="shrink-0 tabular-nums">{card.expiryMonth}/{card.expiryYear.slice(-2)}</span>
                    </div>
                  </div>
                  {/* round-3 #3: delete icon bottom-right, next to the number */}
                  <button
                    onClick={() => handleRemoveCard(card.id)}
                    className="shrink-0 rounded-full bg-white/15 p-1 transition-opacity hover:opacity-80"
                    title="Удалить карту"
                    aria-label="Удалить карту"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {!card.isDefault && (
                  <button
                    onClick={() => handleSetDefaultCard(card.id)}
                    disabled={settingDefaultCardId === card.id}
                    className="absolute left-3 top-3 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-medium transition-opacity hover:opacity-80 disabled:opacity-50"
                    data-testid="client-set-default-card"
                  >
                    {settingDefaultCardId === card.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Основной"}
                  </button>
                )}
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
          <p className="mt-2 text-center text-xs" style={{ color: "var(--soft-ink-faint)" }}>Привяжите карту, чтобы оплачивать сессии и подписку в один тап</p>
        )}

        <div className="mt-4 flex items-center gap-2 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
          <Shield className="h-3 w-3" />
          Платёж защищён через ЮKassa · мы не храним данные карты
        </div>
      </div>

      {/* Payment history */}
      <div className="soft-card p-6" data-testid="client-billing-history">
        <div className="mb-4 flex items-center justify-between gap-3">
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
