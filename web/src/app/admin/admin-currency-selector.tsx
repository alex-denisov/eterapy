"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { AdminDisplayCurrency } from "./admin-currency";
import { restoreAdminCurrencyPreference, saveAdminCurrencyPreference } from "./admin-navigation-preferences";

const OPTIONS: Array<{ value: AdminDisplayCurrency; label: string }> = [
  { value: "RUB", label: "RUB · ₽" },
  { value: "USD", label: "USD · $" },
];

export function AdminCurrencySelector({
  basePath,
  currency,
  rateLabel,
}: {
  basePath: string;
  currency: AdminDisplayCurrency;
  rateLabel?: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateCurrency(nextCurrency: AdminDisplayCurrency) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextCurrency === "RUB") params.delete("currency");
    else params.set("currency", nextCurrency);
    const query = params.toString();
    saveAdminCurrencyPreference(nextCurrency);
    router.push(query ? `${basePath}?${query}` : basePath);
  }

  useEffect(() => {
    const explicit = searchParams.get("currency");
    if (explicit === "USD" || explicit === "RUB") {
      saveAdminCurrencyPreference(explicit);
      return;
    }
    const restored = restoreAdminCurrencyPreference();
    if (!restored || restored === currency || restored === "RUB") return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("currency", restored);
    router.replace(`${basePath}?${params.toString()}`);
  // The restore must run only when the selector mounts for the current page.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="inline-flex flex-wrap items-center gap-2 rounded-lg border border-[var(--soft-paper-edge)] bg-white px-2 py-1 text-xs text-[var(--soft-ink-soft)]">
      <label className="inline-flex items-center gap-2">
        <span className="font-semibold text-[var(--soft-ink)]">Валюта</span>
        <select
          aria-label="Валюта отображения финансовых данных"
          className="rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-2 py-1 font-semibold text-[var(--soft-ink)] outline-none focus:border-[var(--soft-bordeaux)]"
          value={currency}
          onChange={(event) => updateCurrency(event.target.value as AdminDisplayCurrency)}
        >
          {OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {rateLabel ? <span className="whitespace-nowrap border-l border-[var(--soft-paper-edge)] pl-2 font-medium tabular-nums text-[var(--soft-bordeaux)]">{rateLabel}</span> : null}
    </div>
  );
}
