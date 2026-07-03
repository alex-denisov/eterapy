export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock, History, Wallet } from "lucide-react";
import { CreditPackPurchaseButton } from "@/components/cabinet/credit-pack-purchase-button";
import { BillingPanel } from "@/components/cabinet/billing-panel";
import { RevealList } from "@/components/cabinet/reveal-list";
import { auth } from "@/lib/auth";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { creditsWord, getCreditWalletSnapshot } from "@/lib/credit-wallet";
import db from "@/lib/db";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";

// B349 / Механика 2: /wallet and /credits merged into the single «Кошелёк».
// B464 round-4 #13: the money hub per the approved blueprint — Баланс →
// подарок → Разбивка → Пакеты → Подписка/Карты → История. The spend CATALOG
// lives on the landing «Услуги» (round-2 #6) — only a slim bridge link here.

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

// B464 round-4 #13: history rows follow the owner's «recent 4 + показать ещё»
// pattern — no endless scroll of ledger rows.
function WalletHistory({ items }: { items: WalletHistoryItem[] }) {
  return (
    <section className="soft-card p-5" data-testid="wallet-history">
      <div className="flex items-center gap-2">
        <History className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <h2 className="soft-h3">История операций с баллами</h2>
      </div>
      {items.length === 0 ? (
        <p className="py-4 text-sm text-[var(--soft-ink-soft)]">Операций пока нет.</p>
      ) : (
        <RevealList initial={4} step={4} className="mt-3 divide-y divide-[var(--soft-paper-edge)]" moreLabel="Показать ещё">
          {items.map((entry) => (
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
        </RevealList>
      )}
    </section>
  );
}

export default async function CabinetWalletPage() {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  guardClientCabinet(session.user.role);
  const userId = session.user.id;
  const now = new Date();

  const [wallet, welcomeGrant] = await Promise.all([
    getCreditWalletSnapshot(userId),
    db.clarityCreditLedgerEntry.findFirst({
      where: { userId, source: "welcome", type: "grant", status: "confirmed", expiresAt: { gt: now } },
      orderBy: { createdAt: "desc" },
      select: { expiresAt: true },
    }),
  ]);

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

      <WalletBreakdown items={wallet.breakdown} />

      {/* Slim spend-bridge: the catalog itself lives on the landing «Услуги»
          (round-2 #6) — the wallet only points there, no duplicated grid. */}
      <section className="soft-card mt-5 flex flex-wrap items-center justify-between gap-3 p-5" data-testid="wallet-spend-bridge">
        <div className="min-w-0">
          <p className="soft-eyebrow">на что потратить баллы</p>
          <p className="mt-1 text-sm" style={{ color: "var(--soft-ink-soft)" }}>
            Все разборы и форматы — в каталоге услуг. Баллы спишутся при открытии.
          </p>
        </div>
        <Link href={mainUrl("/products")} className="soft-button soft-button-primary shrink-0">
          Открыть каталог услуг
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>

      <CreditPacksGrid packs={wallet.packs} />

      {/* B464 IB3 — subscription + saved cards + payment history, merged from the
          retired «Подписка и оплата» page (/billing → /wallet). */}
      <section className="mt-8" data-testid="wallet-billing">
        <div className="mb-3">
          <p className="soft-eyebrow">подписка и платежи</p>
          <h2 className="soft-h2 mt-1">Подписка и карты</h2>
          <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">
            Подписочные баллы сгорают в конце оплаченного периода. Купленные пакеты действуют 12 месяцев.
          </p>
        </div>
        <BillingPanel />
      </section>

      <section className="mt-6">
        <WalletHistory items={wallet.history} />
      </section>
    </main>
  );
}
