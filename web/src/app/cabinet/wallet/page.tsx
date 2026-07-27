export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, Clock, History } from "lucide-react";
import { CreditPackPurchaseButton } from "@/components/cabinet/credit-pack-purchase-button";
import { BillingPanel } from "@/components/cabinet/billing-panel";
import { RevealList } from "@/components/cabinet/reveal-list";
import { WalletHistoryTabs } from "@/components/cabinet/wallet-history-tabs";
import { auth } from "@/lib/auth";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { getCreditWalletSnapshot } from "@/lib/credit-wallet";
import db from "@/lib/db";
import { appUrl, loginUrl, mainUrl } from "@/lib/subdomain";

// B349 / Механика 2: /wallet and /credits merged into the single «Кошелёк».
//
// B602 (владелец 2026-07-27, ТЗ п. 9.6) — страница перестроена в четыре ряда:
//   ряд 1 — «Ваш тариф»
//   ряд 2 — «Доступно» + «на что потратить баллы» + компактная разбивка сроков
//   ряд 3 — «Пакеты баллов · Дозаправить кошелёк»
//   ряд 4 — «История операций» (платежи и баллы в одном блоке)
// Блок «Карты» удалён целиком — владелец: «убери, а не оставляй заглушку».
// Тринадцать карточек до перестройки, пять одновременных предложений купить.

type CreditWalletSnapshot = Awaited<ReturnType<typeof getCreditWalletSnapshot>>;
type WalletPack = CreditWalletSnapshot["packs"][number];
type WalletBreakdownItem = CreditWalletSnapshot["breakdown"][number];
type WalletHistoryItem = CreditWalletSnapshot["history"][number];

function daysUntil(date: Date, now: Date): number {
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
}

// Russian pluralisation for «балл / балла / баллов».
function pointsWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "балл";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "балла";
  return "баллов";
}

/**
 * Ряд 2, левая карточка: «Доступно».
 *
 * Стартовый подарок больше не отдельная карточка — он схлопнут в янтарную
 * строку внутри баланса. Отдельной карточкой он раздувал первый экран ровно у
 * того, кому важнее всего понять структуру страницы, — у нового человека.
 */
function WalletAvailable({
  balance,
  welcomeExpiresAt,
  now,
}: {
  balance: number;
  welcomeExpiresAt: Date | null;
  now: Date;
}) {
  return (
    <section
      className="soft-card flex h-full flex-col p-5"
      data-testid="wallet-balance-header"
      style={{ background: "linear-gradient(155deg, #FFFCF5, var(--soft-apricot))", border: "1px solid transparent" }}
    >
      <h1 className="sr-only">Кошелёк баллов</h1>
      <p className="soft-eyebrow">доступно</p>
      <p className="mt-1.5 font-heading font-medium leading-none text-[var(--soft-bordeaux)]">
        <span style={{ fontSize: "clamp(2rem, 6vw, 2.5rem)" }}>{balance}</span>
        <span className="ml-1.5 text-base font-normal text-[var(--soft-ink-soft)]">{pointsWord(balance)}</span>
      </p>
      {/* B512 §3.6 — честно: форматы стоят по-разному, прежняя формула
          «один балл — один разбор» была неправдой. */}
      <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
        Баллами открываются цифровые разборы · стоимость зависит от формата
      </p>
      {welcomeExpiresAt && (
        <p
          className="mt-3 flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-[10px] px-2.5 py-2 text-[12px]"
          data-testid="welcome-credits-card"
          style={{ background: "var(--soft-amber-bg, #F2E2C2)", color: "var(--soft-amber-ink, #6E5114)" }}
        >
          <span>Стартовый подарок: 3 балла, ещё {daysUntil(welcomeExpiresAt, now)} дн.</span>
          <Link
            href={appUrl("/products/reframe")}
            className="font-semibold underline underline-offset-2"
            data-analytics-event="welcome_credits_open_reframe_clicked"
            data-analytics-surface="cabinet_wallet"
            data-analytics-target="/products/reframe"
            data-analytics-product="reframe"
          >
            Переосмыслить ситуацию →
          </Link>
        </p>
      )}
      <div className="mt-auto pt-4">
        <Link href="#wallet-topup" className="soft-button soft-button-primary w-fit shrink-0">
          Пополнить кошелёк
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

/** Ряд 2, средняя карточка: мост в каталог. */
function WalletSpendBridge() {
  return (
    <section
      className="soft-card flex h-full flex-col p-5"
      data-testid="wallet-spend-bridge"
      style={{ background: "linear-gradient(155deg, #FBF8FE 0%, var(--soft-lilac-bg, #EFEAF6) 100%)", border: "1px solid rgba(168,155,201,0.28)" }}
    >
      <p className="soft-eyebrow" style={{ color: "#6E5BA6" }}>на что потратить баллы</p>
      <p className="mt-1 text-sm" style={{ color: "#43356E" }}>
        Все разборы и форматы — в каталоге. Баллы спишутся при открытии.
      </p>
      <div className="mt-auto pt-4">
        <Link href={mainUrl("/products")} className="soft-button w-fit shrink-0" style={{ background: "var(--soft-lilac, #A89BC9)", color: "#fff", fontSize: 13 }}>
          Открыть каталог
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}

/**
 * Ряд 2, правая карточка: «Разбивка по срокам» — владелец просил «очень
 * компактно».
 *
 * Компактность не должна съесть сам срок сгорания: ближайший виден всегда,
 * первой строкой. Прятать сгорание под «показать ещё» — это то, за что потом
 * приходят претензии.
 */
function WalletBreakdown({ items }: { items: WalletBreakdownItem[] }) {
  const soonest = items.find((item) => item.expiresAt) ?? null;
  return (
    <section className="soft-card flex h-full flex-col p-5" data-testid="wallet-breakdown">
      <div className="flex items-center gap-2">
        <Clock className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <h2 className="soft-h3">Разбивка по срокам</h2>
      </div>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">Активных начислений пока нет.</p>
      ) : (
        <>
          {soonest && (
            <p className="mt-2 text-[12.5px] font-semibold" style={{ color: "var(--soft-bordeaux)" }}>
              Ближайшее сгорание: {soonest.amount} — {soonest.expiryLabel}
            </p>
          )}
          <RevealList initial={3} step={5} className="mt-2 divide-y divide-[var(--soft-paper-edge)]" moreLabel="Показать все">
            {items.map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-3 py-2 text-[12.5px]">
                <span className="min-w-0">
                  <span className="block truncate text-[var(--soft-ink)]">{item.pointTypeLabel}</span>
                  <span className="block truncate text-[11px] text-[var(--soft-ink-faint)]">{item.expiryLabel}</span>
                </span>
                <span className="shrink-0 tabular-nums" style={{ color: item.amount >= 0 ? "var(--soft-terracotta-dark)" : "var(--soft-bordeaux)" }}>
                  {item.amount > 0 ? "+" : ""}{item.amount}
                </span>
              </div>
            ))}
          </RevealList>
        </>
      )}
    </section>
  );
}

