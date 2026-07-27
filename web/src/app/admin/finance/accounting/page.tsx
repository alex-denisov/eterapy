export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { AdminHero, MetricCard, MetricGrid } from "../../admin-analytics-ui";
import {
  IP_REGISTERED_AT,
  TAX_RATES,
  buildObligationSchedule,
  estimateSetAside,
  type Obligation,
} from "@/lib/ip-accounting";

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

  // Доход года берётся из УСПЕШНЫХ транзакций: оценка «сколько отложить»
  // должна опираться на то, что действительно поступило, а не на выставленное.
  const succeeded = await db.transaction.aggregate({
    where: { status: "SUCCEEDED", createdAt: { gte: new Date(Date.UTC(year, 0, 1)) } },
    _sum: { amount: true },
  }).catch(() => ({ _sum: { amount: null } }));
  // `amount` хранится в копейках.
  const incomeRub = Math.round((succeeded._sum.amount ?? 0) / 100);
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
          label="Поступило с начала года"
          value={rub(incomeRub)}
          hint="успешные транзакции, все провайдеры"
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

      <section className="soft-card p-5" data-testid="accounting-next-phases">
        <h2 className="soft-h3">Чего здесь ещё нет</h2>
        <ul className="mt-2 grid gap-1.5 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
          <li>
            <b>Книга доходов</b> (фаза 2) — таблица признанных доходов с разделением
            «оборот принципала / доход платформы» по агентской схеме и выгрузкой для Альфы.
            Упирается в один вопрос к бухгалтеру: признаётся доходом вся сумма сессии или только комиссия.
          </li>
          <li>
            <b>Сверка с чеками</b> (фаза 3) — оплата без фискального чека это нарушение 54-ФЗ,
            и видеть его надо в день появления. Сверять пока нечего: живых оплат почти нет.
          </li>
          <li>
            <b>Годовой пакет и напоминания в Telegram</b> (фаза 4) — за 10 и за 3 дня до срока.
          </li>
        </ul>
      </section>
    </div>
  );
}
