"use client";

import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";

export interface VideoSessionRow {
  id: string;
  clientName: string;
  clientEmail: string;
  practitionerName: string;
  status: string;
  roomName: string;
  durationMin: number | null;
  createdAt: string;
  recordingUrl: string | null;
  recordingExpiry: string | null;
}

const STATUS_META: Record<string, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  WAITING: { label: "Ожидание", tone: "warn" },
  ACTIVE: { label: "Активна", tone: "ok" },
  RECORDING: { label: "Запись", tone: "ok" },
  ENDED: { label: "Завершена", tone: "neutral" },
  FAILED: { label: "Ошибка", tone: "danger" },
};

const sessionColumns: AdminCompactColumn[] = [
  { key: "participants", label: "Клиент → Практик", sortable: true },
  {
    key: "status",
    label: "Статус",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "WAITING", label: "Ожидание" },
      { value: "ACTIVE", label: "Активна" },
      { value: "RECORDING", label: "Запись" },
      { value: "ENDED", label: "Завершена" },
      { value: "FAILED", label: "Ошибка" },
    ],
  },
  { key: "roomName", label: "Комната", sortable: true },
  { key: "duration", label: "Длительность", sortable: true, align: "right" },
  { key: "createdAt", label: "Дата", sortable: true, filterKind: "date" },
  {
    key: "recording",
    label: "Запись",
    sortable: true,
    filterKind: "select",
    options: [
      { value: "есть запись", label: "Есть запись" },
      { value: "нет записи", label: "Нет записи" },
    ],
    align: "center",
  },
];

function formatAdminDateTime(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export function SessionsTable({ rows }: { rows: VideoSessionRow[] }) {
  return (
    <div data-testid="admin-sessions-table">
      <AdminCompactDataTable
        columns={sessionColumns}
        rows={rows.map((session) => {
          const meta = STATUS_META[session.status] ?? { label: session.status, tone: "neutral" as const };
          const hasRecording = Boolean(session.recordingUrl);
          return {
            id: session.id,
            cells: {
              participants: {
                value: session.clientName,
                subvalue: `${session.clientEmail} → ${session.practitionerName}`,
                filterValue: `${session.clientName} ${session.clientEmail} ${session.practitionerName}`,
                sortValue: `${session.clientName} ${session.practitionerName}`,
              },
              status: {
                kind: "status",
                label: meta.label,
                tone: meta.tone,
                filterValue: `${session.status} ${meta.label}`,
              },
              roomName: {
                value: session.roomName,
                title: session.roomName,
              },
              duration: {
                value: session.durationMin !== null ? `${session.durationMin} мин` : "—",
                sortValue: session.durationMin ?? -1,
                filterValue: session.durationMin !== null ? String(session.durationMin) : "",
              },
              createdAt: {
                value: formatAdminDateTime(session.createdAt),
                sortValue: new Date(session.createdAt).getTime(),
                filterValue: formatAdminDateTime(session.createdAt),
              },
              recording: hasRecording
                ? {
                    kind: "link",
                    href: session.recordingUrl ?? "#",
                    icon: "download",
                    external: true,
                    title: session.recordingExpiry
                      ? `Скачать запись, доступна до ${formatAdminDateTime(session.recordingExpiry)}`
                      : "Скачать запись",
                    filterValue: "есть запись",
                    sortValue: 1,
                  }
                : { value: "—", filterValue: "нет записи", sortValue: 0 },
            },
          };
        })}
        empty="Нет видеосессий"
        minWidth="1120px"
      />
    </div>
  );
}
