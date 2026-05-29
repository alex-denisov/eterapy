export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Sparkles } from "lucide-react";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { auth } from "@/lib/auth";
import { getClarityCreditBalance } from "@/lib/clarity-credits";
import db from "@/lib/db";
import { getProductCreditCost, getSubscriptionPlan, listUserEntitlements } from "@/lib/entitlements";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { v5Products } from "@/lib/v5-products";

const TYPE_LABELS: Record<string, string> = {
  grant: "Начисление",
  spend: "Списание",
  expire: "Сгорание",
  clawback: "Отмена",
  adjustment: "Коррекция",
};

// Human-readable Russian labels for the credit-ledger `source` field. Without
// this map the page leaked raw enum values ("daily_practice", "subscription")
// straight into the operations feed.
const SOURCE_LABELS: Record<string, string> = {
  daily_practice: "Практика ясности",
  subscription: "Подписка",
  referral: "Реферальная программа",
  circle_invite: "Круг ясности",
  purchase: "Покупка кредитов",
  product: "Открытие продукта",
  mission: "Миссия",
  admin: "Начисление от команды",
};

export default async function CabinetCreditsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const userId = session.user.id;

  const [balance, ledger, access] = await Promise.all([
    getClarityCreditBalance(userId),
    db.clarityCreditLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, amount: true, balanceAfter: true, type: true, source: true, status: true, createdAt: true },
    }),
    listUserEntitlements(userId),
  ]);
  const activeProducts = new Set(access.entitlements.filter((item) => item.active).map((item) => item.productKey));

  // Premium/Plus subscribers get a set of mechanics opened by their plan (docs
  // 13_Prices_Breakdown.md / 15_Financial_Model). Fold those into a single set
  // so a subscribed user sees the same "open" state credits would grant.
  const activeSubscriptions = access.subscriptions.filter((item) => item.active);
  const subscriptionProducts = new Set<string>();
  for (const subscription of activeSubscriptions) {
    const plan = getSubscriptionPlan(subscription.planKey);
    plan?.includedProducts.forEach((key) => subscriptionProducts.add(key));
    if (subscription.planKey === "premium") {
      subscriptionProducts.add("circle");
      subscriptionProducts.add("pair");
    }
  }

  const creditProducts = v5Products
    .map((product) => ({
      product,
      creditCost: product.productKey ? getProductCreditCost(product.productKey) : null,
    }))
    .filter((item) => item.product.productKey && item.creditCost);

  return (
    <main className="max-w-6xl px-4 py-8 sm:px-6" data-testid="cabinet-credits-page" style={{ paddingBottom: 80 }}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="soft-eyebrow">кредиты ясности</p>
          <h1 className="soft-h1 mt-2">Баллы для углублений</h1>
          <p className="soft-lede mt-3 max-w-3xl">
            Кредиты не заменяют рублевый баланс, а дают быстрый способ открыть цифровые продукты:
            4 ракурса, отчеты, маршруты и символические разборы.
          </p>
        </div>
        <div className="soft-card p-5 text-center">
          <p className="soft-eyebrow">доступно</p>
          <p className="mt-2 font-heading text-5xl font-semibold text-[var(--soft-bordeaux)]">{balance}</p>
        </div>
      </div>

      <section className="mb-5 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="soft-card p-5">
          <p className="soft-eyebrow">как использовать</p>
          <div className="mt-4 grid gap-3">
            {[
              "Откройте продукт за кредиты на этой странице или в карточке услуги.",
              "Если кредитов не хватает, можно оплатить с рублевого баланса или картой.",
              "История начислений и списаний остается в личном кабинете.",
            ].map((item) => (
              <p key={item} className="flex items-start gap-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                {item}
              </p>
            ))}
          </div>
          <Link href={appUrl("/products")} className="soft-button soft-button-primary mt-5">
            Все продукты
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <div className="soft-card p-5">
          <p className="soft-eyebrow">последние операции</p>
          <div className="mt-3 divide-y divide-[var(--soft-paper-edge)]">
            {ledger.length === 0 ? (
              <p className="py-4 text-sm text-[var(--soft-ink-soft)]">Операций пока нет.</p>
            ) : ledger.map((entry) => (
              <div key={entry.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-[var(--soft-ink)]">{TYPE_LABELS[entry.type] ?? entry.type}</p>
                  <p className="text-xs text-[var(--soft-ink-faint)]">
                    {SOURCE_LABELS[entry.source] ?? entry.source} · {entry.createdAt.toLocaleDateString("ru-RU")}
                  </p>
                </div>
                <span className={entry.amount >= 0 ? "text-[var(--soft-terracotta-dark)]" : "text-[var(--soft-bordeaux)]"}>
                  {entry.amount > 0 ? "+" : ""}{entry.amount}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {creditProducts.map(({ product, creditCost }) => {
          const productKey = product.productKey!;
          const includedInPlan = subscriptionProducts.has(productKey);
          const unlocked = activeProducts.has(productKey) || includedInPlan;
          const badgeLabel = includedInPlan
            ? "входит в подписку"
            : unlocked
              ? "доступ открыт"
              : `${creditCost} кредита`;
          return (
            <article key={product.slug} className="soft-card p-5" data-testid={`credits-product-${product.slug}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="soft-eyebrow">{product.eyebrow}</p>
                  <h2 className="soft-h3 mt-2">{product.name}</h2>
                </div>
                <span className={unlocked ? "soft-badge soft-badge-warm" : "soft-badge"}>
                  {badgeLabel}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{product.summary}</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {unlocked ? (
                  <Link href={appUrl(product.route)} className="soft-button soft-button-primary">
                    Перейти к разбору
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <ProductPurchaseControls
                    productKey={productKey}
                    label="Открыть с баланса"
                    checkoutSource={`cabinet-credits-${product.slug}`}
                    creditCost={creditCost}
                  />
                )}
                <span className="inline-flex items-center gap-1 text-xs text-[var(--soft-ink-faint)]">
                  <Sparkles className="size-3.5" aria-hidden="true" />
                  {includedInPlan ? "открыто по подписке" : unlocked ? "доступ уже открыт" : "можно списать кредиты"}
                </span>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
