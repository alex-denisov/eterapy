"use client";

import { Check, CreditCard, Minus, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PractitionerTier } from "@/lib/practitioner-tier";
import { planNameOf, useTariffPlanActions, type TariffSubscriptionInfo } from "./use-tariff-plan-actions";

// B466 R9-4 P4 — мобильные карточки тарифа 1-в-1 по mockup -finance-tariff:
// планы Free/Pro/Pro+ (.pcab-plan / .current / .upsell), cstrip, фичи, кнопки
// «С баланса»/«Картой». Перки — актуальные (owner R9-5 убрал обещания экспорта
// документов; макет их ещё показывает — следуем бэку). Логика — общий хук.

interface Props {
  tier: PractitionerTier;
  earningsBalanceRub: number;
  subscription: TariffSubscriptionInfo | null;
  prices: { pro: number; proPlus: number };
  aiIncluded: { pro: number; proPlus: number };
}

function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
}

function Feat({ children, muted }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <div className={`pcab-feat${muted ? " muted" : ""}`}>
      {muted ? <Minus size={15} aria-hidden="true" /> : <Check size={15} aria-hidden="true" />}
      <span>{children}</span>
    </div>
  );
}

export function TariffPlansMobile({ tier, earningsBalanceRub, subscription, prices, aiIncluded }: Props) {
  const { busy, manageOpen, setManageOpen, pending, setPending, confirmPurchase, cancelAtPeriodEnd } =
    useTariffPlanActions({ earningsBalanceRub, subscription });
  const periodEnd = fmtDate(subscription?.currentPeriodEnd ?? null);

  const badgeCur = <span className="pcab-badge-cur">ВАШ ТАРИФ · активен</span>;

  function currentFooter() {
    if (!subscription) return null;
    if (subscription.cancelAtPeriodEnd) {
      return (
        <div className="pcab-manage-row">
          <span className="pcab-manage-info">Продление отключено{periodEnd ? ` — действует до ${periodEnd}` : ""}.</span>
        </div>
      );
    }
    return (
      <div className="pcab-manage-row">
        <span className="pcab-manage-info">{periodEnd ? <>Продлится <b>{periodEnd}</b></> : "Продлевается ежемесячно"}</span>
        {!manageOpen ? (
          <button type="button" className="pcab-manage-link" onClick={() => setManageOpen(true)}>
            Управлять
          </button>
        ) : (
          <span style={{ display: "inline-flex", gap: 12 }}>
            <button
              type="button"
              className="pcab-manage-link"
              disabled={busy !== null}
              onClick={cancelAtPeriodEnd}
              data-testid="practitioner-tariff-cancel-mobile"
            >
              Не продлевать
            </button>
            <button type="button" className="pcab-manage-link" style={{ color: "var(--pc-ink-faint)" }} onClick={() => setManageOpen(false)}>
              Закрыть
            </button>
          </span>
        )}
      </div>
    );
  }

  function payButtons({ planKey, priceRub, primary }: { planKey: string; priceRub: number; primary?: boolean }) {
    return (
      <div className="pcab-plan-actions">
        <button
          type="button"
          className={`pcab-planbtn ${primary ? "pcab-planbtn-primary" : "pcab-planbtn-ghost"}`}
          disabled={busy !== null}
          onClick={() => setPending({ planKey, planName: planNameOf(planKey), priceRub, method: "earnings" })}
          data-testid="practitioner-subscribe-cta-mobile"
        >
          <Wallet size={14} aria-hidden="true" />
          С баланса
        </button>
        <button
          type="button"
          className="pcab-planbtn pcab-planbtn-ghost"
          disabled={busy !== null}
          onClick={() => setPending({ planKey, planName: planNameOf(planKey), priceRub, method: "card" })}
        >
          <CreditCard size={14} aria-hidden="true" />
          Картой
        </button>
      </div>
    );
  }

  return (
    <div data-testid="practitioner-tariff-plans-mobile">
      {/* Free */}
      <div className="pcab-plan">
        <div className="pcab-plan-top">
          <div className="pcab-plan-name">Базовый</div>
          <div className="pcab-plan-price">
            <b>0 ₽</b>
            <span>без подписки</span>
          </div>
        </div>
        {tier === "free" && <div className="pcab-plan-top" style={{ marginTop: 9 }}>{badgeCur}</div>}
        <div className="pcab-cstrip">
          <span>Комиссия <b>35%</b></span>
          <span className="pcab-cstrip-dot" />
          <span>свои <b>20%</b></span>
        </div>
        <div className="pcab-feats" style={{ marginTop: 11 }}>
          <Feat>Профиль, бронь, оплата, видео-сессии</Feat>
          <Feat>Расшифровка сессий + комплаенс</Feat>
          <Feat muted>AI-заметки и план сопровождения — недоступны</Feat>
        </div>
        {tier !== "free" && subscription && !subscription.cancelAtPeriodEnd && (
          <p className="pcab-plan-lead" style={{ marginBottom: 0 }}>
            Переход на Базовый = отключить продление текущего тарифа (кнопка «Управлять» ниже).
          </p>
        )}
      </div>

      {/* Pro */}
      <div className={`pcab-plan${tier === "pro" ? " current" : ""}`} data-testid="practitioner-plan-pro-mobile">
        <div className="pcab-plan-top">
          <div className="pcab-plan-name">Pro</div>
          <div className="pcab-plan-price">
            <b>{prices.pro.toLocaleString("ru")} ₽</b>
            <span>/ месяц</span>
          </div>
        </div>
        {tier === "pro" && <div className="pcab-plan-top" style={{ marginTop: 9 }}>{badgeCur}</div>}
        <div className="pcab-cstrip">
          <span>Комиссия <b>30%</b></span>
          <span className="pcab-cstrip-dot" />
          <span>свои <b>17%</b></span>
          <span className="pcab-cstrip-dot" />
          <span>хранение <b>30 дн</b></span>
        </div>
        <div className="pcab-plan-lead">Всё из Базового, плюс:</div>
        <div className="pcab-feats">
          <Feat><b>{aiIncluded.pro} AI-разборов/мес</b> — транскрипт, резюме, заметки, сообщение (докупка пакетами)</Feat>
          <Feat>1 шаблон заметок под ваше направление · подсказка к плану сопровождения</Feat>
          <Feat>Аналитика по сессии</Feat>
        </div>
        {tier === "pro" ? currentFooter() : tier === "free" ? payButtons({ planKey: "practitioner_pro", priceRub: prices.pro }) : null}
      </div>

      {/* Pro+ */}
      <div className={`pcab-plan${tier === "pro_plus" ? " current" : " upsell"}`} data-testid="practitioner-plan-pro-plus-mobile">
        {tier !== "pro_plus" && <span className="pcab-ribbon">РЕКОМЕНДУЕМ · АПГРЕЙД</span>}
        <div className="pcab-plan-top">
          <div className="pcab-plan-name">Pro+</div>
          <div className="pcab-plan-price">
            <b>{prices.proPlus.toLocaleString("ru")} ₽</b>
            <span>/ месяц</span>
          </div>
        </div>
        {tier === "pro_plus" && <div className="pcab-plan-top" style={{ marginTop: 9 }}>{badgeCur}</div>}
        <div className="pcab-cstrip">
          <span>Комиссия <b>25%</b></span>
          <span className="pcab-cstrip-dot" />
          <span>свои <b>14%</b></span>
          <span className="pcab-cstrip-dot" />
          <span>хранение <b>90 дн</b></span>
        </div>
        <div className="pcab-plan-lead">Всё из Pro, плюс:</div>
        <div className="pcab-feats">
          <Feat><b>{aiIncluded.proPlus} AI-разборов/мес</b> вместо {aiIncluded.pro}</Feat>
          <Feat>Шаблоны заметок под ваше направление (SOAP/DAP, GROW…) + свой</Feat>
          <Feat>Живой план сопровождения · дашборд прогресса клиента</Feat>
          <Feat>Приоритет в каталоге + бейдж Pro+</Feat>
        </div>
        {tier === "pro_plus" ? currentFooter() : payButtons({ planKey: "practitioner_pro_plus", priceRub: prices.proPlus, primary: true })}
      </div>

      {/* подтверждение покупки (accidental-tap guard) */}
      <Dialog open={pending !== null} onOpenChange={(open) => { if (!open) setPending(null); }}>
        <DialogContent className="max-w-sm" showCloseButton={false} data-testid="practitioner-tariff-confirm-mobile">
          <DialogHeader>
            <DialogTitle>Подключить тариф {pending?.planName ?? ""}?</DialogTitle>
            <DialogDescription>
              {pending?.method === "earnings" ? (
                <>
                  С баланса практика спишется{" "}
                  <span className="font-semibold text-[var(--soft-bordeaux)]">{pending ? pending.priceRub.toLocaleString("ru") : ""} ₽</span>. Тариф
                  активируется сразу и продлевается ежемесячно.
                </>
              ) : (
                <>
                  Оплата картой —{" "}
                  <span className="font-semibold text-[var(--soft-bordeaux)]">{pending ? pending.priceRub.toLocaleString("ru") : ""} ₽</span>/мес.
                  Откроется страница оплаты; тариф активируется после оплаты.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button
              type="button"
              onClick={() => setPending(null)}
              className="soft-button soft-button-ghost"
              style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
            >
              Отмена
            </button>
            <button
              type="button"
              disabled={busy !== null}
              onClick={confirmPurchase}
              className="soft-button soft-button-primary"
              style={{ minHeight: "2.25rem", padding: "0.5rem 1rem", fontSize: "0.875rem" }}
              data-testid="practitioner-tariff-confirm-cta-mobile"
            >
              {pending?.method === "earnings" ? "Оплатить с баланса" : "Перейти к оплате"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
