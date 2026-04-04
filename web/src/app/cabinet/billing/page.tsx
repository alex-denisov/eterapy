"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const PLANS = [
  { id: "free",      name: "Бесплатный",  sessions: 3,    price: 0,    current: true },
  { id: "starter",   name: "Стартовый",   sessions: 10,   price: 299,  current: false },
  { id: "standard",  name: "Стандартный", sessions: 30,   price: 699,  current: false, popular: true },
  { id: "unlimited", name: "Безлимитный", sessions: null, price: 1299, current: false },
];

export default function BillingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [savedCard] = useState<null | { last4: string; brand: string }>(null);

  if (status === "loading") return null;
  if (!session) { router.push("/login"); return null; }

  return (
    <div className="px-6 py-8 max-w-2xl">
      <h1 className="font-heading text-2xl font-bold mb-8">Оплата и тарифы</h1>

      {/* Баланс */}
      <Card className="mb-6 border-border/40 bg-card/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Баланс кабинета</p>
              <p className="mt-1 font-heading text-3xl font-bold text-primary">0 ₽</p>
            </div>
            <button
              onClick={() => toast.info("Пополнение баланса будет доступно после подключения платёжной системы")}
              className="rounded-lg border border-primary/30 px-4 py-2 text-sm text-primary hover:bg-primary/10 transition-colors">
              Пополнить
            </button>
          </div>
        </CardContent>
      </Card>

      {/* Привязанная карта */}
      <Card className="mb-6 border-border/40 bg-card/50">
        <CardContent className="p-6">
          <h2 className="font-semibold mb-4">Способ оплаты</h2>
          {savedCard ? (
            <div className="flex items-center justify-between rounded-lg border border-border/40 bg-background/50 px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-2xl">💳</span>
                <div>
                  <p className="text-sm font-medium">{savedCard.brand} ···· {savedCard.last4}</p>
                  <p className="text-xs text-muted-foreground">Основная карта</p>
                </div>
              </div>
              <button className="text-xs text-muted-foreground hover:text-destructive transition-colors">Удалить</button>
            </div>
          ) : (
            <div>
              <p className="text-sm text-muted-foreground mb-3">Карта не привязана. Добавьте карту для быстрой оплаты сессий.</p>
              <button
                onClick={() => toast.info("Привязка карты будет доступна после подключения платёжной системы")}
                className="rounded-lg border border-border/40 px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-primary/40 transition-colors">
                + Добавить карту
              </button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Тарифы */}
      <Card className="border-border/40 bg-card/50">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-semibold">Тариф</h2>
            <Badge variant="secondary" className="bg-primary/10 text-primary">Бесплатный</Badge>
          </div>
          <div className="space-y-3">
            {PLANS.map((plan) => (
              <div key={plan.id}
                className={`flex items-center justify-between rounded-xl border px-4 py-3 transition-colors ${
                  plan.current ? "border-primary/40 bg-primary/5" : "border-border/30 hover:border-primary/20"
                }`}>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{plan.name}</span>
                    {plan.popular && <span className="text-xs text-primary">Популярный</span>}
                    {plan.current && <span className="text-xs text-muted-foreground">Активен</span>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {plan.sessions === null ? "Без ограничений" : `${plan.sessions} сессий в месяц`}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-primary">
                    {plan.price === 0 ? "Бесплатно" : `${plan.price} ₽/мес`}
                  </p>
                  {!plan.current && (
                    <button onClick={() => toast.info("Смена тарифа будет доступна после подключения платёжной системы")}
                      className="mt-1 text-xs text-primary hover:underline">
                      Выбрать
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground/60">
            Система оплаты подключается в ближайшее время.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
