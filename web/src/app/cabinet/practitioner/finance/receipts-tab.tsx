import Link from "next/link";
import { Check, ExternalLink, Receipt } from "lucide-react";
import db from "@/lib/db";
import { mskMonthRange } from "@/lib/practitioner-ai-quota";
import { appUrl } from "@/lib/subdomain";

// B466 R9-5 desktop — «Финансы → Чеки» как отдельная вкладка (owner ROUND 4 #3г:
// «Чеки» сразу после «Отчёты», появляется при подтверждённой самозанятости).
// Честно: без фейкового № чека — «сессия №» (реальный № формирует «Мой налог»).

const DAY_FMT = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: "Europe/Moscow" });
const MONTH_NAME_FMT = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "Europe/Moscow" });

export async function ReceiptsTab({ practitionerId, taxStatus }: { practitionerId: string; taxStatus: string }) {
  const isSelfEmployed = taxStatus === "SELF_EMPLOYED";

  if (!isSelfEmployed) {
    return (
      <section className="soft-card mt-5 p-4 sm:p-5" data-testid="practitioner-finance-receipts-tab">
        <p className="text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Чеки «Мой налог» относятся к статусу самозанятого (НПД). Ваш налоговый статус другой — чеки для клиентов
          формируются по правилам вашего режима.
        </p>
        <Link href={appUrl("/practitioner/finance?tab=requisites")} className="soft-chip mt-3 inline-flex">
          Налоговый статус
        </Link>
      </section>
    );
  }

  const now = new Date();
  const month = mskMonthRange(now);
  const bookings = await db.booking.findMany({
    where: { practitionerId, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: { id: true, priceRub: true, createdAt: true, client: { select: { name: true } } },
  });
  const monthRows = bookings.filter((b) => b.createdAt >= month.start && b.createdAt < month.end);
  const monthTotal = monthRows.reduce((s, b) => s + b.priceRub, 0);
  const receiptWord = monthRows.length === 1 ? "чек" : monthRows.length > 1 && monthRows.length < 5 ? "чека" : "чеков";

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="practitioner-finance-receipts-tab">
      {/* Сводка месяца */}
      <section className="soft-card p-4 sm:p-5">
        <p className="text-xs capitalize text-[var(--soft-ink-soft)]">
          {MONTH_NAME_FMT.format(now)} · {monthRows.length} {receiptWord}
        </p>
        <p className="mt-1 font-heading text-2xl font-bold text-[var(--soft-bordeaux)]">
          на {monthTotal.toLocaleString("ru")} ₽
        </p>
        <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">НПД, самозанятый · «Мой налог»</p>
      </section>

      {/* Последние чеки */}
      <section>
        <p className="soft-eyebrow mb-2.5">Последние чеки</p>
        <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
          {bookings.length === 0 ? (
            <p className="px-4 py-5 text-sm text-[var(--soft-ink-faint)]">
              Чеков пока нет — первый появится после первой оплаченной сессии.
            </p>
          ) : (
            bookings.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-3.5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
                  <Receipt className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-medium">{b.client.name ?? "Клиент"}</p>
                  <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
                    {DAY_FMT.format(b.createdAt)} · сессия № {b.id.slice(-6).toUpperCase()}
                  </p>
                </div>
                <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-px text-[10px] font-semibold" style={{ background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }}>
                  <Check className="h-2.5 w-2.5" strokeWidth={3} />
                  сформирован
                </span>
                <span className="w-20 shrink-0 text-right font-heading text-sm font-semibold tabular-nums">
                  {b.priceRub.toLocaleString("ru")} ₽
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        <span className="font-medium text-[var(--soft-ink-soft)]">Как это работает.</span> Платформа как ваш агент
        формирует чек в «Мой налог» автоматически при оплате клиентом. Отдельно ничего пробивать не нужно — налог
        начисляет ФНС по данным чеков.
      </p>
      <a
        href="https://lknpd.nalog.ru/"
        target="_blank"
        rel="noreferrer"
        className="soft-button soft-button-ghost inline-flex w-fit items-center gap-1.5"
      >
        Открыть «Мой налог»
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </div>
  );
}
