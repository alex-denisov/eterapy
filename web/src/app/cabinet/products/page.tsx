export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CheckCircle2, Wallet } from "lucide-react";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { auth } from "@/lib/auth";
import { getClarityCreditBalance } from "@/lib/clarity-credits";
import db from "@/lib/db";
import { getProductCreditCost, getSubscriptionPlan, listUserEntitlements } from "@/lib/entitlements";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { type V5Product, v5Products } from "@/lib/v5-products";

function money(balanceKopecks: number) {
  return (balanceKopecks / 100).toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function cabinetProductHref(product: V5Product) {
  const href = product.directHref ?? product.route;
  return href.startsWith("http") ? href : appUrl(href);
}

export default async function CabinetProductsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  const userId = session.user.id;

  const [user, clarityCredits, access] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { balance: true } }),
    getClarityCreditBalance(userId),
    listUserEntitlements(userId),
  ]);
  const activeProducts = new Set(access.entitlements.filter((item) => item.active).map((item) => item.productKey));
  const activeSubscriptionProductKeys = new Set(
    access.subscriptions
      .filter((subscription) => subscription.active)
      .flatMap((subscription) => {
        const plan = getSubscriptionPlan(subscription.planKey);
        const included = plan?.includedProducts ?? [];
        return subscription.planKey === "premium" ? [...included, "circle", "pair"] : included;
      }),
  );
  const paidProducts = v5Products.filter((product) => product.productKey);
  const supportProducts = v5Products.filter((product) => !product.productKey);

  return (
    <main className="max-w-6xl px-4 py-8 sm:px-6" data-testid="cabinet-products-page" style={{ paddingBottom: 80 }}>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="soft-eyebrow">продукты</p>
          <h1 className="soft-h1 mt-2">Услуги внутри кабинета</h1>
          <p className="soft-lede mt-3 max-w-3xl">
            Здесь можно открыть углубления, символические разборы и маршруты без возврата на лендинг.
            Баланс, кредиты ясности и карта доступны в одном сценарии.
          </p>
        </div>
        <Link href={appUrl("/checkin")} className="soft-button soft-button-primary">
          Новый бесплатный диалог
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>

      <section className="mb-5 grid gap-4 md:grid-cols-3" aria-label="Баланс и быстрые действия">
        <div className="soft-card p-5">
          <p className="soft-eyebrow">баланс</p>
          <p className="mt-2 font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">{money(user?.balance ?? 0)} ₽</p>
          <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">Можно списать за цифровые продукты и живые сессии.</p>
        </div>
        <div className="soft-card p-5">
          <p className="soft-eyebrow">кредиты ясности</p>
          <p className="mt-2 font-heading text-3xl font-semibold text-[var(--soft-bordeaux)]">{clarityCredits}</p>
          <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">Подходят для углублений, маршрутов и символических форматов.</p>
        </div>
        <div className="soft-card p-5" style={{ background: "var(--soft-paper-deep)" }}>
          <p className="soft-eyebrow">если не хватает средств</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">Пополните баланс или оплатите продукт картой прямо из карточки услуги.</p>
          <Link href={appUrl("/billing")} className="soft-chip mt-4 inline-flex">
            <Wallet className="size-3.5" aria-hidden="true" />
            Пополнить баланс
          </Link>
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        {paidProducts.map((product) => {
          const creditCost = product.productKey ? getProductCreditCost(product.productKey) : null;
          const unlocked = product.productKey
            ? activeProducts.has(product.productKey) || activeSubscriptionProductKeys.has(product.productKey)
            : false;
          const includedBySubscription = product.productKey ? activeSubscriptionProductKeys.has(product.productKey) : false;
          return (
            <article key={product.slug} className="soft-card p-5" data-testid={`cabinet-product-${product.slug}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="soft-eyebrow">{product.eyebrow}</p>
                  <h2 className="soft-h3 mt-2">{product.name}</h2>
                </div>
                <span className={unlocked ? "soft-badge soft-badge-warm" : "soft-badge"}>
                  {unlocked ? (includedBySubscription ? "в подписке" : "доступ открыт") : product.price}
                </span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{product.summary}</p>
              <div className="mt-4 grid gap-2 text-xs text-[var(--soft-ink-soft)] sm:grid-cols-3">
                {product.mechanics.slice(0, 3).map((item) => (
                  <span key={item} className="flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                    {item}
                  </span>
                ))}
              </div>
              <div className="mt-5 rounded-lg border border-[var(--soft-paper-edge)] bg-[color-mix(in_srgb,var(--soft-paper-card)_88%,white)] p-3">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[var(--soft-bordeaux)]">{unlocked ? "Услуга доступна" : "Купить услугу"}</p>
                    <p className="text-xs text-[var(--soft-ink-faint)]">{unlocked ? "Открывайте без повторной оплаты" : product.priceMeta}</p>
                  </div>
                  <Link href={appUrl(product.route)} className="soft-chip">
                    Подробнее
                  </Link>
                </div>
                {product.productKey && !unlocked ? (
                  <ProductPurchaseControls
                    productKey={product.productKey}
                    label="Купить"
                    checkoutSource={`cabinet-products-${product.slug}`}
                    creditCost={creditCost}
                    variant="catalog"
                  />
                ) : (
                  <Link href={appUrl(product.route)} className="soft-button soft-button-primary">
                    Открыть
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </section>

      <section className="mt-6" aria-label="Ритм и живые встречи">
        <div className="mb-3">
          <p className="soft-eyebrow">без покупки цифрового отчёта</p>
          <h2 className="soft-h3 mt-2">Ритм и живые встречи</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {supportProducts.map((product) => (
            <article key={product.slug} id={product.slug} className="soft-card-flat p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="soft-eyebrow">{product.slug === "clarity-practice" ? "ежедневная практика" : "живая встреча"}</p>
                  <h3 className="soft-h3 mt-2">{product.name}</h3>
                </div>
                <span className="soft-badge">{product.price}</span>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{product.summary}</p>
              <Link href={cabinetProductHref(product)} className="soft-button soft-button-primary mt-4 inline-flex">
                {product.directCta ?? product.cta}
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
