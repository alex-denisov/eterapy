export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { AdminHero, MetricCard, MetricGrid } from "../../admin-analytics-ui";
import {
  IP_REGISTERED_AT,
  TAX_RATES,
  buildObligationSchedule,
  estimateSetAside,
  type Obligation,
} from "@/lib/ip-accounting";
import {
  INCOME_RECOGNITION_RULES,
  RECOGNITION_LABEL,
  SUBJECT_LABEL,
  buildIncomeBook,
} from "@/lib/ip-income-book";
import { loadIncomeRecords } from "@/lib/ip-income-book-data";
import { summarizeManualLedger } from "@/lib/ip-manual-ledger";
import db from "@/lib/db";
import { IncomeBookTable } from "./income-book-table";
import { ManualLedger } from "./manual-ledger";
import { ReconciliationImport } from "./reconciliation-import";

// B591 фаза 1 (владелец 2026-07-27: «УСН Доходы 6 % уже стоит, продолжай
// работу»). Экран отвечает ровно на один вопрос владельца: «что мне, как ИП,
// делать и что кому отправлять в какие сроки». Он НЕ ведёт бухгалтерию —
// декларацию сдаёт Альфа, а здесь живут даты и порядок сумм.

const STATE_TONE: Record<Obligation["state"], { label: string; bg: string; ink: string }> = {
  done: { label: "сделано", bg: "rgba(122,150,122,0.16)", ink: "#3F5A3F" },
  overdue: { label: "просрочено", bg: "rgba(180,60,60,0.16)", ink: "#8E2F2F" },
  soon: { label: "скоро", bg: "rgba(214,117,88,0.18)", ink: "#8A4227" },
  upcoming: { label: "впереди", bg: "rgba(0,0,0,0.05)", ink: "var(--soft-ink-faint)" },
};

const RESPONSIBLE_LABEL: Record<Obligation["responsible"], string> = {
  owner: "вы",
  accountant: "Альфа-бухгалтерия",
  platform: "платформа",
};

