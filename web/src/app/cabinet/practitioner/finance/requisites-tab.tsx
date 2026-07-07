import Link from "next/link";
import { ChevronRight, CreditCard, FileText, Landmark, Receipt, ShieldAlert, ShieldCheck } from "lucide-react";
import { AGENT_OFFER_VERSION } from "@/lib/practitioner-compliance";
import { TAX_STATUS_LABELS, type TaxStatusKey } from "@/lib/practitioner-tax-verification";
import { appUrl, mainUrl } from "@/lib/subdomain";
import { AgentOfferAcceptButton } from "../earnings/agent-offer-accept-button";

// B466 — «Финансы → Реквизиты» (mockups -requisites / -requisites-locked):
// способ выплат (кнопка добавления зависит от налогового статуса) · налоговый
// статус с ПОЛНЫМ ИНН (tappable → tax-status) · чеки «Мой налог» · документы
// (каждый — открываемая строка). Без подтверждённого ИНН — заблокированное
// состояние с CTA «Заполнить ИНН».

export interface RequisitesTabData {
  taxStatus: TaxStatusKey | "UNKNOWN";
  taxReviewStatus: string;
  taxStatusVerifiedAt: Date | null;
  inn: string | null;
  agentOfferAcceptedAt: Date | null;
  agentOfferVersion: string | null;
  payoutDetails: {
    type: string;
    accountNumber: string;
    bankName: string | null;
    legalName: string | null;
    kycStatus: string;
  } | null;
}

const MASK = (account: string) => (account.length > 6 ? `·· ${account.slice(-4)}` : account);

function DocRow({ href, title, meta }: { href: string; title: string; meta: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
        <FileText className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-[var(--soft-ink-faint)]">{meta}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
    </a>
  );
}