function CreditPacksGrid({ packs }: { packs: WalletPack[] }) {
  return (
    <section className="mt-4" id="wallet-topup">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="soft-eyebrow">пакеты баллов</p>
          <h2 className="soft-h3 mt-1">Дозаправить кошелёк</h2>
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
            <p className="mt-1 flex-1 text-sm text-[var(--soft-ink-faint)]">
              {pack.pricePerCreditRub} ₽ за балл
            </p>
            <CreditPackPurchaseButton creditPackKey={pack.key} credits={pack.credits} />
          </article>
        ))}
      </div>
    </section>
  );
}

/** Список операций с баллами — вкладка «Баллы» объединённой истории. */
function WalletCreditHistory({ items }: { items: WalletHistoryItem[] }) {
  if (items.length === 0) {
    return <p className="py-4 text-sm text-[var(--soft-ink-soft)]">Операций с баллами пока нет.</p>;
  }
  return (
    <RevealList initial={4} step={4} className="divide-y divide-[var(--soft-paper-edge)]" moreLabel="Показать ещё">
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
      {/* ═══════ РЯД 1 — «Ваш тариф» ═══════ */}
      <section data-testid="wallet-billing" data-testid-row="1">
        <BillingPanel section="plans" />
      </section>

      {/* ═══════ РЯД 2 — доступно · на что потратить · разбивка по срокам ═══ */}
      <div className="mt-4 grid gap-4 lg:grid-cols-3" data-testid="wallet-row-2">
        <WalletAvailable balance={wallet.balance} welcomeExpiresAt={welcomeGrant?.expiresAt ?? null} now={now} />
        <WalletSpendBridge />
        <WalletBreakdown items={wallet.breakdown} />
      </div>

      {/* ═══════ РЯД 3 — пакеты баллов ═══════ */}
      <CreditPacksGrid packs={wallet.packs} />

      {/* ═══════ РЯД 4 — «История операций» ═══════
          Владелец просил ОДИН блок. Плоским списком нельзя: покупка пакета
          пишет две записи в разные таблицы — рублёвую и балльную, — и общий
          список показал бы каждую покупку дважды («+790 ₽» и «+5 баллов»).
          Поэтому один блок с двумя вкладками. */}
      <section className="soft-card mt-4 p-5 md:p-6" data-testid="wallet-history">
        <div className="mb-3 flex items-center gap-2">
          <History className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <h2 className="soft-h3">История операций</h2>
        </div>
        <WalletHistoryTabs
          credits={<WalletCreditHistory items={wallet.history} />}
          money={<BillingPanel section="history" />}
        />
      </section>
    </main>
  );
}
