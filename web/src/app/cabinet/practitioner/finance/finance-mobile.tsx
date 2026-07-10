import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowUpRight,
  Calendar,
  ChevronRight,
  CreditCard,
  FileSpreadsheet,
  FileText,
  History,
  Landmark,
  Lock,
  Plus,
  Receipt,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import db from "@/lib/db";
import { formatPayoutDate, nextPayoutDate } from "@/lib/payout-schedule";
import { PAYOUT_HOLD_DAYS_BY_PLAN, type PractitionerPayoutPlanKey } from "@/lib/payout-runs";
import { practitionerTierName, type PractitionerTier } from "@/lib/practitioner-tier";
import { AGENT_OFFER_VERSION } from "@/lib/practitioner-compliance";
import { TAX_STATUS_LABELS, type TaxStatusKey } from "@/lib/practitioner-tax-verification";
import { appUrl, mainUrl } from "@/lib/subdomain";
import { PractitionerAppbar } from "@/components/cabinet/practitioner-appbar";
import type { PractitionerAppbarData } from "@/lib/practitioner-appbar";
import { AgentOfferAcceptButton } from "../earnings/agent-offer-accept-button";
import { FINANCE_TABS, type FinanceTabKey } from "./finance-tabs";
import type { PractitionerFinanceData } from "./finance-data";
import type { RequisitesTabData } from "./requisites-tab";

// B466 R9-4 P4 — мобильный «Финансы» кокпита практика 1-в-1 по mockups
// practitioner-finance-balance/-tariff/-requisites(+locked)/-reports.html:
// appbar → заголовок → сегмент (Баланс·Тариф·Реквизиты·Отчёты) → тело вкладки.
// Данные — те же серверные загрузчики, что и десктоп-табы; это разметка по
// макету, НЕ копия старых страниц. Тариф — в finance-tariff-mobile.tsx.

const TIER_TO_PAYOUT_PLAN: Record<PractitionerTier, PractitionerPayoutPlanKey> = {
  free: "base",
  pro: "practitioner_pro",
  pro_plus: "practitioner_pro_plus",
};

const MONTH_FMT = new Intl.DateTimeFormat("ru-RU", { month: "long", year: "numeric", timeZone: "Europe/Moscow" });

