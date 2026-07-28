export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { type AdminCompactColumn } from "@/components/admin/compact-client-table";
import {
  cardPartsFromMetadata,
  getFinanceRows,
  paymentMethodFromMetadata,
  resolveAdminPeriod,
} from "../../admin-analytics-data";
import {
  AdminHero,
  PeriodToolbar,
  cardMask,
  formatDateTime,
  statusLabel,
} from "../../admin-analytics-ui";
import { formatAdminRub, formatCbrRateLabel, getAdminCurrencyRates, resolveAdminCurrency } from "../../admin-currency";
import { AdminCurrencySelector } from "../../admin-currency-selector";
import { FinanceExportMenu } from "../export-menu";
import { FinanceReceiptsTable } from "./receipts-table";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const receiptColumns: AdminCompactColumn[] = [
  { key: "createdAt", label: "Дата и время", sortable: true, filterKind: "date" },
  { key: "client", label: "Клиент", sortable: true },
  { key: "amount", label: "Сумма", sortable: true, align: "right" },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "SUCCEEDED", label: "Успешно" },
      { value: "PENDING", label: "Ожидает" },
      { value: "FAILED", label: "Ошибка" },
      { value: "REFUNDED", label: "Возврат" },
    ],
  },
  {
    key: "method",
    label: "Метод",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "Банковская карта", label: "Банковская карта" },
      { value: "СБП", label: "СБП" },
      { value: "ЮKassa", label: "ЮKassa" },
    ],
  },
  { key: "source", label: "Источник", sortable: true },
  { key: "provider", label: "Провайдер", sortable: true },
  { key: "receipt", label: "Чек", filterKind: "none", align: "center" },
];

export default async function FinanceReceiptsPage({ searchParams }: PageProps) {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");
  const params = await searchParams;
  const period = resolveAdminPeriod(params);
  const currency = resolveAdminCurrency(params);
  const [{ transactions, total, take }, currencyRates] = await Promise.all([
    getFinanceRows(period, 1, "", 500),
    getAdminCurrencyRates(),
  ]);
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

      <FinanceReceiptsTable
        columns={receiptColumns}
        rows={transactions.map((tx) => {
          const parts = cardPartsFromMetadata(tx.metadata);
          const method = paymentMethodFromMetadata(tx.provider, tx.metadata);
          const amount = tx.amount / 100;
          const source = method === "Банковская карта" ? cardMask(parts.first6, parts.last4) : "—";
          const txStatus = String(tx.status);
          return {
            id: tx.id,
            cells: {
              createdAt: { value: formatDateTime(tx.createdAt), sortValue: new Date(tx.createdAt).getTime(), filterValue: formatDateTime(tx.createdAt) },
              client: { value: tx.user.name ?? "—", subvalue: tx.user.email, filterValue: `${tx.user.name ?? ""} ${tx.user.email ?? ""}` },
              amount: { value: formatAdminRub(amount, currency, currencyRates), sortValue: amount },
              status: { kind: "status", label: statusLabel(tx.status), tone: txStatus === "SUCCEEDED" ? "ok" : txStatus === "FAILED" ? "danger" : "warn", filterValue: `${tx.status} ${statusLabel(tx.status)}` },
              method,
              source,
              provider: tx.providerPaymentId ?? tx.provider,
              receipt: tx.fiscalReceiptRef
                ? {
                    kind: "link",
                    href: `/api/admin/finance/receipt/${tx.id}`,
                    icon: "download",
                    external: true,
                    title: `Фискальный чек: ${tx.fiscalReceiptStatus ?? "статус не указан"}`,
                  }
                : {
                    kind: "status",
                    label: tx.fiscalReceiptStatus ?? "Не сверен",
                    tone: tx.fiscalReceiptError ? "danger" : "warn",
                    filterValue: `${tx.fiscalReceiptStatus ?? ""} ${tx.fiscalReceiptError ?? ""}`,
                  },
            },
          };
        })}
        empty="Поступлений за выбранный период нет"
        minWidth="1240px"
      />
      {total > take ? (
        <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">Показаны последние {take} операций из {total.toLocaleString("ru-RU")} за период. Для полного среза используйте экспорт.</p>
      ) : null}
    </main>
  );
}
