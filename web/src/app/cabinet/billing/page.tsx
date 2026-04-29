"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Wallet, Plus, ArrowUpRight, Clock, Shield, Loader2, CreditCard, Trash2, Check } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const FEATURES = [
  "3 бесплатных сессии в месяц",
  "Доступ ко всем направлениям",
  "Без привязки карты",
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

function getBrandIcon(brand: string) {
  const b = brand.toLowerCase();
  if (b.includes("visa")) return "VISA";
  if (b.includes("master")) return "MC";
  if (b.includes("mir")) return "МИР";
  return "CARD";
}

function getBrandGradient(brand: string) {
  const b = brand.toLowerCase();
  if (b.includes("visa")) return "from-blue-500/20 to-blue-600/5";
  if (b.includes("master")) return "from-orange-500/20 to-red-600/5";
  if (b.includes("mir")) return "from-green-500/20 to-emerald-600/5";
  return "from-primary/20 to-primary/5";
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

  // Cards
  const [linkedCards, setLinkedCards] = useState<SavedCard[]>([]);
  const [loadingCards, setLoadingCards] = useState(true);

  // Load balance, cards, transactions
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
      .then(d => { setTransactions(d.transactions ?? []); })
      .catch(() => {});
  }, [session]);

  useEffect(() => { loadData(); }, [loadData]);

  // Check for payment result from URL params.
  // After YooKassa redirects the user back, the webhook may still be in flight —
  // in test mode it can arrive seconds (or never) later. Actively reconcile the
  // pending transactions against YooKassa on mount, then poll balance for a few
  // seconds so the UI doesn't show a stale number.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const payment = searchParams?.get("payment");
    if (payment !== "success" && payment !== "card-saved") return;

    if (payment === "success") toast.success("Баланс успешно пополнен!");
    if (payment === "card-saved") toast.success("Карта успешно привязана!");

    let cancelled = false;
    let attempts = 0;
    const maxAttempts = 6; // ~12s total at 2s intervals

    async function reconcileAndRefresh() {
      try {
        await fetch("/api/billing/reconcile", { method: "POST" });
      } catch { /* network errors are fine — fall through to polling */ }
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

  // Standard top-up (redirect to YooKassa)
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

  // Link a new card (create payment with save_payment_method)
  async function handleLinkCard() {
    setSavingCard(true);
    try {
      const res = await fetch("/api/billing/save-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amountKopecks: 100, // 1 ₽ for card linking
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

  // Remove a saved card
  async function handleRemoveCard(cardId: string) {
    try {
      const res = await fetch(`/api/billing/cards?cardId=${cardId}`, {
        method: "DELETE",
      });
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

  // Quick top-up with saved card
  async function handlePayWithSavedCard(cardId: string) {
    setPayingWithSaved(true);
    try {
      const res = await fetch("/api/billing/pay-with-saved-card", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          cardId,
          amountKopecks: topUpAmount * 100,
        }),
      });
      const data = await res.json();
      if (data.ok) {
        if (data.paid || data.credited) {
          toast.success(`Баланс пополнен на ${topUpAmount} ₽`);
          loadData();
        } else {
          toast.success("Платёж обрабатывается");
          // Saved-card charge is usually synchronous, but if YooKassa returns a
          // not-yet-captured status we reconcile a few times until it settles.
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

  return (
    <div className="premium-page mx-auto max-w-6xl space-y-6 px-4 py-8 sm:px-6">
      <div>
        <p className="premium-eyebrow">Оплата</p>
        <h1 className="premium-title mt-2 text-3xl md:text-5xl">Баланс и безопасная оплата</h1>
      </div>

      {/* Баланс */}
      <Card className="border-brand-warm-gold/30 bg-[linear-gradient(135deg,#fbf6ef,#f1e3d2)] text-brand-midnight shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="mb-1 flex items-center gap-2 text-sm text-slate-600">
                <Wallet className="h-4 w-4" />
                Баланс
              </div>
              <p className="font-heading text-4xl font-medium text-brand-midnight tabular-nums">{Number(balanceRub).toLocaleString("ru", { minimumFractionDigits: 2 })} ₽</p>
            </div>
            <button
              onClick={handleTopUp}
              disabled={creatingPayment}
              className="flex items-center gap-2 rounded-full bg-[linear-gradient(180deg,var(--brand-soft-gold),var(--brand-warm-gold))] px-5 py-3 text-sm font-semibold text-navy shadow-[var(--shadow-halo-gold)] transition-colors hover:brightness-105 disabled:opacity-50"
            >
              {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creatingPayment ? "Создание платежа..." : "Пополнить"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* План */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Ваш план</h2>
            <Badge variant="secondary" className="bg-primary/10 text-primary">Бесплатный</Badge>
          </div>
          <ul className="space-y-2">
            {FEATURES.map((f, i) => (
              <li key={i} className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="text-green-400">✓</span>
                {f}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {/* Привязанные карты */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Банковские карты</h2>
              {linkedCards.length > 0 && (
                <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                  {linkedCards.length}
                </span>
              )}
            </div>
            <button
              onClick={handleLinkCard}
              disabled={savingCard}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors disabled:opacity-50"
            >
              {savingCard ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Привязать карту
            </button>
          </div>

          {/* Список карт */}
          {loadingCards ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : linkedCards.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <p>Нет привязанных карт</p>
              <p className="text-xs mt-1 text-muted-foreground/70">Привяжите карту для быстрых платежей</p>
            </div>
          ) : (
            <div className="space-y-2">
              {linkedCards.map((card) => (
                <div key={card.id} className="flex items-center justify-between rounded-lg border border-border/20 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-9 w-12 items-center justify-center rounded bg-gradient-to-br ${getBrandGradient(card.brand)} border border-border/20`}>
                      <span className="text-[10px] font-bold text-muted-foreground tracking-wider">{getBrandIcon(card.brand)}</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">•••• {card.last4}</p>
                        {card.isDefault && (
                          <span className="flex items-center gap-1 text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                            <Check className="h-3 w-3" />
                            Основная
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {card.expiryMonth}/{card.expiryYear.slice(-2)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handlePayWithSavedCard(card.id)}
                      disabled={payingWithSaved}
                      className="rounded-md px-3 py-1.5 text-xs font-medium text-primary bg-primary/10 hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {payingWithSaved ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Пополнить"}
                    </button>
                    <button
                      onClick={() => handleRemoveCard(card.id)}
                      className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Удалить карту"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Быстрое пополнение */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4">Пополнить баланс</h2>
          <div className="grid grid-cols-3 gap-3 mb-4">
            {[300, 500, 1000, 2000, 3000, 5000].map((amount) => (
              <button
                key={amount}
                onClick={() => setTopUpAmount(amount)}
                className={`rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors ${
                  topUpAmount === amount
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/30 hover:border-primary/30 text-muted-foreground"
                }`}
              >
                {amount} ₽
              </button>
            ))}
          </div>

          {/* Если есть привязанные карты — показать кнопку быстрой оплаты */}
          {linkedCards.length > 0 ? (
            <div className="space-y-2">
              <button
                onClick={() => {
                  const defaultCard = linkedCards.find(c => c.isDefault) ?? linkedCards[0];
                  handlePayWithSavedCard(defaultCard.id);
                }}
                disabled={payingWithSaved}
                className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-navy hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {payingWithSaved ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Пополнить на {topUpAmount} ₽ с •••• {linkedCards.find(c => c.isDefault)?.last4 ?? linkedCards[0].last4}<ArrowUpRight className="h-4 w-4" /></>}
              </button>
              <button
                onClick={handleTopUp}
                disabled={creatingPayment}
                className="w-full rounded-xl border border-border/30 py-3 text-sm font-medium hover:border-primary/30 transition-colors disabled:opacity-50"
              >
                {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> : null}
                Другой способ оплаты
              </button>
            </div>
          ) : (
            <button
              onClick={handleTopUp}
              disabled={creatingPayment || !topUpAmount}
              className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-navy hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Пополнить на {topUpAmount} ₽<ArrowUpRight className="h-4 w-4" /></>}
            </button>
          )}

          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground/70">
            <Shield className="h-3 w-3" />
            Безопасная оплата через ЮKassa
          </div>
        </CardContent>
      </Card>

      {/* История операций */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">История операций</h2>
          </div>
          {transactions.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">
              <p>Операций пока нет</p>
              <p className="text-xs mt-1 text-muted-foreground/70">Здесь будут отображаться ваши платежи и списания</p>
            </div>
          ) : (
            <div className="space-y-2">
              {transactions.slice(0, 10).map((t) => (
                <div key={t.id} className="flex items-center justify-between rounded-lg border border-border/20 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">{t.description || "Пополнение"}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString("ru-RU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-semibold ${Number(t.amountRub) > 0 ? "text-green-400" : "text-destructive"}`}>
                      {Number(t.amountRub) > 0 ? "+" : ""}{Number(t.amountRub).toFixed(2)} ₽
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                      {t.status === "SUCCEEDED" ? "✓ Выполнен" : t.status === "PENDING" ? "⏳ Ожидание" : "✕ Отменён"}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
