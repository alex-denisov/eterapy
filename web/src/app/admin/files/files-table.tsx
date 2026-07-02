"use client";

import { useMemo } from "react";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";

export interface StoredFileRow {
  id: string;
  originalName: string;
  mimeType: string;
  path: string;
  kind: string;
  userName: string;
  userEmail: string;
  sizeBytes: number;
  createdAt: string;
}

function kindClass(kind: string): string {
  if (kind === "AVATAR") return "bg-primary/10 text-primary";
  if (kind === "DOCUMENT") return "bg-blue-500/10 text-blue-400";
  return "bg-purple-500/10 text-purple-400";
}

export function FilesTable({ rows }: { rows: StoredFileRow[] }) {
  const kinds = useMemo(() => Array.from(new Set(rows.map((r) => r.kind))).sort(), [rows]);
  const columns = useMemo<AdminCompactColumn[]>(() => [
    { key: "file", label: "Файл", sortable: true },
    {
      key: "kind",
      label: "Тип",
      sortable: true,
      filterKind: "select",
      options: kinds.map((kind) => ({ value: kind, label: kind })),
    },
    { key: "user", label: "Пользователь", sortable: true },
    { key: "size", label: "Размер", sortable: true, align: "right" },
    { key: "createdAt", label: "Дата", sortable: true, filterKind: "date" },
  ], [kinds]);

  return (
    <div data-testid="admin-files-table">
      <AdminCompactDataTable
        columns={columns}
        rows={rows.map((file) => ({
          id: file.id,
          cells: {
            file: {
              kind: "node",
              filterValue: `${file.originalName} ${file.mimeType} ${file.path}`,
              sortValue: file.originalName,
              node: (
                <div className="flex min-w-0 items-center gap-2">
                  {file.mimeType.startsWith("image/") ? (
                    <a href={file.path} target="_blank" rel="noopener noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={file.path} alt="" className="h-8 w-8 rounded border border-[var(--soft-paper-edge)] object-cover" />
                    </a>
                  ) : (
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-[var(--soft-surface)] text-xs uppercase text-[var(--soft-ink-soft)]">
                      {file.mimeType.includes("pdf") ? "pdf" : file.mimeType.includes("audio") ? "aud" : "file"}
                    </div>
                  )}
                  <span className="min-w-0">
                    <span className="soft-admin-cell-truncate font-medium text-[var(--soft-ink)]">{file.originalName}</span>
                    <span className="soft-admin-cell-muted">{file.mimeType}</span>
                  </span>
                </div>
              ),
            },
            kind: {
              kind: "node",
              filterValue: file.kind,
              sortValue: file.kind,
              node: <span className={`rounded px-1.5 py-0.5 text-xs ${kindClass(file.kind)}`}>{file.kind}</span>,
            },
            user: { value: file.userName, subvalue: file.userEmail, filterValue: `${file.userName} ${file.userEmail}` },
            size: { value: `${(file.sizeBytes / 1024).toFixed(0)} КБ`, sortValue: file.sizeBytes, filterValue: `${Math.round(file.sizeBytes / 1024)}` },
            createdAt: {
              value: new Date(file.createdAt).toLocaleDateString("ru-RU"),
              sortValue: new Date(file.createdAt).getTime(),
              filterValue: new Date(file.createdAt).toLocaleDateString("ru-RU"),
            },
          },
        }))}
        empty="Файлов нет"
        minWidth="920px"
      />
    </div>
  );
}
