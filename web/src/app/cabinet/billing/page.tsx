"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Wallet, Plus, ArrowUpRight, Clock, Shield, Loader2, CreditCard, Trash2, Lock } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const FEATURES = [
  "3 бесплатных сессии в месяц",
  "Доступ ко всем направлениям",
  "Без привязки карты",
];

interface LinkedCard {
  id: string;
  last4: string;
  brand: string;
  expiryMonth: number;
  expiryYear: number;
  isDefault: boolean;
}

const MOCK_CARDS: LinkedCard[] = [
  { id: "card_1", last4: "4242", brand: "Visa", expiryMonth: 12, expiryYear: 2027, isDefault: true },
  { id: "card_2", last4: "5555", brand: "Mastercard", expiryMonth: 8, expiryYear: 2028, isDefault: false },
];

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [balanceRub, setBalanceRub] = useState("0.00");
  const [topUpAmount, setTopUpAmount] = useState(500);
  const [creatingPayment, setCreatingPayment] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Cards
  const [linkedCards, setLinkedCards] = useState<LinkedCard[]>(MOCK_CARDS);
  const [showCardForm, setShowCardForm] = useState(false);
  const [cardForm, setCardForm] = useState({ number: "", expiry: "", cvv: "" });

  // Загрузка баланса
  useEffect(() => {
    if (!session) return;
    fetch("/api/billing/balance")
      .then(r => r.json())
      .then(d => { setBalanceRub(d.balanceRub); })
      .catch(() => {});

    // Загрузка истории
    fetch("/api/billing/transactions")
      .then(r => r.json())
      .then(d => { setTransactions(d.transactions ?? []); })
      .catch(() => {});
  }, [session]);

  // Создание платежа → редирект на ЮKassa
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

  // Cards
  function handleLinkCard() {
    const num = cardForm.number.replace(/\s/g, "");
    if (num.length < 13 || num.length > 19) {
      toast.error("Введите корректный номер карты");
      return;
    }
    if (!/^\d{2}\/\d{2}$/.test(cardForm.expiry)) {
      toast.error("Введите срок в формате ММ/ГГ");
      return;
    }
    if (cardForm.cvv.length < 3) {
      toast.error("Введите CVV");
      return;
    }
    // Placeholder: no real tokenization yet
    const last4 = num.slice(-4);
    const [mm, yy] = cardForm.expiry.split("/").map(Number);
    const newCard: LinkedCard = {
      id: `card_${Date.now()}`,
      last4,
      brand: num.startsWith("4") ? "Visa" : "Mastercard",
      expiryMonth: mm,
      expiryYear: 2000 + yy,
      isDefault: linkedCards.length === 0,
    };
    setLinkedCards((prev) => [...prev, newCard]);
    setCardForm({ number: "", expiry: "", cvv: "" });
    setShowCardForm(false);
    toast.success(`Карта ••••${last4} привязана`);
  }

  function handleRemoveCard(cardId: string) {
    setLinkedCards((prev) => prev.filter((c) => c.id !== cardId));
    toast.success("Карта удалена");
  }

  if (status === "loading") return null;
  if (!session) { router.push("/login"); return null; }

  return (
    <div className="px-4 py-8 sm:px-6 max-w-3xl mx-auto space-y-6">
      <h1 className="font-heading text-2xl font-bold">Баланс и оплата</h1>

      {/* Баланс — крупно, сверху */}
      <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-primary/10">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                <Wallet className="h-4 w-4" />
                Баланс
              </div>
              <p className="font-heading text-4xl font-bold text-primary tabular-nums">{Number(balanceRub).toLocaleString("ru", { minimumFractionDigits: 2 })} ₽</p>
            </div>
            <button
              onClick={handleTopUp}
              disabled={creatingPayment}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-navy hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {creatingPayment ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {creatingPayment ? "Создание платежа..." : "Пополнить"}
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Что включено в бесплатный план */}
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
          <button
            className="w-full rounded-xl bg-primary py-3 text-sm font-semibold text-navy hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            Пополнить на {topUpAmount} ₽
            <ArrowUpRight className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2 mt-3 text-xs text-muted-foreground/70">
            <Shield className="h-3 w-3" />
            Безопасная оплата через ЮKassa
          </div>
        </CardContent>
      </Card>

      {/* Банковские карты */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-muted-foreground" />
              <h2 className="font-semibold">Банковские карты</h2>
            </div>
            <button
              onClick={() => setShowCardForm(!showCardForm)}
              className="flex items-center gap-1.5 rounded-lg border border-primary/30 bg-primary/10 px-3 py-1.5 text-xs text-primary hover:bg-primary/20 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Привязать карту
            </button>
          </div>

          {/* Форма привязки карты */}
          {showCardForm && (
            <div className="mb-4 rounded-lg border border-border/30 bg-muted/30 p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-muted-foreground mb-1">Номер карты</label>
                  <input
                    type="text"
                    placeholder="0000 0000 0000 0000"
                    maxLength={19}
                    value={cardForm.number}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "").replace(/(.{4})/g, "$1 ").trim();
                      setCardForm({ ...cardForm, number: v });
                    }}
                    className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">Срок действия</label>
                  <input
                    type="text"
                    placeholder="MM/YY"
                    maxLength={5}
                    value={cardForm.expiry}
                    onChange={(e) => {
                      let v = e.target.value.replace(/\D/g, "");
                      if (v.length >= 2) v = v.slice(0, 2) + "/" + v.slice(2);
                      setCardForm({ ...cardForm, expiry: v });
                    }}
                    className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
                <div>
                  <label className="block text-xs text-muted-foreground mb-1">CVV</label>
                  <input
                    type="password"
                    placeholder="•••"
                    maxLength={3}
                    value={cardForm.cvv}
                    onChange={(e) => setCardForm({ ...cardForm, cvv: e.target.value.replace(/\D/g, "") })}
                    className="w-full rounded-md border border-border/40 bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleLinkCard}
                  className="flex-1 rounded-md bg-primary py-2 text-sm font-medium text-navy hover:bg-primary/90 transition-colors"
                >
                  Привязать
                </button>
                <button
                  onClick={() => { setShowCardForm(false); setCardForm({ number: "", expiry: "", cvv: "" }); }}
                  className="rounded-md border border-border/30 px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Отмена
                </button>
              </div>
            </div>
          )}

          {/* Список карт */}
          {linkedCards.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              <p>Нет привязанных карт</p>
              <p className="text-xs mt-1 text-muted-foreground/70">Привяжите карту для быстрых платежей</p>
            </div>
          ) : (
            <div className="space-y-2">
              {linkedCards.map((card) => (
                <div key={card.id} className="flex items-center justify-between rounded-lg border border-border/20 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-12 items-center justify-center rounded bg-gradient-to-br from-primary/20 to-primary/5">
                      <CreditCard className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{card.brand} •••• {card.last4}</p>
                      <p className="text-xs text-muted-foreground">
                        {String(card.expiryMonth).padStart(2, "0")}/{String(card.expiryYear).slice(-2)}
                        {card.isDefault && <span className="ml-2 text-primary">По умолчанию</span>}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleRemoveCard(card.id)}
                    className="rounded-md p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    title="Удалить карту"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-4 text-xs text-muted-foreground/70">
            <Lock className="h-3 w-3" />
            Карта будет использоваться для быстрых платежей. Данные защищены шифрованием.
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
