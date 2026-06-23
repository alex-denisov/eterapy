export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Clock, History, Sparkles, Users, Wallet } from "lucide-react";
import { CreditPackPurchaseButton } from "@/components/cabinet/credit-pack-purchase-button";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { auth } from "@/lib/auth";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { creditsWord, getCreditWalletSnapshot } from "@/lib/credit-wallet";
import db from "@/lib/db";
import { getProductCreditCost, getProductPriceKopecks, getSubscriptionPlan, listUserEntitlements } from "@/lib/entitlements";
import { v5Products } from "@/lib/v5-products";
import { formatSessionFloor } from "@/lib/session-pricing";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";

// B349 / Механика 2: /wallet and /credits used to be two near-identical pages.
// They are now merged into this single "Кошелёк" page: balance + срок-разбивка +
// пополнение пакетами (top-up) AND the spend catalog (открыть продукты за
// баллы). `/credits` redirects here, and the nav shows one item.

type CreditWalletSnapshot = Awaited<ReturnType<typeof getCreditWalletSnapshot>>;
type WalletPack = CreditWalletSnapshot["packs"][number];
type WalletBreakdownItem = CreditWalletSnapshot["breakdown"][number];
type WalletHistoryItem = CreditWalletSnapshot["history"][number];

function daysUntil(date: Date, now: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

function WalletBalanceHeader({ balance }: { balance: number }) {
  return (
    <section className="mb-5 grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div>
        <p className="soft-eyebrow">кошелёк кабинета</p>
        <h1 className="soft-h1 mt-2">Кошелёк баллов</h1>
        <p className="soft-lede mt-3 max-w-3xl">
          Здесь видно, сколько баллов доступно сейчас, какие начисления сгорают
          раньше, какие пакеты можно докупить и на что потратить баллы.
        </p>
      </div>
      <div className="soft-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[var(--soft-apricot)] text-[var(--soft-bordeaux)]">
            <Wallet className="size-5" aria-hidden="true" />
          </span>
          <div>
            <p className="soft-eyebrow">доступно</p>
            <p className="font-heading text-4xl font-semibold text-[var(--soft-bordeaux)]">
              {balance}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function WalletBreakdown({ items }: { items: WalletBreakdownItem[] }) {
  return (
    <section className="soft-card p-5" data-testid="wallet-breakdown">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <h2 className="soft-h3">Разбивка по срокам</h2>
      </div>
      <div className="mt-4 grid gap-3">
        {items.length === 0 ? (
          <p className="text-sm text-[var(--soft-ink-soft)]">Активных начислений пока нет.</p>
        ) : items.map((item) => (
          <div key={item.key} className="flex items-center justify-between gap-4 rounded-[var(--soft-radius-md)] border border-[var(--soft-paper-edge)] px-4 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-[var(--soft-ink)]">{item.pointTypeLabel}</p>
              <p className="text-xs text-[var(--soft-ink-soft)]">{item.label}</p>
              <p className="text-xs text-[var(--soft-ink-faint)]">{item.expiryLabel} · {item.expiryRuleLabel}</p>
            </div>
            <span className={item.amount >= 0 ? "soft-badge soft-badge-warm shrink-0" : "soft-badge shrink-0"}>
              {item.amount > 0 ? "+" : ""}{item.amount}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SubscriptionCreditsCallout() {
  return (
    <section className="soft-card p-5">
      <p className="soft-eyebrow">подписка</p>
      <h2 className="soft-h3 mt-2">Plus и Premium пополняют кошелёк каждый месяц</h2>
      <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
        Пакеты удобны для разовой дозаправки. Если баллы нужны регулярно, подписка
        даёт месячный кошелёк и открывает якорные форматы без списания.
      </p>
      <p className="mt-2 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        Подписочные баллы сгорают в конце оплаченного периода. Купленные баллы действуют 12 месяцев с даты покупки.
      </p>
      <Link href={appUrl("/billing")} className="soft-button soft-button-ghost mt-5">
        Выбрать подписку
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

function CreditPacksGrid({ packs }: { packs: WalletPack[] }) {
  return (
    <section className="mt-6" id="wallet-topup">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="soft-eyebrow">пакеты баллов</p>
          <h2 className="soft-h2 mt-1">Дозаправить кошелёк</h2>
        </div>
        <p className="max-w-md text-sm text-[var(--soft-ink-soft)]">
          Купленные баллы действуют 12 месяцев с даты покупки. Ими можно открыть цифровые продукты, но не живые сессии.
        </p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {packs.map((pack) => (
          <article key={pack.key} className="soft-card flex flex-col p-5" data-testid={`wallet-pack-${pack.credits}`}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="soft-eyebrow">пакет</p>
                <h3 className="soft-h3 mt-2">{pack.label}</h3>
              </div>
              {pack.badge && <span className="soft-badge soft-badge-warm shrink-0">{pack.badge}</span>}
            </div>
            <p className="mt-4 font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">
              {pack.amountRub} ₽
            </p>
            <p className="mt-1 text-sm text-[var(--soft-ink-faint)]">
              {pack.pricePerCreditRub} ₽ за балл
            </p>
            <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              +{pack.credits} {creditsWord(pack.credits)} на продукты каталога.
            </p>
            <CreditPackPurchaseButton creditPackKey={pack.key} credits={pack.credits} />
          </article>
        ))}
      </div>
    </section>
  );
}

function WalletHistory({ items }: { items: WalletHistoryItem[] }) {
  return (
    <section className="soft-card p-5" data-testid="wallet-history">
      <div className="flex items-center gap-2">
        <History className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <h2 className="soft-h3">История операций</h2>
      </div>
      <div className="mt-3 divide-y divide-[var(--soft-paper-edge)]">
        {items.length === 0 ? (
          <p className="py-4 text-sm text-[var(--soft-ink-soft)]">Операций пока нет.</p>
        ) : items.map((entry) => (
          <div key={entry.id} className="flex items-center justify-between gap-4 py-3 text-sm">
            <div className="min-w-0">
              <p className="font-medium text-[var(--soft-ink)]">{entry.typeLabel}</p>
              <p className="text-xs text-[var(--soft-ink-faint)]">
                {entry.sourceLabel} · {entry.createdAt.toLocaleDateString("ru-RU")}
              </p>
            </div>
            <span className={entry.amount >= 0 ? "text-[var(--soft-terracotta-dark)]" : "text-[var(--soft-bordeaux)]"}>
              {entry.amount > 0 ? "+" : ""}{entry.amount}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export default async function CabinetWalletPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  guardClientCabinet(session.user.role);
  const userId = session.user.id;
  const now = new Date();

  const [wallet, welcomeGrant, access] = await Promise.all([
    getCreditWalletSnapshot(userId),
    db.clarityCreditLedgerEntry.findFirst({
      where: { userId, source: "welcome", type: "grant", status: "confirmed", expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select: { expiresAt: true },
    }),
    listUserEntitlements(userId),
  ]);

  const activeProducts = new Set(access.entitlements.filter((item) => item.active).map((item) => item.productKey));
  const activeSubscriptions = access.subscriptions.filter((item) => item.active);
  const subscriptionProducts = new Set<string>();
  for (const subscription of activeSubscriptions) {
    const plan = getSubscriptionPlan(subscription.planKey);
    plan?.includedProducts.forEach((key) => subscriptionProducts.add(key));
  }

  const creditProducts = v5Products
    .map((product) => ({
      product,
      creditCost: product.productKey ? getProductCreditCost(product.productKey) : null,
      priceKopecks: product.productKey ? getProductPriceKopecks(product.productKey) : null,
    }))
    .filter((item) => item.product.productKey && item.creditCost);

  return (
    <main className="max-w-6xl px-4 py-8 sm:px-6" data-testid="cabinet-wallet-page" style={{ paddingBottom: 80 }}>
      <WalletBalanceHeader balance={wallet.balance} />

      {welcomeGrant?.expiresAt && (
        <section className="mb-5 soft-card border-[var(--soft-terracotta)]/30 bg-[var(--soft-surface)] p-5" data-testid="welcome-credits-card">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="soft-eyebrow">стартовый подарок</p>
              <h2 className="soft-h3 mt-2">3 приветственных балла на первые разборы</h2>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                Они действуют ещё {daysUntil(welcomeGrant.expiresAt, now)} дн. Этого хватит,
                чтобы открыть «Переосмысление» и попробовать один следующий формат за баллы.
              </p>
            </div>
            <Link
              href={appUrl("/products/reframe")}
              className="soft-button soft-button-primary shrink-0 self-start sm:self-center"
              data-analytics-event="welcome_credits_open_reframe_clicked"
              data-analytics-surface="cabinet_wallet"
              data-analytics-target="/products/reframe"
              data-analytics-product="reframe"
            >
              Переосмыслить ситуацию
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <WalletBreakdown items={wallet.breakdown} />
        <SubscriptionCreditsCallout />
      </section>

      <CreditPacksGrid packs={wallet.packs} />

      {/* Spend catalog (merged from the former /credits page) */}
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
            <span className="soft-badge shrink-0 whitespace-nowrap">{formatSessionFloor()}</span>
          </div>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Разбор с проверенным практиком — таролог, астролог или психолог. Подберите специалиста и удобное время.
          </p>
          <Link href={mainUrl("/practitioners")} className="soft-button soft-button-primary mt-5 self-start">
            <Users className="size-4" aria-hidden="true" />
            Выбрать специалиста
          </Link>
        </article>
        <article className="soft-card flex flex-col p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="soft-eyebrow">подписка</p>
              <h3 className="soft-h3 mt-2">Больше баллов каждый месяц</h3>
            </div>
            <span className="soft-badge shrink-0 whitespace-nowrap">от 12 баллов/мес</span>
          </div>
          <p className="mt-3 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Подписка Plus и Premium пополняет баланс баллов каждый месяц и открывает
            включённые цифровые продукты. Подбор тарифа — на странице подписки.
          </p>
          <Link href={appUrl("/billing")} className="soft-button soft-button-ghost mt-5 self-start">
            <Wallet className="size-4" aria-hidden="true" />
            Выбрать подписку
          </Link>
        </article>
      </section>

      <div id="credits-products" className="mb-3 mt-2 flex flex-wrap items-end justify-between gap-2 scroll-mt-24">
        <div>
          <p className="soft-eyebrow">углубления и форматы</p>
          <h2 className="soft-h2 mt-1">Откройте больше форматов</h2>
        </div>
        <p className="max-w-md text-sm text-[var(--soft-ink-soft)]">
          Спишите баллы или оплатите картой. Продукты из вашего тарифа открыты сразу.
        </p>
      </div>
      <section className="grid gap-4 lg:grid-cols-2">
        {creditProducts.map(({ product, creditCost, priceKopecks }) => {
          const productKey = product.productKey!;
          const includedInPlan = subscriptionProducts.has(productKey);
          const unlocked = activeProducts.has(productKey) || includedInPlan;
          const priceRub = priceKopecks ? Math.round(priceKopecks / 100).toLocaleString("ru-RU") : null;
          const creditLine = creditCost ? `или −${creditCost} ${creditsWord(creditCost)}` : null;
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
                      label="Открыть за баллы"
                      checkoutSource={`cabinet-wallet-${product.slug}`}
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

      <section className="mt-6">
        <WalletHistory items={wallet.history} />
      </section>

      <div className="mt-3 flex items-center gap-2 text-sm text-[var(--soft-ink-soft)]">
        <CheckCircle2 className="size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        Если баллов не хватает — пополните кошелёк выше или оплатите продукт картой.
      </div>
    </main>
  );
}