const rub = (value: number) => `${value.toLocaleString("ru-RU")} ₽`;
const dateRu = (date: Date) =>
  date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function FinanceAccountingPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  const now = new Date();
  const year = now.getUTCFullYear();
  const schedule = buildObligationSchedule(year, now);

  // B591 фаза 2. Раньше «поступило» считалось как сумма ВСЕХ успешных
  // транзакций года — вместе с внутренними проводками и со знаком, которым
  // записано списание у пользователя. Это давало не выручку, а сальдо
  // пользовательского счёта. Теперь и метрика, и оценка берутся из книги
  // доходов, и налог оценивается по СОБСТВЕННОМУ доходу: по агентским услугам
  // им признаётся только комиссия (ответ бухгалтера 2026-07-27).
  const { records, internalCount } = await loadIncomeRecords({
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year + 1, 0, 1)),
  }).catch(() => ({ records: [], internalCount: 0 }));
  const book = buildIncomeBook(records, now);
  const turnoverRub = Math.round(book.totals.turnoverKopecks / 100);
  const railIncomeRub = Math.round(book.totals.ownIncomeKopecks / 100);

  // B591: приход мимо платёжного рельса (оплата по счёту и подобное) — такой же
  // доход, и налог с него платится. Поэтому он складывается с книгой ДО оценки,
  // а не показывается отдельной справкой рядом. Расходы в оценку не входят
  // вовсе: на УСН «Доходы» они базу не уменьшают.
  const manualEntries = await db.ipLedgerEntry
    .findMany({
      where: { occurredAt: { gte: new Date(Date.UTC(year, 0, 1)), lt: new Date(Date.UTC(year + 1, 0, 1)) } },
    })
    .catch(() => []);
  const manualTotals = summarizeManualLedger(
    manualEntries.map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt,
      direction: entry.direction === "expense" ? "expense" as const : "income" as const,
      categoryKey: entry.categoryKey,
      amountKopecks: entry.amountKopecks,
      taxable: entry.taxable,
      counterparty: entry.counterparty,
      documentRef: entry.documentRef,
      note: entry.note,
    })),
  );
  const manualIncomeRub = Math.round(manualTotals.taxableIncomeKopecks / 100);
  const incomeRub = railIncomeRub + manualIncomeRub;
  const estimate = estimateSetAside({ incomeRub, year, at: now });

  const nextDue = schedule.find((item) => item.state === "soon" || item.state === "overdue");

  return (
    <div className="space-y-6" data-testid="admin-accounting-page">
      <AdminHero eyebrow="УСН «Доходы» 6 %" title="Учёт и отчётность">
        <p className="text-sm text-[var(--soft-ink-soft)]">
          ИП зарегистрирован {dateRu(IP_REGISTERED_AT)} · ИНН 774315089677 · ОГРНИП 326508100422433.
          Декларацию сдаёт Альфа-бухгалтерия; этот экран даёт ей цифры и не даёт вам пропустить дату.
        </p>
      </AdminHero>

      <MetricGrid>
        <MetricCard
          label="Ваш доход с начала года"
          value={rub(incomeRub)}
          hint={`оборот ${rub(turnoverRub)} · по сессиям доходом признаётся только комиссия${manualIncomeRub > 0 ? ` · из них ${rub(manualIncomeRub)} заведены руками` : ""}`}
        />
        <MetricCard
          label="Отложить (оценка)"
          value={rub(estimate.totalRub)}
          hint={`налог ${rub(estimate.taxRub)} · взносы ${rub(estimate.fixedContributionRub + estimate.surplusContributionRub)}`}
        />
        <MetricCard
          label="Ближайший срок"
          value={nextDue ? dateRu(nextDue.dueAt) : "нет"}
          hint={nextDue?.title ?? "все текущие обязанности закрыты"}
        />
      </MetricGrid>

      {/* Оговорка стоит рядом с числом, а не в подвале: цифра без неё читается
          как «столько я должен налоговой», и это неправда. */}
      <p
        className="rounded-[10px] px-3 py-2 text-xs leading-relaxed"
        data-testid="accounting-estimate-disclaimer"
        style={{ background: "var(--soft-amber-bg, #F2E2C2)", color: "var(--soft-amber-ink, #6E5114)" }}
      >
        {estimate.disclaimer}
      </p>

      <section className="soft-card p-5" data-testid="accounting-obligations">
        <h2 className="soft-h3">Календарь обязанностей на {year} год</h2>
        <div className="mt-4 grid gap-2">
          {schedule.map((item) => {
            const tone = STATE_TONE[item.state];
            return (
              <div
                key={item.key}
                className="grid gap-1.5 rounded-[12px] border border-[var(--soft-paper-edge)] px-3.5 py-3 sm:grid-cols-[1fr_auto] sm:items-start"
                data-obligation={item.key}
                data-state={item.state}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-semibold text-[var(--soft-ink)]">{item.title}</span>
                    <span className="text-xs text-[var(--soft-ink-faint)]">→ {item.recipient}</span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">{item.note}</p>
                  {item.doneNote && (
                    <p className="mt-1 text-xs leading-relaxed" style={{ color: "#3F5A3F" }}>{item.doneNote}</p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2 sm:flex-col sm:items-end">
                  <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ background: tone.bg, color: tone.ink }}>
                    {tone.label}
                  </span>
                  <span className="whitespace-nowrap text-xs tabular-nums text-[var(--soft-ink-strong)]">{dateRu(item.dueAt)}</span>
                  <span className="whitespace-nowrap text-[11px] text-[var(--soft-ink-faint)]">{RESPONSIBLE_LABEL[item.responsible]}</span>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="soft-card p-5" data-testid="accounting-income-book">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="soft-h3">Книга доходов за {year} год</h2>
          <div className="flex flex-wrap gap-2 text-xs">
            <a className="soft-button-ghost px-3 py-1.5" href={`/api/admin/finance/income-book?year=${year}&format=xlsx`}>
              Выгрузить XLSX
            </a>
            <a className="soft-button-ghost px-3 py-1.5" href={`/api/admin/finance/income-book?year=${year}&format=csv`}>
              CSV
            </a>
            {/* B591 фаза 4: годовой пакет — другой документ, а не другой формат
                той же книги. Книга отвечает «откуда сумма», пакет — «сходится
                ли год»: месяцы, чеки, возвраты, доля комиссии и сроки. */}
            <a
              className="soft-button soft-button-primary px-3 py-1.5"
              href={`/api/admin/finance/annual-package?year=${year}`}
              data-testid="accounting-annual-package"
            >
              Годовой пакет за {year}
            </a>
          </div>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
          Это данные для Альфа-бухгалтерии, а не сама КУДиР: книгу ведёт бухгалтер, здесь она получает
          цифры в готовом виде. Оборот и доход разделены — по агентским услугам вашим доходом
          признаётся только комиссия платформы.
        </p>

        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <div className="rounded-[12px] border border-[var(--soft-paper-edge)] px-3 py-2">
            <div className="text-[11px] text-[var(--soft-ink-faint)]">Оборот</div>
            <div className="text-sm font-semibold tabular-nums text-[var(--soft-ink)]">{rub(turnoverRub)}</div>
          </div>
          <div className="rounded-[12px] border border-[var(--soft-paper-edge)] px-3 py-2">
            <div className="text-[11px] text-[var(--soft-ink-faint)]">Ваш доход</div>
            <div className="text-sm font-semibold tabular-nums text-[var(--soft-ink)]">{rub(incomeRub)}</div>
          </div>
          <div className="rounded-[12px] border border-[var(--soft-paper-edge)] px-3 py-2">
            <div className="text-[11px] text-[var(--soft-ink-faint)]">Снято возвратами</div>
            <div className="text-sm font-semibold tabular-nums text-[var(--soft-ink)]">
              {rub(Math.round(book.totals.refundedOwnIncomeKopecks / 100))}
            </div>
          </div>
        </div>

        {/* Нерешённые строки — красная плашка, а не сноска: выгружать книгу с
            неопознанными поступлениями нельзя, она разойдётся с декларацией. */}
        {book.totals.unresolvedCount > 0 && (
          <p
            className="mt-3 rounded-[10px] px-3 py-2 text-xs leading-relaxed"
            data-testid="accounting-income-unresolved"
            style={{ background: "rgba(180,60,60,0.12)", color: "#8E2F2F" }}
          >
            {book.totals.unresolvedCount} {book.totals.unresolvedCount === 1 ? "строка" : "строк"} на
            {" "}{rub(Math.round(book.totals.unresolvedTurnoverKopecks / 100))} не отнесены к доходу —
            причина написана на каждой. Строки за май–июнь это тестовый рельс ЮKassa, денег по ним
            не приходило; остальные проверьте до выгрузки бухгалтеру. Система не подставляет ставку
            и не угадывает вид платежа.
          </p>
        )}

        <div className="mt-4">
          <IncomeBookTable
            rows={book.entries.map((entry) => ({
              id: entry.id,
              date: dateRu(entry.recognizedAt),
              sortDate: entry.recognizedAt.getTime(),
              provider: entry.provider,
              reference: entry.reference,
              subject: entry.subject ? SUBJECT_LABEL[entry.subject] : "вид не определён",
              note: entry.note,
              issue: entry.issue,
              turnoverRub: Math.round(entry.turnoverKopecks / 100),
              ownIncomeRub: entry.ownIncomeKopecks === null ? null : Math.round(entry.ownIncomeKopecks / 100),
              recognition: entry.refunded
                ? "возврат"
                : entry.recognition
                  ? RECOGNITION_LABEL[entry.recognition]
                  : "не определено",
            }))}
          />
        </div>

        {internalCount > 0 && (
          <p className="mt-3 text-[11px] leading-relaxed text-[var(--soft-ink-faint)]">
            Ещё {internalCount} внутренних проводок за год (подписка практика за счёт заработанного,
            выдача админом) в книгу не входят: денег по ним не поступало.
          </p>
        )}
      </section>

      <ManualLedger year={year} />

      <section className="soft-card p-5" data-testid="accounting-reconciliation-import">
            <h2 className="soft-h3">Сверка с чеками и импорт выписки</h2>
        <p className="mt-1 mb-4 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
          Загрузка всегда двухшаговая: сначала распознавание без записи в базу,
          затем явное подтверждение. Повторный файл не дублирует банковские строки.
        </p>
        <ReconciliationImport />
      </section>

      <section className="soft-card p-5" data-testid="accounting-recognition-rules">
        <h2 className="soft-h3">Как признаётся доход</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
          Правила — данные с датой начала действия и основанием, как и ставки. Меняется ответ
          бухгалтера — меняется строка правила, а не расчёт.
        </p>
        <div className="mt-3 grid gap-1.5 text-xs">
          {INCOME_RECOGNITION_RULES.map((rule) => (
            <div key={rule.subject} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--soft-paper-edge)] pb-1.5 last:border-0">
              <span className="text-[var(--soft-ink-strong)]">
                {SUBJECT_LABEL[rule.subject]}
                <span className="ml-2 font-semibold">{RECOGNITION_LABEL[rule.recognition]}</span>
                <span className="ml-2 text-[var(--soft-ink-faint)]">{rule.basis}</span>
              </span>
              <span className="whitespace-nowrap tabular-nums text-[var(--soft-ink-faint)]">с {dateRu(rule.effectiveFrom)}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="soft-card p-5" data-testid="accounting-rates">
        <h2 className="soft-h3">Ставки и пороги, по которым считалась оценка</h2>
        {/* Величины показаны с источником и датой начала действия намеренно:
            зашитая в код ставка — это будущая ошибка в декларации, которую
            никто не заметит до апреля. */}
        <div className="mt-3 grid gap-1.5 text-xs">
          {TAX_RATES.map((rate) => (
            <div key={`${rate.key}-${rate.effectiveFrom.toISOString()}`} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--soft-paper-edge)] pb-1.5 last:border-0">
              <span className="text-[var(--soft-ink-strong)]">
                {rate.value < 1 ? `${(rate.value * 100).toFixed(0)} %` : rub(rate.value)}
                <span className="ml-2 text-[var(--soft-ink-faint)]">{rate.source}</span>
              </span>
              <span className="whitespace-nowrap tabular-nums text-[var(--soft-ink-faint)]">с {dateRu(rate.effectiveFrom)}</span>
            </div>
          ))}
        </div>
      </section>

    </div>
  );
}
