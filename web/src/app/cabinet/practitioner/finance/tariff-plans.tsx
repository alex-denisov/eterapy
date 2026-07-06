"use client";

import { useState } from "react";
import { Check, CreditCard, Wallet, X } from "lucide-react";
import { toast } from "sonner";
import type { PractitionerTier } from "@/lib/practitioner-tier";

// B466 — «Тариф» plan cards (client): current plan marked, Pro+ = highlighted
// upgrade with «С баланса» / «Картой» (owner: NO free trial, no savings hint);
// current plan manages cancel-at-period-end; Free = downgrade note.

interface SubscriptionInfo {
  id: string;
  planKey: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}

interface Props {
  tier: PractitionerTier;
  earningsBalanceRub: number;
  subscription: SubscriptionInfo | null;
  prices: { pro: number; proPlus: number };
  aiIncluded: { pro: number; proPlus: number };
}

async function readError(res: Response) {
  const data = await res.json().catch(() => ({}));
  return typeof data?.error === "string" ? data.error : "Не удалось выполнить действие";
}

function Perk({ children, strong }: { children: React.ReactNode; strong?: boolean }) {
  return (
    <li className="flex gap-2 text-sm text-[var(--soft-ink-soft)]">
      <Check className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
      <span>{strong ? <span className="font-medium text-foreground">{children}</span> : children}</span>
    </li>
  );
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
}

