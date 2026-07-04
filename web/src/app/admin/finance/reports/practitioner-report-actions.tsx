"use client";

import { Download, Eye } from "lucide-react";

export function PractitionerReportDownloadMenu({
  previewHref,
  downloadHref,
}: {
  previewHref: string;
  downloadHref: string;
}) {
  const separator = downloadHref.includes("?") ? "&" : "?";
  return (
    <div className="soft-admin-table-actions">
      <a
        className="soft-admin-icon-button"
        href={`${previewHref}${previewHref.includes("?") ? "&" : "?"}format=html`}
        target="_blank"
        rel="noopener noreferrer"
        title="Просмотреть отчет"
        aria-label="Просмотреть отчет"
      >
        <Eye className="size-3.5" aria-hidden="true" />
      </a>
      <div className="group relative inline-flex">
        <button
          type="button"
          className="soft-admin-icon-button"
          title="Скачать отчет"
          aria-label="Скачать отчет"
        >
          <Download className="size-3.5" aria-hidden="true" />
        </button>
        <div className="invisible absolute right-0 top-full z-30 min-w-40 pt-1 opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
          <div className="overflow-hidden rounded-lg border border-[var(--soft-paper-edge)] bg-white py-1 text-xs shadow-lg">
            <a className="block w-full px-3 py-2 text-left hover:bg-[var(--soft-surface)]" href={`${downloadHref}${separator}format=xlsx`}>
              Скачать XLSX
            </a>
            <a className="block w-full px-3 py-2 text-left hover:bg-[var(--soft-surface)]" href={`${downloadHref}${separator}format=csv`}>
              Скачать CSV
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
