"use client";

import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  AdminCompactDataTable,
  type AdminCompactColumn,
  type AdminCompactRow,
} from "@/components/admin/compact-client-table";

export function FinanceReceiptsTable({
  columns,
  rows,
  empty,
  minWidth,
}: {
  columns: AdminCompactColumn[];
  rows: AdminCompactRow[];
  empty: string;
  minWidth: string;
}) {
  const router = useRouter();

  async function handleBulkAction(actionKey: string, selectedIds: string[]) {
    if (actionKey !== "provider-check") return;
    if (selectedIds.length === 0) {
      toast.error("Выберите операции для проверки");
      return;
    }

    const response = await fetch("/api/admin/finance/provider-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionIds: selectedIds }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) {
      toast.error(typeof payload.message === "string" ? payload.message : "Не удалось проверить операции у провайдера");
      return;
    }

    const errors = Array.isArray(payload.results)
      ? payload.results.filter((result: { outcome?: string }) => result.outcome === "error").length
      : 0;
    if (errors > 0) {
      toast.error(`Проверено: ${payload.checked ?? selectedIds.length}, ошибок: ${errors}`);
    } else {
      toast.success(`Проверено у провайдера: ${payload.checked ?? selectedIds.length}`);
    }
    router.refresh();
  }

  return (
    <AdminCompactDataTable
      columns={columns}
      selectable
      bulkActions={[{ key: "provider-check", label: "Проверить выбранные у провайдера", variant: "subtle" }]}
      onBulkAction={handleBulkAction}
      rows={rows}
      empty={empty}
      minWidth={minWidth}
    />
  );
}
