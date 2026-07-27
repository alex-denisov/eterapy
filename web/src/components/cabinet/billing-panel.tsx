"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Loader2 } from "lucide-react";
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


/**
 * B602: страница «Кошелёк» перестроена в четыре ряда по ТЗ владельца, и три
 * блока этой панели встают в РАЗНЫЕ ряды. Поэтому панель рендерит один блок за
 * раз, а не всё сразу.
 *
 * Блока «Карты» больше нет: владелец просил не оставлять заглушку. Он и не мог
 * работать — Robokassa не отдаёт токен карты, привязка снята ещё в INC-084, а
 * на проде в таблице лежат две тестовые записи `MasterCard ···4444` без
 * реального платёжного средства за ними. Удаление карты остаётся в API.
 */
export function BillingPanel({ section = "all" }: { section?: "all" | "plans" | "history" } = {}) {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [creatingPayment, setCreatingPayment] = useState(false);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [ledger, setLedger] = useState<BillingLedgerEntry[]>([]);
  const [subscriptions, setSubscriptions] = useState<BillingSubscription[]>([]);

  const loadData = useCallback(() => {
    if (!session) return;

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

      const [txRes, entRes] = await Promise.all([
        fetch("/api/billing/transactions").then(r => r.json()).catch(() => null),
        fetch("/api/billing/entitlements").then(r => r.json()).catch(() => null),
      ]);
      if (cancelled) return;

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

  async function handleStartSubscription(planKey: string) {
    setCreatingPayment(true);
    try {
      // B602 (красный флаг проекта): здесь стояла ветка «есть сохранённая
      // карта → списать сразу». Один клик по «Оформить картой» уводил деньги
      // без экрана подтверждения суммы. Плюс сами карты — наследие ЮKassa:
      // Robokassa токена карты не отдаёт, списывать по ним нечем. Оформление
      // всегда идёт через страницу оплаты, где видна сумма.
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
            <div key={i} className="soft-card p-5 md:p-6">
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

  const plansBlock = (
      <div>
        {/* Round-5 #9: ONE heading per block — the wallet wrapper eyebrow/h2 and
            the panel's «подписка» eyebrow collapsed into this single line. */}
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="soft-h3">Ваш тариф — {getSubscriptionPlanLabel(activeSub?.planKey)}</h2>
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">{currentSubscriptionStatus}
              {activeSub?.currentPeriodEnd ? ` · ${activeSub.cancelAtPeriodEnd ? "доступ до" : "следующее списание"} ${new Date(activeSub.currentPeriodEnd).toLocaleDateString("ru-RU", { day: "numeric", month: "long" })}` : ""}
            </p>
          </div>
          <Link href={mainUrl("/pricing")} className="soft-button soft-button-ghost" style={{ minHeight: "2.75rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}>
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
                className="soft-card p-5 md:p-6"
                data-testid={plan.key === "free" ? "client-billing-subscription" : `client-billing-plan-${plan.key}`}
                style={isCurrent ? { background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)", border: "1px solid var(--soft-terracotta)" } : undefined}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <div>
                    <div className="soft-eyebrow">{isCurrent ? "ваш тариф" : plan.eyebrow}</div>
                    <div className="soft-h3 mt-2">{plan.name}</div>
                  </div>
                  <div className="shrink-0 text-right">
                    {/* Round-5 #10: цена всегда одной строкой — NBSP перед ₽ + nowrap. */}
                    <div className="whitespace-nowrap" style={{ fontFamily: "var(--font-heading)", fontSize: 24, color: "var(--soft-bordeaux)", fontWeight: 600 }}>{priceRub}{" "}₽</div>
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
  );

  const historyBlock = (
      <div className="soft-card p-5 md:p-6" data-testid="client-billing-history">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="soft-h3">История платежей</h3>
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
  );

  if (section === "plans") return plansBlock;
  if (section === "history") return historyBlock;
  return <div className="space-y-6">{plansBlock}{historyBlock}</div>;
}
