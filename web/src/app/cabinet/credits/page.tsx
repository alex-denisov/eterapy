export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Sparkles, Users, Wallet } from "lucide-react";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { auth } from "@/lib/auth";
import { getClarityCreditBalance } from "@/lib/clarity-credits";
import db from "@/lib/db";
import { getProductCreditCost, getProductPriceKopecks, getSubscriptionPlan, listUserEntitlements } from "@/lib/entitlements";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";
import { guardClientCabinet } from "@/lib/cabinet-access";
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

// Russian plural for "кредит" (1 кредит · 2–4 кредита · 5+ кредитов).
function creditsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "кредит";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return "кредита";
  return "кредитов";
}

export default async function CabinetCreditsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  guardClientCabinet(session.user.role); // Y6: client-only surface
  const userId = session.user.id;

  const [balance, ledger, access, userRow] = await Promise.all([
    getClarityCreditBalance(userId),
    db.clarityCreditLedgerEntry.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, amount: true, balanceAfter: true, type: true, source: true, status: true, createdAt: true },
    }),
    listUserEntitlements(userId),
    db.user.findUnique({ where: { id: userId }, select: { balance: true } }),
  ]);
  const activeProducts = new Set(access.entitlements.filter((item) => item.active).map((item) => item.productKey));
  // W10: a funded RUB balance makes the "пополнить баланс" CTA irrelevant — show
  // a "spend it now" prompt instead, and only surface top-up when it's low.
  const rubBalance = Math.round((userRow?.balance ?? 0) / 100);

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

  // G13: each digital product carries both a кредит cost and a ₽ price so the
  // page can upsell paid products to subscribers (show the ruble price, not
  // just "входит в подписку").
  const creditProducts = v5Products
    .map((product) => ({
      product,
      creditCost: product.productKey ? getProductCreditCost(product.productKey) : null,
      priceKopecks: product.productKey ? getProductPriceKopecks(product.productKey) : null,
    }))
    .filter((item) => item.product.productKey && item.creditCost);

  return (
    <main className="max-w-6xl px-4 py-8 sm:px-6" data-testid="cabinet-credits-page" style={{ paddingBottom: 80 }}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="soft-eyebrow">баланс кредитов</p>
          <h1 className="soft-h1 mt-2">Кредиты ясности</h1>
          <p className="soft-lede mt-3 max-w-3xl">
            Быстрый способ открыть цифровые продукты — 4 ракурса, отчёты, маршруты и
            символические разборы. Можно списать кредитами или оплатить с рублёвого баланса.
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
          <a href="#credits-products" className="soft-button soft-button-primary mt-5">
            Все продукты
            <ArrowRight className="size-4" aria-hidden="true" />
          </a>
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

      {/* V10: paid recommendations — CTAs that a subscription never covers
          (a live practitioner session + balance top-up), so even subscribers
          always see a clear paid next step, not only "входит в подписку". */}
      <div className="mb-3 mt-2">
        <p className="soft-eyebrow">рекомендуем</p>
        <h2 className="soft-h2 mt-1">Платные форматы и услуги</h2>
      </div>
      <section className="mb-6 grid gap-4 sm:grid-cols-2" data-testid="credits-paid-recommendations">
        <article className="soft-card flex flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="soft-eyebrow">живая сессия</p>
              <h3 className="soft-h3 mt-2">Записаться к специалисту</h3>
            </div>
            <span className="soft-badge shrink-0 whitespace-nowrap">от 1 500 ₽</span>
          </div>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Разбор с проверенным практиком — таролог, астролог или психолог. Подберите специалиста и удобное время.
          </p>
          <Link href={mainUrl("/practitioners")} className="soft-button soft-button-primary mt-5 self-start">
            <Users className="size-4" aria-hidden="true" />
            Выбрать специалиста
          </Link>
        </article>
        {rubBalance > 0 ? (
          <article className="soft-card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="soft-eyebrow">баланс</p>
                <h3 className="soft-h3 mt-2">На балансе {rubBalance.toLocaleString("ru-RU")} ₽</h3>
              </div>
              <span className="soft-badge shrink-0 whitespace-nowrap">готово к оплате</span>
            </div>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Этих средств хватит, чтобы открыть продукты и записаться на сессии без ожидания. Выбирайте формат ниже.
            </p>
            <Link href="#credits-products" className="soft-button soft-button-ghost mt-5 self-start">
              <ArrowRight className="size-4" aria-hidden="true" />
              Открыть продукт
            </Link>
          </article>
        ) : (
          <article className="soft-card flex flex-col p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="soft-eyebrow">баланс</p>
                <h3 className="soft-h3 mt-2">Пополнить и открыть больше</h3>
              </div>
              <span className="soft-badge shrink-0 whitespace-nowrap">картой или с баланса</span>
            </div>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Пополните рублёвый баланс, чтобы оплачивать любые продукты и сессии сразу, без ожидания начисления кредитов.
            </p>
            <Link href={appUrl("/billing")} className="soft-button soft-button-ghost mt-5 self-start">
              <Wallet className="size-4" aria-hidden="true" />
              Пополнить баланс
            </Link>
          </article>
        )}
      </section>

      {/* G13: sell digital products to subscribers — every card shows its real
          ₽ price (and credit equivalent) instead of a generic "входит в
          подписку" label, so a paid subscriber sees exactly what each
          upgrade costs and can buy in one tap. */}
      <div id="credits-products" className="mb-3 mt-2 flex flex-wrap items-end justify-between gap-2 scroll-mt-24">
        <div>
          <p className="soft-eyebrow">углубления и форматы</p>
          <h2 className="soft-h2 mt-1">Откройте больше ясности</h2>
        </div>
        <p className="max-w-md text-sm text-[var(--soft-ink-soft)]">
          Списывайте кредиты или оплачивайте с баланса. Продукты из вашего тарифа открыты сразу.
        </p>
      </div>
      <section className="grid gap-4 lg:grid-cols-2">
        {creditProducts.map(({ product, creditCost, priceKopecks }) => {
          const productKey = product.productKey!;
          const includedInPlan = subscriptionProducts.has(productKey);
          const unlocked = activeProducts.has(productKey) || includedInPlan;
          const priceRub = priceKopecks ? Math.round(priceKopecks / 100).toLocaleString("ru-RU") : null;
          const creditLine = creditCost ? `или −${creditCost} ${creditsWord(creditCost)} ясности` : null;
          // The badge never wraps: subscription/open states keep the warm pill,
          // a purchasable product surfaces its price as the headline number.
          const badge = includedInPlan
            ? { label: "входит в подписку", className: "soft-badge soft-badge-warm" }
            : unlocked
              ? { label: "доступ открыт", className: "soft-badge soft-badge-warm" }
              : { label: priceRub ? `${priceRub} ₽` : `${creditCost} ${creditsWord(creditCost ?? 0)}`, className: "soft-badge" };
          return (
            <article key={product.slug} className="soft-card flex flex-col p-5" data-testid={`credits-product-${product.slug}`}>
              <div className="flex flex-nowrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="soft-eyebrow">{product.eyebrow}</p>
                  <h2 className="soft-h3 mt-2">{product.name}</h2>
                </div>
                <span className={`${badge.className} shrink-0 whitespace-nowrap`} data-testid={`credits-badge-${product.slug}`}>
                  {badge.label}
                </span>
              </div>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{product.summary}</p>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {unlocked ? (
                  <Link href={appUrl(product.route)} className="soft-button soft-button-primary">
                    Перейти к разбору
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <>
                    <ProductPurchaseControls
                      productKey={productKey}
                      label="Открыть с баланса"
                      checkoutSource={`cabinet-credits-${product.slug}`}
                      creditCost={creditCost}
                    />
                    {(priceRub || creditLine) && (
                      <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-[var(--soft-ink-faint)]">
                        <Sparkles className="size-3.5" aria-hidden="true" />
                        {priceRub ? `${priceRub} ₽ ` : ""}{creditLine}
                      </span>
                    )}
                  </>
                )}
                {unlocked && (
                  <span className="inline-flex items-center gap-1 text-xs text-[var(--soft-ink-faint)]">
                    <Sparkles className="size-3.5" aria-hidden="true" />
                    {includedInPlan ? "открыто по подписке" : "доступ уже открыт"}
                  </span>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