export function TariffPlans({ tier, earningsBalanceRub, subscription, prices, aiIncluded }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  async function startFromEarnings(planKey: string, priceRub: number) {
    if (earningsBalanceRub < priceRub) {
      toast.error("Недостаточно средств на балансе для оплаты подписки");
      return;
    }
    setBusy(`earnings:${planKey}`);
    try {
      const res = await fetch("/api/practitioner/subscriptions/start-from-earnings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planKey }),
      });
      if (!res.ok) throw new Error(await readError(res));
      toast.success("Тариф активирован — оплачено с баланса");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось активировать тариф");
      setBusy(null);
    }
  }

  async function startByCard(planKey: string) {
    setBusy(`card:${planKey}`);
    try {
      const res = await fetch("/api/billing/create-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planKey,
          checkoutSource: "practitioner_subscription_card",
          returnPath: "/cabinet/practitioner/finance?tab=tariff",
        }),
      });
      if (!res.ok) throw new Error(await readError(res));
      const data = await res.json();
      if (typeof data.confirmationUrl !== "string") throw new Error("Платёжная ссылка не получена");
      window.location.href = data.confirmationUrl;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть оплату");
      setBusy(null);
    }
  }

  async function cancelAtPeriodEnd() {
    if (!subscription) return;
    setBusy("cancel");
    try {
      const res = await fetch("/api/billing/subscriptions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscriptionId: subscription.id, action: "cancel_at_period_end" }),
      });
      if (!res.ok) throw new Error(await readError(res));
      toast.success("Тариф не продлится после текущего периода");
      window.location.reload();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось отменить продление");
      setBusy(null);
    }
  }

  const periodEnd = fmtDate(subscription?.currentPeriodEnd ?? null);

  const currentBadge = (
    <span className="rounded-full px-2 py-px text-[10px] font-bold tracking-wide" style={{ background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }}>
      ВАШ ТАРИФ · активен
    </span>
  );

  function renderCurrentPlanFooter() {
    if (!subscription) return null;
    return (
      <div className="mt-4 border-t border-[var(--soft-paper-deep)] pt-3 text-xs text-[var(--soft-ink-soft)]">
        {subscription.cancelAtPeriodEnd ? (
          <p>Продление отключено{periodEnd ? ` — тариф действует до ${periodEnd}` : ""}.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p>{periodEnd ? `Продлится ${periodEnd}` : "Продлевается ежемесячно"}</p>
            {!manageOpen ? (
              <button type="button" className="soft-chip" onClick={() => setManageOpen(true)}>
                Управлять
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="soft-chip"
                  disabled={busy !== null}
                  onClick={cancelAtPeriodEnd}
                  data-testid="practitioner-tariff-cancel"
                >
                  <X className="mr-1 inline size-3" aria-hidden="true" />
                  Не продлевать
                </button>
                <button type="button" className="soft-chip" onClick={() => setManageOpen(false)}>
                  Закрыть
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function renderPayButtons({ planKey, priceRub, primary }: { planKey: string; priceRub: number; primary?: boolean }) {
    return (
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className={`soft-button ${primary ? "soft-button-primary" : "soft-button-ghost"}`}
          style={{ minHeight: "2.2rem", padding: "0.45rem 0.95rem", fontSize: "0.8125rem" }}
          disabled={busy !== null}
          onClick={() => startFromEarnings(planKey, priceRub)}
          data-testid="practitioner-subscribe-cta"
        >
          <Wallet className="size-3.5" aria-hidden="true" />
          С баланса
        </button>
        <button
          type="button"
          className="soft-button soft-button-ghost"
          style={{ minHeight: "2.2rem", padding: "0.45rem 0.95rem", fontSize: "0.8125rem" }}
          disabled={busy !== null}
          onClick={() => startByCard(planKey)}
        >
          <CreditCard className="size-3.5" aria-hidden="true" />
          Картой
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="practitioner-tariff-plans">
      {/* Free */}
      <section className="soft-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="soft-h3">Базовый</h3>
            <p className="mt-0.5 text-sm text-[var(--soft-ink-faint)]">0 ₽ · без подписки</p>
          </div>
          {tier === "free" && currentBadge}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="soft-chip">Комиссия 35%</span>
          <span className="soft-chip">свои 20%</span>
        </div>
        <ul className="mt-3 grid gap-1.5">
          <Perk>Профиль, бронь, оплата, видео-сессии</Perk>
          <Perk>Расшифровка сессий + комплаенс</Perk>
        </ul>
        <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">AI-заметки и план сопровождения — недоступны</p>
        {tier !== "free" && subscription && !subscription.cancelAtPeriodEnd && (
          <p className="mt-3 text-xs text-[var(--soft-ink-faint)]">
            Переход на Базовый = отключить продление текущего тарифа (кнопка «Управлять» ниже).
          </p>
        )}
      </section>

      {/* Pro */}
      <section className="soft-card p-4 sm:p-5" data-testid="practitioner-plan-pro">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="soft-h3">Pro</h3>
            <p className="mt-0.5 text-sm text-[var(--soft-ink-faint)]">
              <span className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">{prices.pro.toLocaleString("ru")} ₽</span> / месяц
            </p>
          </div>
          {tier === "pro" && currentBadge}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="soft-chip">Комиссия 30%</span>
          <span className="soft-chip">свои 17%</span>
          <span className="soft-chip">хранение 30 дн</span>
        </div>
        <p className="mt-3 text-xs font-medium text-[var(--soft-ink-soft)]">Всё из Базового, плюс:</p>
        <ul className="mt-1.5 grid gap-1.5">
          <Perk strong>{aiIncluded.pro} AI-разборов/мес</Perk>
          <Perk>Транскрипт, резюме, заметки, сообщение клиенту (докупка пакетами при нехватке)</Perk>
          <Perk>1 шаблон заметок под ваше направление · подсказка к плану сопровождения</Perk>
          <Perk>Аналитика по сессии · экспорт PDF одной сессии</Perk>
        </ul>
        {tier === "pro" ? (
          renderCurrentPlanFooter()
        ) : tier === "free" ? (
          renderPayButtons({ planKey: "practitioner_pro", priceRub: prices.pro })
        ) : null}
      </section>

      {/* Pro+ */}
      <section
        className="relative overflow-hidden rounded-[18px] border-2 p-4 sm:p-5"
        style={{ borderColor: "var(--soft-terracotta)", background: "var(--soft-paper-card)" }}
        data-testid="practitioner-plan-pro-plus"
      >
        {tier !== "pro_plus" && (
          <span
            className="absolute right-0 top-0 rounded-bl-[12px] px-2.5 py-1 text-[10px] font-bold tracking-wide text-[#FBF1E4]"
            style={{ background: "var(--soft-terracotta)" }}
          >
            РЕКОМЕНДУЕМ · АПГРЕЙД
          </span>
        )}
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="soft-h3">Pro+</h3>
            <p className="mt-0.5 text-sm text-[var(--soft-ink-faint)]">
              <span className="font-heading text-xl font-semibold text-[var(--soft-bordeaux)]">{prices.proPlus.toLocaleString("ru")} ₽</span> / месяц
            </p>
          </div>
          {tier === "pro_plus" && currentBadge}
        </div>
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="soft-chip">Комиссия 25%</span>
          <span className="soft-chip">свои 14%</span>
          <span className="soft-chip">хранение 90 дн</span>
        </div>
        <p className="mt-3 text-xs font-medium text-[var(--soft-ink-soft)]">Всё из Pro, плюс:</p>
        <ul className="mt-1.5 grid gap-1.5">
          <Perk strong>{aiIncluded.proPlus} AI-разборов/мес вместо {aiIncluded.pro}</Perk>
          <Perk>Шаблоны заметок под ваше направление (SOAP/DAP, GROW…) + свой</Perk>
          <Perk>Живой план сопровождения · дашборд прогресса клиента</Perk>
          <Perk>Массовый экспорт PDF / DOCX</Perk>
          <Perk>Приоритет в каталоге + бейдж Pro+</Perk>
        </ul>
        {tier === "pro_plus" ? (
          renderCurrentPlanFooter()
        ) : (
          renderPayButtons({ planKey: "practitioner_pro_plus", priceRub: prices.proPlus, primary: true })
        )}
      </section>
    </div>
  );
}
