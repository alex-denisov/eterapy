"use client";

export function FinanceExportMenu({
  label,
  baseHref,
}: {
  label: string;
  baseHref: string;
}) {
  const separator = baseHref.includes("?") ? "&" : "?";
  return (
    <div className="group relative inline-block">
      <button type="button" className="soft-admin-action">
        {label}
      </button>
      <div className="invisible absolute right-0 top-full z-20 min-w-56 pt-2 text-sm opacity-0 transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
        <div className="overflow-hidden rounded-lg border border-[var(--soft-paper-edge)] bg-white py-1 shadow-lg">
          <a className="block w-full px-4 py-2 text-left hover:bg-[var(--soft-surface)]" href={`${baseHref}${separator}format=xlsx`}>
            Скачать XLSX
          </a>
          <a className="block w-full px-4 py-2 text-left hover:bg-[var(--soft-surface)]" href={`${baseHref}${separator}format=csv`}>
            Скачать CSV
          </a>
        </div>
      </div>
    </div>
  );
}