/** Мобильное шасси «Финансы»: appbar + заголовок + сегмент + тело. */
export function FinanceMobileShell({
  appbar,
  tab,
  children,
}: {
  appbar: PractitionerAppbarData;
  tab: FinanceTabKey;
  children: React.ReactNode;
}) {
  return (
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-finance-mobile">
      <PractitionerAppbar
        initials={appbar.initials}
        name={appbar.name}
        tierLabel={appbar.tierLabel}
        subtitle={appbar.subtitle}
      />
      <div style={{ marginTop: 16 }}>
        <div className="pcab-eyebrow">Финансы практика</div>
        <h1 className="pcab-greeting">Финансы</h1>
      </div>
      <nav className="pcab-seg" data-testid="finance-tabs-mobile">
        {FINANCE_TABS.map((t) => (
          <Link
            key={t.key}
            href={appUrl(`/practitioner/finance?tab=${t.key}`)}
            className={`pcab-seg-item${tab === t.key ? " is-active" : ""}`}
            aria-current={tab === t.key ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}

/* ── Баланс (mockup -finance-balance) ────────────────────────────────── */
export function FinanceBalanceMobile({ data, tier }: { data: PractitionerFinanceData; tier: PractitionerTier }) {
  const holdDays = PAYOUT_HOLD_DAYS_BY_PLAN[TIER_TO_PAYOUT_PLAN[tier]];
  const nextPayout = formatPayoutDate(nextPayoutDate(new Date()));
  const preview = data.movements.slice(0, 4);

  return (
    <div data-testid="practitioner-finance-balance-mobile">
      {/* money hero */}
      <section className="pcab-section">
        <div className="pcab-money">
          <div className="pcab-money-k">Доступно к выплате</div>
          <div className="pcab-money-v">
            {data.currentBalance.toLocaleString("ru")}
            <small> ₽</small>
          </div>
          <div className="pcab-money-sub">
            Оборот {data.totalRevenue.toLocaleString("ru")} ₽ − комиссия {data.totalFee.toLocaleString("ru")} ₽ по
            ставкам завершённых сессий = <b>{data.accruedNet.toLocaleString("ru")} ₽ чистыми</b>. Начислено по
            завершённым сессиям; та же цифра — в шапке кабинета.
          </div>
          <div className="pcab-money-foot">
            <span className="pcab-payout-chip">
              <Calendar size={13} aria-hidden="true" />
              выплата {nextPayout}
            </span>
          </div>
        </div>
        {data.heldPayout > 0 && (
          <Link
            href={appUrl("/practitioner/finance/movements?filter=holds")}
            className="pcab-heldrow"
            data-testid="practitioner-finance-held-mobile"
          >
            <span className="pcab-held-ic">
              <Lock size={17} aria-hidden="true" />
            </span>
            <span className="pcab-held-main">
              <span className="pcab-held-t">Удержано {data.heldPayout.toLocaleString("ru")} ₽</span>
              <span className="pcab-held-s">Hold по сессиям · снимется после периода удержания → в «Движении средств»</span>
            </span>
            <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
          </Link>
        )}
      </section>

      {/* итоги */}
      <section className="pcab-section">
        <div className="pcab-metrics">
          {[
            { v: data.monthNet.toLocaleString("ru"), unit: " ₽", k: "этот месяц · чистыми" },
            { v: String(data.monthCount), unit: "", k: `сессий · ${data.monthKey.split(" ")[0]}` },
            { v: data.accruedNet.toLocaleString("ru"), unit: " ₽", k: "всего заработано" },
            { v: data.paidOut.toLocaleString("ru"), unit: " ₽", k: "уже выплачено" },
          ].map((m) => (
            <div key={m.k} className="pcab-metric">
              <div className="pcab-metric-v">
                {m.v}
                {m.unit && <small>{m.unit}</small>}
              </div>
              <div className="pcab-metric-k">{m.k}</div>
            </div>
          ))}
        </div>
      </section>

      {/* движение средств (превью) */}
      <section className="pcab-section">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Движение средств</span>
          <Link href={appUrl("/practitioner/finance/movements")} className="pcab-section-link">
            всё →
          </Link>
        </div>
        <div className="pcab-list">
          {preview.length === 0 ? (
            <div className="pcab-mv">
              <span className="pcab-mv-s" style={{ whiteSpace: "normal", padding: "6px 0" }}>
                Движений пока нет — они появятся после первой завершённой сессии
              </span>
            </div>
          ) : (
            preview.map((m) => (
              <div key={m.id} className="pcab-mv">
                <span className={`pcab-mv-ic ${m.kind === "earning" ? "in" : m.kind === "hold" ? "hold" : "out"}`}>
                  {m.kind === "earning" ? (
                    <ArrowUpRight size={16} aria-hidden="true" />
                  ) : m.kind === "hold" ? (
                    <Lock size={15} aria-hidden="true" />
                  ) : (
                    <ArrowDownLeft size={16} aria-hidden="true" />
                  )}
                </span>
                <span className="pcab-mv-main">
                  <span className="pcab-mv-t">{m.label}</span>
                  <span className="pcab-mv-s">{m.sublabel}</span>
                </span>
                <span className={`pcab-mv-amt ${m.kind === "earning" ? "pos" : m.kind === "hold" ? "hold" : "neg"}`}>
                  {m.kind === "earning" ? "+" : "−"}
                  {m.amountRub.toLocaleString("ru")} ₽
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* график выплат */}
      <section className="pcab-section">
        <div className="pcab-note" data-testid="practitioner-finance-schedule-mobile">
          <b>График выплат.</b> Дважды в месяц — 1-го и 15-го по МСК. Деньги за сессию доступны после периода
          удержания по вашему тарифу{" "}
          <b>
            {practitionerTierName(tier)} — {holdDays} {holdDays === 1 ? "день" : holdDays < 5 ? "дня" : "дней"}
          </b>{" "}
          (Pro+ 1 день, Pro 3 дня, Базовый 7 дней). Спорные сессии удерживаются до разрешения. Следующая дата:{" "}
          <b>{nextPayout}</b>.
        </div>
      </section>

      {/* по месяцам */}
      {data.byMonth.length > 0 && (
        <section className="pcab-section">
          <div className="pcab-section-head">
            <span className="pcab-eyebrow">По месяцам</span>
          </div>
          <div className="pcab-list">
            {data.byMonth.map((m) => (
              <div key={m.month} className="pcab-mrow">
                <span className="pcab-mrow-m">{m.month}</span>
                <span className="pcab-mrow-c">{m.count} сессий</span>
                <span className="pcab-mrow-v">{m.net.toLocaleString("ru")} ₽</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ── Реквизиты (mockups -requisites / -requisites-locked) ────────────── */
const MASK = (account: string) => (account.length > 6 ? `·· ${account.slice(-4)}` : account);

function DocRow({ href, title, meta }: { href: string; title: string; meta: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="pcab-row">
      <span className="pcab-row-ic calm">
        <FileText size={18} aria-hidden="true" />
      </span>
      <span className="pcab-row-main">
        <span className="pcab-row-t">{title}</span>
        <span className="pcab-row-s">{meta}</span>
      </span>
      <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
    </a>
  );
}

export function FinanceRequisitesMobile({ data }: { data: RequisitesTabData }) {
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
    <div data-testid="practitioner-finance-requisites-mobile">
      {/* способ выплат */}
      <section className="pcab-section">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Куда приходят выплаты</span>
        </div>
        {!taxVerified ? (
          <div data-testid="practitioner-requisites-locked-mobile">
            <div className="pcab-fwarn">
              <span className="pcab-fwarn-ic">
                <AlertTriangle size={20} aria-hidden="true" />
              </span>
              <div className="pcab-fwarn-main">
                <div className="pcab-fwarn-t">Добавление платёжного средства недоступно</div>
                <div className="pcab-fwarn-s">
                  Требуется заполнить ИНН и подтвердить налоговый статус — тогда можно добавить карту или счёт.
                </div>
                <Link href={appUrl("/practitioner/finance/tax-status")} className="pcab-fwarn-cta">
                  <ShieldCheck size={15} aria-hidden="true" />
                  Заполнить ИНН
                </Link>
              </div>
            </div>
            <div className="pcab-disabledadd">
              <Plus size={16} aria-hidden="true" />
              {addLabel} — после подтверждения ИНН
            </div>
          </div>
        ) : data.payoutDetails ? (
          <div className="pcab-method">
            <div className="pcab-method-top">
              <span className="pcab-method-ic">
                {data.payoutDetails.type === "ENTITY" ? (
                  <Landmark size={21} aria-hidden="true" />
                ) : (
                  <CreditCard size={21} aria-hidden="true" />
                )}
              </span>
              <div className="pcab-method-main">
                <div className="pcab-method-t">
                  {data.payoutDetails.type === "ENTITY"
                    ? `Счёт ${data.payoutDetails.legalName ?? "юр. лица"} ${MASK(data.payoutDetails.accountNumber)}`
                    : `${data.payoutDetails.type === "CARD" ? "Карта" : "СБП"}${data.payoutDetails.bankName ? ` ${data.payoutDetails.bankName}` : ""} ${MASK(data.payoutDetails.accountNumber)}`}
                </div>
                <div className="pcab-method-s">
                  основной способ
                  {data.payoutDetails.type === "ENTITY" && data.payoutDetails.kycStatus !== "VERIFIED"
                    ? " · KYC на проверке"
                    : ""}
                </div>
              </div>
              <span className="pcab-method-chip">проверено</span>
            </div>
            <div className="pcab-method-foot">
              <span className="pcab-method-note">Выплаты 1-го и 15-го по МСК</span>
              <Link href={appUrl("/practitioner/finance/requisites/edit")} className="pcab-editlink">
                Изменить
              </Link>
            </div>
          </div>
        ) : (
          <Link
            href={appUrl("/practitioner/finance/requisites/edit")}
            className="pcab-addcard"
            data-testid="practitioner-requisites-add-mobile"
          >
            <Plus size={16} aria-hidden="true" />
            {addLabel}
          </Link>
        )}
      </section>

      {/* налоговый статус */}
      <section className="pcab-section">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Налоговый статус</span>
        </div>
        <div className="pcab-list">
          <Link href={appUrl("/practitioner/finance/tax-status")} className="pcab-row" data-testid="practitioner-tax-status-row-mobile">
            <span className={`pcab-row-ic ${taxVerified ? "sage" : "warm"}`}>
              {taxVerified ? <ShieldCheck size={18} aria-hidden="true" /> : <ShieldAlert size={18} aria-hidden="true" />}
            </span>
            <span className="pcab-row-main">
              {taxVerified ? (
                <>
                  <span className="pcab-row-t">
                    {TAX_STATUS_LABELS[data.taxStatus as TaxStatusKey]}
                    <span className="pcab-okchip">подтверждён</span>
                  </span>
                  <span className="pcab-row-s">ИНН {data.inn} · проверен автоматически (ФНС)</span>
                </>
              ) : (
                <>
                  <span className="pcab-row-t">Статус не подтверждён</span>
                  <span className="pcab-row-s">Заполните ИНН для автоматической проверки (ФНС)</span>
                </>
              )}
            </span>
            {taxVerified ? (
              <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
            ) : (
              <span className="pcab-needchip">требуется</span>
            )}
          </Link>
          {taxVerified && isSelfEmployed && (
            <Link href={appUrl("/practitioner/finance/receipts")} className="pcab-row">
              <span className="pcab-row-ic calm">
                <Receipt size={18} aria-hidden="true" />
              </span>
              <span className="pcab-row-main">
                <span className="pcab-row-t">Чеки в «Мой налог»</span>
                <span className="pcab-row-s">Формируются автоматически при каждой выплате</span>
              </span>
              <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>

      {/* документы и согласия */}
      <section className="pcab-section">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Документы и согласия</span>
        </div>
        <div className="pcab-list">
          <DocRow
            href={mainUrl("/legal/agent-offer")}
            title="Агентская оферта"
            meta={acceptedDate ? `Ваш договор с платформой · принята ${acceptedDate}` : "Ваш договор с платформой"}
          />
          <DocRow href={mainUrl("/legal/offer")} title="Публичная оферта" meta="Условия оказания услуг платформы" />
          <DocRow href={mainUrl("/legal/consent")} title="Согласие на обработку данных" meta="152-ФЗ · подписано при регистрации" />
        </div>
        {!agentOfferAccepted && (
          <div className="pcab-note" style={{ marginTop: 10, display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
            <span>Для выплат нужно принять агентскую оферту (версия {AGENT_OFFER_VERSION}).</span>
            <AgentOfferAcceptButton accepted={agentOfferAccepted} />
          </div>
        )}
      </section>

      <p className="pcab-footnote" style={{ textAlign: "left" }}>
        <b>Смена реквизитов.</b> Новый способ выплат проходит проверку — до её завершения выплаты идут на текущий
        подтверждённый способ.
      </p>
    </div>
  );
}

/* ── Отчёты (mockup -finance-reports) ────────────────────────────────── */
function NavRow({ href, icon, title, meta }: { href: string; icon: React.ReactNode; title: string; meta: string }) {
  return (
    <Link href={href} className="pcab-row">
      <span className="pcab-row-ic calm">{icon}</span>
      <span className="pcab-row-main">
        <span className="pcab-row-t">{title}</span>
        <span className="pcab-row-s">{meta}</span>
      </span>
      <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
    </Link>
  );
}

export async function FinanceReportsMobile({ practitionerId }: { practitionerId: string }) {
  const reports = await db.agentReport.findMany({
    where: { practitionerId },
    orderBy: { periodEnd: "desc" },
    take: 12,
    select: { id: true, periodStart: true, sessionCount: true, grossKopecks: true, status: true, acceptedAt: true },
  });

  return (
    <div data-testid="practitioner-finance-reports-mobile">
      {/* акты выполненных работ */}
      <section className="pcab-section">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Акты выполненных работ</span>
          <span className="pcab-section-link">формируются 1-го</span>
        </div>
        <div className="pcab-list">
          {reports.length === 0 ? (
            <div className="pcab-row">
              <span className="pcab-row-s" style={{ whiteSpace: "normal" }}>
                Актов пока нет — первый сформируется 1-го числа после первой завершённой сессии.
              </span>
            </div>
          ) : (
            reports.map((report) => {
              const accepted = Boolean(report.acceptedAt) || report.status === "ACCEPTED";
              return (
                <div key={report.id} className="pcab-row">
                  <span className="pcab-row-ic calm">
                    <FileSpreadsheet size={18} aria-hidden="true" />
                  </span>
                  <span className="pcab-row-main">
                    <span className="pcab-row-t" style={{ textTransform: "capitalize" }}>
                      Акт за {MONTH_FMT.format(report.periodStart)}
                    </span>
                    <span className="pcab-row-s">
                      {report.sessionCount} сессий · {Math.round(report.grossKopecks / 100).toLocaleString("ru")} ₽ · с платформой
                    </span>
                  </span>
                  <span className={accepted ? "pcab-okchip" : "pcab-needchip"} style={{ marginLeft: 0 }}>
                    {accepted ? "принят" : "выпущен"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </section>

      {/* ещё в финансах */}
      <section className="pcab-section">
        <div className="pcab-section-head">
          <span className="pcab-eyebrow">Ещё в финансах</span>
        </div>
        <div className="pcab-list">
          <NavRow
            href={appUrl("/practitioner/finance/movements")}
            icon={<History size={18} aria-hidden="true" />}
            title="Финансовая история"
            meta="Все зачисления, выплаты и удержания"
          />
          <NavRow
            href={appUrl("/practitioner/finance/receipts")}
            icon={<Shield size={18} aria-hidden="true" />}
            title="Чеки"
            meta="«Мой налог» · НПД, самозанятый"
          />
        </div>
      </section>

      <p className="pcab-footnote" style={{ textAlign: "left" }}>
        <b>По закону.</b> Обязательный документ — только акт выполненных работ; платформа формирует его как ваш агент.
        Чеки для клиентов уходят в «Мой налог» автоматически.
      </p>
    </div>
  );
}
