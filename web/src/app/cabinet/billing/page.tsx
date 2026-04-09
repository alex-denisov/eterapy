"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Wallet, Plus, ArrowUpRight, Clock, Shield } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const FEATURES = [
  "3 бесплатных сессии в месяц",
  "Доступ ко всем направлениям",
  "Без привязки карты",
];

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [topUpAmount, setTopUpAmount] = useState(500);

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
              <p className="font-heading text-4xl font-bold text-primary">0 ₽</p>
            </div>
            <button
              onClick={() => router.push("/cabinet/billing/top-up")}
              className="flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-navy hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Пополнить
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

      {/* История операций — заглушка */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold">История операций</h2>
          </div>
          <div className="text-center py-8 text-muted-foreground text-sm">
            <p>Операций пока нет</p>
            <p className="text-xs mt-1 text-muted-foreground/70">Здесь будут отображаться ваши платежи и списания</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