export function RequisitesTab({ data }: { data: RequisitesTabData }) {
  const taxVerified = Boolean(data.inn) && data.taxReviewStatus === "VERIFIED" && data.taxStatus !== "UNKNOWN";
  const isSelfEmployed = data.taxStatus === "SELF_EMPLOYED";
  const acceptedDate = data.agentOfferAcceptedAt
    ? data.agentOfferAcceptedAt.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" })
    : null;
  const agentOfferAccepted = Boolean(data.agentOfferAcceptedAt && data.agentOfferVersion === AGENT_OFFER_VERSION);
  const addLabel = isSelfEmployed || !taxVerified
    ? "Добавить номер карты (только для самозанятых)"
    : "Добавить расчётный счёт (для ИП / юр. лица)";

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="practitioner-finance-requisites">
      {/* Способ выплат */}
      <section>
        <p className="soft-eyebrow mb-2.5">Куда приходят выплаты</p>
        {!taxVerified ? (
          <div className="soft-card p-4" data-testid="practitioner-requisites-locked">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ background: "var(--soft-amber-bg,#F2E2C2)", color: "var(--soft-amber-ink,#6E5114)" }}>
                <ShieldAlert className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold">Добавление платёжного средства недоступно</p>
                <p className="mt-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                  Требуется заполнить ИНН и подтвердить налоговый статус — тогда можно добавить карту или счёт.
                </p>
                <Link href={appUrl("/practitioner/finance/tax-status")} className="soft-button soft-button-primary mt-3 inline-flex">
                  Заполнить ИНН
                </Link>
              </div>
            </div>
            <p className="mt-3 border-t border-[var(--soft-paper-deep)] pt-3 text-xs text-[var(--soft-ink-faint)]">
              {addLabel} — после подтверждения ИНН
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
            {data.payoutDetails ? (
              <div className="px-3.5 py-3.5">
                <div className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={{ background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }}>
                    {data.payoutDetails.type === "ENTITY" ? <Landmark className="h-[18px] w-[18px]" /> : <CreditCard className="h-[18px] w-[18px]" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium">
                      {data.payoutDetails.type === "ENTITY"
                        ? `Счёт ${data.payoutDetails.legalName ?? "юр. лица"} ${MASK(data.payoutDetails.accountNumber)}`
                        : `${data.payoutDetails.type === "CARD" ? "Карта" : "СБП"}${data.payoutDetails.bankName ? ` ${data.payoutDetails.bankName}` : ""} ${MASK(data.payoutDetails.accountNumber)}`}
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
                      основной способ · выплаты 1-го и 15-го по МСК
                      {data.payoutDetails.type === "ENTITY" && data.payoutDetails.kycStatus !== "VERIFIED" ? " · KYC на проверке" : ""}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full px-2 py-px text-[10px] font-semibold" style={{ background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }}>
                    проверено
                  </span>
                </div>
                <Link href={appUrl("/practitioner/finance/requisites/edit")} className="soft-chip mt-3 inline-flex">
                  Изменить
                </Link>
              </div>
            ) : (
              <Link
                href={appUrl("/practitioner/finance/requisites/edit")}
                data-testid="practitioner-requisites-add"
                className="flex items-center gap-3 px-3.5 py-3.5 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
                  <CreditCard className="h-[18px] w-[18px]" />
                </span>
                <span className="min-w-0 flex-1 text-sm font-medium">{addLabel}</span>
                <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
              </Link>
            )}
          </div>
        )}
      </section>

      {/* Налоговый статус */}
      <section>
        <p className="soft-eyebrow mb-2.5">Налоговый статус</p>
        <Link
          href={appUrl("/practitioner/finance/tax-status")}
          data-testid="practitioner-tax-status-row"
          className="flex items-center gap-3 rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3.5 py-3.5 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
        >
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
            style={taxVerified
              ? { background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }
              : { background: "var(--soft-amber-bg,#F2E2C2)", color: "var(--soft-amber-ink,#6E5114)" }}
          >
            {taxVerified ? <ShieldCheck className="h-[18px] w-[18px]" /> : <ShieldAlert className="h-[18px] w-[18px]" />}
          </span>
          <span className="min-w-0 flex-1">
            {taxVerified ? (
              <>
                <span className="block text-[13.5px] font-medium">
                  {TAX_STATUS_LABELS[data.taxStatus as TaxStatusKey]} · подтверждён
                </span>
                {/* Owner: показывать ПОЛНЫЙ ИНН, не скрывать. */}
                <span className="mt-0.5 block text-xs text-[var(--soft-ink-faint)]">
                  ИНН {data.inn} · проверен автоматически (ФНС)
                </span>
              </>
            ) : (
              <>
                <span className="block text-[13.5px] font-medium">Статус не подтверждён</span>
                <span className="mt-0.5 block text-xs text-[var(--soft-ink-faint)]">
                  Заполните ИНН для автоматической проверки (ФНС)
                </span>
              </>
            )}
          </span>
          {!taxVerified && (
            <span className="shrink-0 rounded-full px-2 py-px text-[10px] font-semibold" style={{ background: "var(--soft-amber-bg,#F2E2C2)", color: "var(--soft-amber-ink,#6E5114)" }}>
              требуется
            </span>
          )}
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
        </Link>
        {taxVerified && isSelfEmployed && (
          <Link
            href={appUrl("/practitioner/finance/receipts")}
            className="mt-2.5 flex items-center gap-3 rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-3.5 py-3.5 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
              <Receipt className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-medium">Чеки в «Мой налог»</span>
              <span className="mt-0.5 block text-xs text-[var(--soft-ink-faint)]">по каждой оплаченной сессии</span>
            </span>
            <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
          </Link>
        )}
      </section>

      {/* Документы и согласия */}
      <section>
        <p className="soft-eyebrow mb-2.5">Документы и согласия</p>
        <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
          <DocRow
            href={mainUrl("/legal/agent-offer")}
            title="Агентская оферта"
            meta={acceptedDate ? `Ваш договор с платформой · принята ${acceptedDate}` : "Ваш договор с платформой"}
          />
          <DocRow href={mainUrl("/legal/offer")} title="Публичная оферта" meta="Условия оказания услуг платформы" />
          <DocRow href={mainUrl("/legal/consent")} title="Согласие на обработку данных" meta="152-ФЗ · подписано при регистрации" />
        </div>
        {!agentOfferAccepted && (
          <div className="soft-card mt-2.5 flex flex-wrap items-center justify-between gap-3 p-3.5">
            <p className="text-sm text-[var(--soft-ink-soft)]">
              Для выплат нужно принять агентскую оферту (версия {AGENT_OFFER_VERSION}).
            </p>
            <AgentOfferAcceptButton accepted={agentOfferAccepted} />
          </div>
        )}
      </section>

      <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        <span className="font-medium text-[var(--soft-ink-soft)]">Смена реквизитов.</span> Новый способ выплат
        проходит проверку — до её завершения выплаты идут на текущий подтверждённый способ.
      </p>
    </div>
  );
}
