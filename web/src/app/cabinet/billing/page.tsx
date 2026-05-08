"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, ArrowUpRight, Shield, Trash2, Check } from "lucide-react";
import { toast } from "sonner";

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

interface BillingEntitlement {
  id: string;
  productKey: string;
  source: string;
  status: string;
  active: boolean;
  validUntil: string | null;
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
  const [topUpAmount, setTopUpAmount] = useState(500);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [savingCard, setSavingCard] = useState(false);
  const [payingWithSaved, setPayingWithSaved] = useState(false);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [entitlements, setEntitlements] = useState<BillingEntitlement[]>([]);
  const [subscriptions, setSubscriptions] = useState<BillingSubscription[]>([]);
  const [linkedCards, setLinkedCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);

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
      })
      .catch(() => {});

    fetch("/api/billing/entitlements")
      .then(r => r.json())
      .then(d => {
        setEntitlements(d.entitlements ?? []);
        setSubscriptions(d.subscriptions ?? []);
      })
      .catch(() => {});
  }, [session]);

  useEffect(() => { loadData(); }, [loadData]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const payment = searchParams?.get("payment");
    if (payment !== "success" && payment !== "card-saved") return;

    if (payment === "success") toast.success("Баланс успешно пополнен!");
    if (payment === "card-saved") toast.success("Карта успешно привязана!");

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 6;

    async function reconcileAndRefresh() {
      try {
        await fetch("/api/billing/reconcile", { method: "POST" });
      } catch { /* fall through */ }
      if (cancelled) return;

      const [balRes, cardsRes, txRes] = await Promise.all([
        fetch("/api/billing/balance").then(r => r.json()).catch(() => null),
        fetch("/api/billing/cards").then(r => r.json()).catch(() => null),
        fetch("/api/billing/transactions").then(r => r.json()).catch(() => null),
      ]);
      if (cancelled) return;

      if (balRes?.balanceRub) setBalanceRub(balRes.balanceRub);
      if (cardsRes?.cards) setLinkedCards(cardsRes.cards);
      if (txRes?.transactions) setTransactions(txRes.transactions);
      if (txRes?.ledger) setLedger(txRes.ledger);

      const stillPending = (txRes?.transactions ?? []).some((t: { status: string }) => t.status === "PENDING");
      attempts += 1;
      if (stillPending && attempts < maxAttempts && !cancelled) {
        setTimeout(reconcileAndRefresh, 2000);
      }
    }

    reconcileAndRefresh();
    router.replace("/cabinet/billing");
    return () => { cancelled = true; };
  }, [searchParams, router]);

  async function handleTopUp() {
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
        window.location.href = data.confirmationUrl;
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
        window.location.href = data.confirmationUrl;
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

  async function handlePayWithSavedCard(cardId: string) {
    setPayingWithSaved(true);
    try {
      const res = await fetch("/api/billing/pay-with-saved-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId, amountKopecks: topUpAmount * 100 }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.paid || data.credited) {
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

  if (status === "loading") return null;
  if (!session) { router.push("/login"); return null; }

  const activeSub = subscriptions.find(s => s.active);

  return (
    <div className="p-6 md:p-8 space-y-6">
      <div>
        <div className="soft-eyebrow">оплата</div>
        <h1 className="soft-h1 mt-2">Подписка и оплата</h1>
      </div>

      {/* Subscription card */}
      <div className="soft-card p-6" style={{ background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)" }}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="soft-eyebrow">текущая подписка</div>
            <div className="mt-2" style={{ fontFamily: "var(--font-heading)", fontSize: 36, color: "var(--soft-bordeaux)", fontWeight: 600 }}>
              {activeSub?.planKey ?? "Бесплатный"}
            </div>
            {activeSub?.currentPeriodEnd && (
              <div className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
                следующее списание {new Date(activeSub.currentPeriodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}
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
            <button className="soft-button soft-button-primary" style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
              Сравнить тарифы
            </button>
            <button className="soft-button soft-button-ghost" style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
              Перейти на Premium
            </button>
            <button className="soft-chip" style={{ color: "var(--soft-ink-faint)" }}>
              Отменить подписку
            </button>
          </div>
        </div>
      </div>

      {/* Balance card */}
      <div className="soft-card p-6">
        <div className="soft-eyebrow mb-3">баланс</div>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div style={{ fontFamily: "var(--font-heading)", fontSize: 36, color: "var(--soft-bordeaux)", fontWeight: 600 }}>
            {Number(balanceRub).toLocaleString("ru", { minimumFractionDigits: 2 })} ₽
          </div>
          <button
            onClick={handleTopUp}
            disabled={creatingPayment}
            className="soft-button soft-button-primary"
            style={{ minHeight: "2.25rem", padding: "0.5rem 1.25rem", fontSize: "0.875rem" }}
          >
            {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {creatingPayment ? "Создание платежа..." : "Пополнить"}
          </button>
        </div>
      </div>

      {/* Payment method */}
      <div className="soft-card p-6">
        <div className="soft-eyebrow mb-4">способ оплаты</div>
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center rounded-md text-xs font-bold"
              style={{ width: 48, height: 32, background: "var(--soft-paper-deep)", color: "var(--soft-ink-faint)" }}>
              CARD
            </div>
            <div>
              <button
                onClick={handleLinkCard}
                disabled={savingCard}
                className="flex items-center gap-1.5 text-sm"
                style={{ color: "var(--soft-terracotta-dark)" }}
              >
                {savingCard ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Привязать карту
              </button>
            </div>
          </div>
        </div>

        {/* Saved cards */}
        {loadingCards ? (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: "var(--soft-ink-faint)" }} />
          </div>
        ) : linkedCards.length > 0 && (
          <div className="mt-4 space-y-2">
            {linkedCards.map((card) => (
              <div key={card.id} className="flex items-center justify-between"
                style={{ padding: "12px 0", borderTop: "1px solid var(--soft-paper-edge)" }}>
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center rounded-md text-xs font-bold"
                    style={{ width: 48, height: 32, background: "var(--soft-paper-deep)", color: "var(--soft-ink-faint)" }}>
                    {getBrandLabel(card.brand)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">•••• {card.last4}</span>
                      {card.isDefault && (
                        <span className="soft-badge" style={{ fontSize: 11 }}>
                          <Check className="h-3 w-3" /> основная
                        </span>
                      )}
                    </div>
                    <div className="text-xs" style={{ color: "var(--soft-ink-faint)", marginTop: 2 }}>
                      {card.expiryMonth}/{card.expiryYear.slice(-2)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handlePayWithSavedCard(card.id)}
                    disabled={payingWithSaved}
                    className="soft-chip"
                  >
                    {payingWithSaved ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Пополнить"}
                  </button>
                  <button
                    onClick={() => handleRemoveCard(card.id)}
                    className="p-1.5 transition-colors hover:opacity-70"
                    title="Удалить карту"
                    style={{ color: "var(--soft-ink-faint)" }}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Top-up amounts */}
      <div className="soft-card p-6">
        <div className="soft-eyebrow mb-4">пополнить баланс</div>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {[300, 500, 1000, 2000, 3000, 5000].map((amount) => (
            <button
              key={amount}
              onClick={() => setTopUpAmount(amount)}
              className={topUpAmount === amount ? "soft-chip soft-chip-warm" : "soft-chip"}
            >
              {amount} ₽
            </button>
          ))}
        </div>

        {linkedCards.length > 0 ? (
          <div className="space-y-2">
            <button
              onClick={() => {
                const defaultCard = linkedCards.find(c => c.isDefault) ?? linkedCards[0];
                handlePayWithSavedCard(defaultCard.id);
              }}
              disabled={payingWithSaved}
              className="soft-button soft-button-primary w-full"
            >
              {payingWithSaved
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <>Пополнить на {topUpAmount} ₽ с •••• {linkedCards.find(c => c.isDefault)?.last4 ?? linkedCards[0].last4}<ArrowUpRight className="h-4 w-4" /></>
              }
            </button>
            <button
              onClick={handleTopUp}
              disabled={creatingPayment}
              className="soft-button soft-button-ghost w-full"
            >
              {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
              Другой способ оплаты
            </button>
          </div>
        ) : (
          <button
            onClick={handleTopUp}
            disabled={creatingPayment || !topUpAmount}
            className="soft-button soft-button-primary w-full"
          >
            {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Пополнить на {topUpAmount} ₽<ArrowUpRight className="h-4 w-4" /></>}
          </button>
        )}

        <div className="flex items-center gap-2 mt-3 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
          <Shield className="h-3 w-3" />
          Безопасная оплата через ЮKassa
        </div>
      </div>

      {/* Open entitlements */}
      {entitlements.length > 0 && (
        <div className="soft-card p-6">
          <div className="soft-eyebrow mb-4">открытые продукты</div>
          <div className="grid gap-2 sm:grid-cols-2">
            {entitlements.slice(0, 8).map((e) => (
              <div key={e.id} className="soft-card-flat p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{e.productKey}</span>
                  <span className="soft-badge" style={e.active ? {} : { background: "var(--soft-paper-deep)", color: "var(--soft-ink-faint)" }}>
                    {e.active ? "Активен" : e.status}
                  </span>
                </div>
                <div className="text-xs mt-1" style={{ color: "var(--soft-ink-faint)" }}>
                  {e.source}{e.validUntil ? ` · до ${new Date(e.validUntil).toLocaleDateString("ru-RU")}` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment history */}
      <div className="soft-card p-6">
        <div className="soft-eyebrow mb-4">история платежей</div>
        {transactions.length === 0 ? (
          <div className="py-8 text-center text-sm" style={{ color: "var(--soft-ink-faint)" }}>
            <p>Операций пока нет</p>
            <p className="text-xs mt-1">Здесь будут отображаться ваши платежи и списания</p>
          </div>
        ) : (
          <div className="space-y-0">
            {transactions.slice(0, 10).map((t, i) => (
              <div key={t.id} className="flex items-center justify-between"
                style={{ padding: "14px 0", borderTop: i ? "1px solid var(--soft-paper-edge)" : "none" }}>
                <div>
                  <div className="font-medium" style={{ fontSize: 15 }}>{t.description || "Пополнение"}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--soft-ink-faint)" }}>
                    {new Date(t.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span style={{ fontFamily: "var(--font-heading)", color: "var(--soft-bordeaux)", fontWeight: 600 }}>
                    {Number(t.amountRub) > 0 ? "+" : ""}{Number(t.amountRub).toFixed(2)} ₽
                  </span>
                  <span className="soft-badge soft-badge-warm" style={{ fontSize: 11 }}>
                    {t.status === "SUCCEEDED" ? "Оплачено" : t.status === "PENDING" ? "В обработке" : "Отменён"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
        {ledger.length > 0 && (
          <div className="mt-6">
            <div className="soft-eyebrow mb-3">кредитный ledger</div>
            <div className="space-y-0">
              {ledger.slice(0, 8).map((entry, i) => (
                <div key={entry.id} className="flex items-center justify-between"
                  style={{ padding: "14px 0", borderTop: i ? "1px solid var(--soft-paper-edge)" : "none" }}>
                  <div>
                    <div className="font-medium" style={{ fontSize: 15 }}>{entry.description || entry.type}</div>
                    <div className="text-xs mt-0.5" style={{ color: "var(--soft-ink-faint)" }}>
                      {new Date(entry.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric" })}
                    </div>
                  </div>
                  <span style={{ fontFamily: "var(--font-heading)", color: "var(--soft-bordeaux)", fontWeight: 600 }}>
                    {Number(entry.amountRub) >= 0 ? "+" : ""}{Number(entry.amountRub).toFixed(2)} ₽
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
