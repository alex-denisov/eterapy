export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock, History, Sparkles, Wallet } from "lucide-react";
import { CreditPackPurchaseButton } from "@/components/cabinet/credit-pack-purchase-button";
import { auth } from "@/lib/auth";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { creditsWord, getCreditWalletSnapshot } from "@/lib/credit-wallet";
import { appUrl, loginUrl } from "@/lib/subdomain";

type CreditWalletSnapshot = Awaited<ReturnType<typeof getCreditWalletSnapshot>>;
type WalletPack = CreditWalletSnapshot["packs"][number];
type WalletBreakdownItem = CreditWalletSnapshot["breakdown"][number];
type WalletHistoryItem = CreditWalletSnapshot["history"][number];

function WalletBalanceHeader({ balance }: { balance: number }) {
  return (
    <section className="mb-5 grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div>
        <p className="soft-eyebrow">кошелёк кабинета</p>
        <h1 className="soft-h1 mt-2">Кошелёк кредитов</h1>
        <p className="soft-lede mt-3 max-w-3xl">
          Здесь видно, сколько кредитов ясности доступно сейчас, какие начисления сгорают
          раньше и какие пакеты можно докупить без подписки.
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
              <p className="text-sm font-medium text-[var(--soft-ink)]">{item.label}</p>
              <p className="text-xs text-[var(--soft-ink-faint)]">{item.expiryLabel}</p>
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
        Пакеты удобны для разовой дозаправки. Если кредиты нужны регулярно, подписка
        даёт месячный кошелёк и открывает якорные форматы без списания.
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
    <section className="mt-6">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="soft-eyebrow">пакеты кредитов</p>
          <h2 className="soft-h2 mt-1">Дозаправить кошелёк</h2>
        </div>
        <p className="max-w-md text-sm text-[var(--soft-ink-soft)]">
          Купленные кредиты не сгорают. Ими можно открыть цифровые продукты, но не живые сессии.
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
              {pack.pricePerCreditRub} ₽ за кредит
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

  const wallet = await getCreditWalletSnapshot(session.user.id);

  return (
    <main className="max-w-6xl px-4 py-8 sm:px-6" data-testid="cabinet-wallet-page" style={{ paddingBottom: 80 }}>
      <WalletBalanceHeader balance={wallet.balance} />

      <section className="grid gap-4 lg:grid-cols-[1fr_0.9fr]">
        <WalletBreakdown items={wallet.breakdown} />
        <SubscriptionCreditsCallout />
      </section>

      <CreditPacksGrid packs={wallet.packs} />

      <section className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="soft-card p-5">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            <h2 className="soft-h3">Где тратить кредиты</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Кредиты списываются на цифровые форматы: 4 ракурса, глубокий отчёт,
            разбор переписки, Таро, карту, круг и маршруты ясности.
          </p>
          <Link href={appUrl("/credits")} className="soft-button soft-button-primary mt-5">
            Открыть каталог
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
        <WalletHistory items={wallet.history} />
      </section>
    </main>
  );
}
