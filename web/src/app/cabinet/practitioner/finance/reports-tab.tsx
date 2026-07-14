import { Download, FileSpreadsheet } from "lucide-react";
import db from "@/lib/db";
import type { PractitionerFinanceData } from "./finance-data";

// B466 — «Финансы → Отчёты»: отчёты по периодам со скачиванием XLSX / CSV
// (owner ROUND 4 #3а — реальная выгрузка через /api/practitioner/finance/export)
// + акты выполненных работ (законодательно обязательный документ, формирует
// платформа как агент). «Движение» и «Чеки» вынесены в отдельные вкладки.

const MONTH_FMT = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
  timeZone: "Europe/Moscow",
});

const EXPORT_BASE = "/api/practitioner/finance/export";

export async function ReportsTab({
  practitionerId,
  byMonth,
}: {
  practitionerId: string;
  byMonth: PractitionerFinanceData["byMonth"];
}) {
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
      {/* Отчёты по периодам — со скачиванием XLSX / CSV */}
      <section>
        <p className="soft-eyebrow mb-2.5">Отчёты по периодам</p>
        <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
          {byMonth.length === 0 ? (
            <p className="px-4 py-5 text-sm text-[var(--soft-ink-faint)]">
              Отчёты появятся после первой завершённой сессии.
            </p>
          ) : (
            byMonth.map((m) => (
              <div key={m.key} className="flex flex-wrap items-center gap-3 px-3.5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium capitalize">{m.month}</p>
                  <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
                    доход {m.gross.toLocaleString("ru")} ₽ · {m.count} сессий · {m.net.toLocaleString("ru")} ₽ чистыми
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <a
                    href={`${EXPORT_BASE}?period=${m.key}&format=xlsx`}
                    className="soft-button soft-button-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                    data-testid="finance-report-xlsx"
                  >
                    <Download className="h-3.5 w-3.5" />
                    XLSX
                  </a>
                  <a
                    href={`${EXPORT_BASE}?period=${m.key}&format=csv`}
                    className="soft-button soft-button-ghost inline-flex items-center gap-1.5 px-3 py-1.5 text-xs"
                    data-testid="finance-report-csv"
                  >
                    CSV
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Акты выполненных работ — законодательно обязательный документ */}
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

      <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        <span className="font-medium text-[var(--soft-ink-soft)]">По закону.</span> Обязательный документ — только
        акт выполненных работ; платформа формирует его как ваш агент. Выгрузки XLSX/CSV — для вашего учёта. Чеки для
        клиентов уходят в «Мой налог» автоматически (вкладка «Чеки»).
      </p>
    </div>
  );
}
