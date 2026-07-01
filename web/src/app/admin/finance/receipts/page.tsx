export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Download } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  cardPartsFromMetadata,
  getFinanceRows,
  paymentMethodFromMetadata,
  resolveAdminPeriod,
} from "../../admin-analytics-data";
import {
  AdminHero,
  DataTable,
  PeriodToolbar,
  StatusBadge,
  cardMask,
  formatDateTime,
} from "../../admin-analytics-ui";
import { formatAdminRub, formatCbrRateLabel, getAdminCurrencyRates, resolveAdminCurrency } from "../../admin-currency";
import { AdminCurrencySelector } from "../../admin-currency-selector";
import { FinanceExportMenu } from "../export-menu";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function FinanceReceiptsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const params = await searchParams;
  const period = resolveAdminPeriod(params);
  const currency = resolveAdminCurrency(params);
  const page = Math.max(1, Number(first(params.page)) || 1);
  const q = first(params.q) ?? "";
  const [{ transactions, total, take }, currencyRates] = await Promise.all([
    getFinanceRows(period, page, q),
    getAdminCurrencyRates(),
  ]);
  const pages = Math.max(1, Math.ceil(total / take));
  const baseReport = `/api/admin/finance/management-report?start=${period.startInput}&end=${period.endInput}`;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-finance-receipts">
      <AdminHero
        eyebrow="финансы"
        title="Поступления и чеки"
        actions={
          <>
            <FinanceExportMenu label="Экспорт поступлений" baseHref={baseReport} />
            <AdminCurrencySelector basePath="/admin/finance/receipts" currency={currency} rateLabel={formatCbrRateLabel(currencyRates)} />
            <PeriodToolbar basePath="/admin/finance/receipts" start={period.startInput} end={period.endInput} />
          </>
        }
      >
        Таблица показывает 20 операций на страницу, дату и время с секундами, способ оплаты и доступный источник оплаты без скрытия клиентских данных.
      </AdminHero>

      <form className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="start" value={period.startInput} />
        <input type="hidden" name="end" value={period.endInput} />
        <input name="q" defaultValue={q} placeholder="Поиск по клиенту, email, provider payment id" className="min-w-72 rounded-lg border border-[var(--soft-paper-edge)] bg-white px-3 py-2 text-sm" />
        <button className="soft-admin-action" type="submit">Найти</button>
        <button className="soft-admin-action" type="button">Проверить выбранные у провайдера</button>
      </form>

      <DataTable
        columns={["Выбор", "Дата и время", "Клиент", "Сумма", "Статус", "Метод", "Источник", "Провайдер", "Чек"]}
        rows={transactions.map((tx) => {
          const parts = cardPartsFromMetadata(tx.metadata);
          const method = paymentMethodFromMetadata(tx.provider, tx.metadata);
          return [
            <input key="select" type="checkbox" className="accent-[var(--soft-bordeaux)]" />,
            formatDateTime(tx.createdAt),
            <span key="user">{tx.user.name}<br /><span className="text-xs text-[var(--soft-ink-faint)]">{tx.user.email}</span></span>,
            formatAdminRub(tx.amount / 100, currency, currencyRates),
            <StatusBadge key="status" status={tx.status} />,
            method,
            method === "Банковская карта" ? cardMask(parts.first6, parts.last4) : "—",
            tx.providerPaymentId ?? tx.provider,
            tx.providerPaymentId ? (
              <a key="receipt" className="soft-admin-icon-button" href={`/api/admin/finance/receipt/${tx.id}`} target="_blank" title="Скачать чек" aria-label="Скачать чек">
                <Download className="size-3.5" aria-hidden="true" />
              </a>
            ) : "—",
          ];
        })}
      />

      <div className="mt-4 flex items-center justify-between text-xs text-[var(--soft-ink-soft)]">
        <Link className="soft-admin-action" data-variant="subtle" href={`/admin/finance/receipts?start=${period.startInput}&end=${period.endInput}&q=${encodeURIComponent(q)}&page=${Math.max(1, page - 1)}`}>Назад</Link>
        <span>{page} / {pages} · всего {total}</span>
        <Link className="soft-admin-action" data-variant="subtle" href={`/admin/finance/receipts?start=${period.startInput}&end=${period.endInput}&q=${encodeURIComponent(q)}&page=${Math.min(pages, page + 1)}`}>Вперед</Link>
      </div>
    </main>
  );
}
