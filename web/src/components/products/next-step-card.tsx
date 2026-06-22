"use client";

import Link from "next/link";
import { ArrowUpRight, RotateCcw } from "lucide-react";
import type { NextStepRecommendation } from "@/lib/product-recommendations";

// B441 (M28): extracted from chat-analysis-actions so every service result can
// reuse the single «следующий шаг» funnel card (бордовая поверхность с
// рекомендацией следующей услуги + присоединённой кнопкой «начать новый разбор»).
// The recommendation itself comes from getNextStepRecommendation (single source).
export function NextStepCard({
  rec,
  onStartNew,
  loading,
  testIdPrefix,
  startNewLabel = "Начать новый разбор",
}: {
  rec: NextStepRecommendation | null;
  onStartNew: () => void;
  loading: boolean;
  testIdPrefix: string;
  startNewLabel?: string;
}) {
  return (
    <div className="overflow-hidden rounded-[20px]" style={{ background: "var(--soft-bordeaux)" }}>
      {rec && (
        <div className="p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "#E9B59B" }}>
            {rec.eyebrow}
          </p>
          <p className="mt-2 font-heading text-[1.3rem] leading-snug" style={{ color: "#FFF4E8" }}>{rec.name}</p>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "rgba(251,240,225,0.82)" }}>{rec.reason}</p>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Link
              href={rec.href}
              data-testid={`${testIdPrefix}-next-step`}
              className="inline-flex items-center gap-2 rounded-full bg-[#FBF0E1] px-5 py-2.5 text-sm font-semibold text-[var(--soft-bordeaux)] transition hover:brightness-[1.04]"
            >
              {rec.cta}
              <ArrowUpRight className="size-4" aria-hidden="true" />
            </Link>
            <span className="text-sm" style={{ color: "rgba(251,240,225,0.66)" }}>{rec.price}</span>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={onStartNew}
        disabled={loading}
        data-testid={`${testIdPrefix}-start-new`}
        className="flex w-full items-center justify-center gap-2 px-6 py-3.5 text-sm font-medium transition hover:bg-[rgba(255,255,255,0.06)] disabled:opacity-50"
        style={rec
          ? { borderTop: "1px solid rgba(251,240,225,0.16)", color: "rgba(251,240,225,0.9)" }
          : { color: "rgba(251,240,225,0.9)" }}
      >
        <RotateCcw className="size-4" aria-hidden="true" />
        {startNewLabel}
      </button>
    </div>
  );
}
