import Link from "next/link";
import { ChevronRight, FileSpreadsheet, History, Receipt } from "lucide-react";
import db from "@/lib/db";
import { appUrl } from "@/lib/subdomain";

// B466 — «Финансы → Отчёты» (mockup -reports, owner round-2 #3): ТОЛЬКО акты
// выполненных работ (законодательно обязательный документ; формирует платформа
// как агент) + навигация «Финансовая история» → movements и «Чеки» → receipts.

const MONTH_FMT = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});

function NavRow({ href, icon, title, meta }: { href: string; icon: React.ReactNode; title: string; meta: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-[var(--soft-ink-faint)]">{meta}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
    </Link>
  );
}

export async function ReportsTab({ practitionerId }: { practitionerId: string }) {
  const reports = await db.agentReport.findMany({
    where: { practitionerId },
    orderBy: { periodEnd: "desc" },
    take: 12,
    select: {
      id: true,
      periodStart: true,
      sessionCount: true,
      grossKopecks: true,
      status: true,
      acceptedAt: true,
    },
  });

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="practitioner-finance-reports">
      <section>
        <div className="mb-2.5 flex items-baseline justify-between">
          <p className="soft-eyebrow">Акты выполненных работ</p>
          <span className="text-xs text-[var(--soft-ink-faint)]">формируются 1-го числа</span>
        </div>
        <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
          {reports.length === 0 ? (
            <p className="px-4 py-5 text-sm text-[var(--soft-ink-faint)]">
              Актов пока нет — первый сформируется 1-го числа после первой завершённой сессии.
            </p>
          ) : (
            reports.map((report) => (
              <div key={report.id} className="flex items-center gap-3 px-3.5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px] bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)]">
                  <FileSpreadsheet className="h-[18px] w-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium capitalize">Акт за {MONTH_FMT.format(report.periodStart)}</p>
                  <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
                    {report.sessionCount} сессий · {Math.round(report.grossKopecks / 100).toLocaleString("ru")} ₽ · с платформой
                  </p>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-px text-[10px] font-semibold"
                  style={report.acceptedAt || report.status === "ACCEPTED"
                    ? { background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }
                    : { background: "var(--soft-paper-deep)", color: "var(--soft-ink-soft)" }}
                >
                  {report.acceptedAt || report.status === "ACCEPTED" ? "принят" : "выпущен"}
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <section>
        <p className="soft-eyebrow mb-2.5">Ещё в финансах</p>
        <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
          <NavRow
            href={appUrl("/practitioner/finance/movements")}
            icon={<History className="h-[18px] w-[18px]" />}
            title="Финансовая история"
            meta="Все зачисления, выплаты и удержания"
          />
          <NavRow
            href={appUrl("/practitioner/finance/receipts")}
            icon={<Receipt className="h-[18px] w-[18px]" />}
            title="Чеки"
            meta="«Мой налог» · НПД, самозанятый"
          />
        </div>
      </section>

      <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        <span className="font-medium text-[var(--soft-ink-soft)]">По закону.</span> Обязательный документ — только
        акт выполненных работ; платформа формирует его как ваш агент. Чеки для клиентов уходят в «Мой налог»
        автоматически.
      </p>
    </div>
  );
}
