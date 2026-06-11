"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { ArrowRight, CheckCircle2, Star } from "lucide-react";
import { ProductPurchaseControls } from "@/components/products/product-purchase-controls";
import { appUrl } from "@/lib/subdomain";
import { getProductPriceLabel, getProductCreditCost } from "@/lib/product-prices";
import { formatPoints } from "@/lib/points";

// B366: prices/баллы derive from the single billing source.
const DEEP_COST = getProductCreditCost("deep-report") ?? 3;
const BUNDLE_COST = getProductCreditCost("full-question") ?? 4;

export function FullQuestionBundleOffer({
  dialogueId,
  onUnlocked,
}: {
  dialogueId?: string | null;
  onUnlocked?: () => void;
}) {
  const { status } = useSession();
  const [bundleActive, setBundleActive] = useState(false);
  const perspectivesHref = dialogueId
    ? `/products/perspectives?dialogueId=${encodeURIComponent(dialogueId)}`
    : "/products/perspectives";

  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    fetch("/api/billing/entitlements?productKey=full-question")
      .then((response) => response.json())
      .then((payload: { active?: boolean }) => {
        if (!cancelled) setBundleActive(Boolean(payload.active));
      })
      .catch(() => undefined);

    return () => { cancelled = true; };
  }, [status]);

  if (bundleActive) return null;

  return (
    <section className="mt-5" data-testid="full-question-bundle-offer">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="soft-eyebrow">выберите глубину</p>
          <h3 className="soft-h3 mt-1">Один вопрос — три способа продолжить</h3>
        </div>
        <p className="max-w-md text-sm text-[var(--soft-ink-soft)]">
          Бандл открывает полную картину и подробный разбор из одного контекста.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-3">
        <article className="rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4">
          <p className="soft-eyebrow">отчёт</p>
          <h4 className="mt-2 font-heading text-lg font-semibold text-[var(--soft-ink)]">Подробный разбор</h4>
          <p className="mt-2 font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">{getProductPriceLabel("deep-report")}</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Документ-разбор с выводами, маршрутом и сохранением в Дневник.
          </p>
          <ProductPurchaseControls
            productKey="deep-report"
            label="Открыть отчёт"
            checkoutSource="deep-report-decoy-report"
            creditCost={DEEP_COST}
            onUnlocked={onUnlocked}
            className="mt-4"
          />
        </article>

        <article className="rounded-[var(--soft-radius-lg)] border border-[var(--soft-terracotta)] bg-[var(--soft-surface)] p-4 shadow-[0_10px_28px_-18px_rgba(140,64,42,.45)]">
          <div className="flex items-center justify-between gap-3">
            <p className="soft-eyebrow">рекомендуем</p>
            <span className="soft-badge soft-badge-warm shrink-0">
              <Star className="size-3.5" aria-hidden="true" />
              выгоднее
            </span>
          </div>
          <h4 className="mt-2 font-heading text-lg font-semibold text-[var(--soft-ink)]">Полный разбор</h4>
          <p className="mt-2 font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">{getProductPriceLabel("full-question")}</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Полная картина сначала, затем подробный разбор по тому же вопросу.
          </p>
          <div className="mt-3 flex items-center gap-2 text-xs text-[var(--soft-ink-faint)]">
            <CheckCircle2 className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            или −{formatPoints(BUNDLE_COST)}
          </div>
          <ProductPurchaseControls
            productKey="full-question"
            label="Открыть бандл"
            checkoutSource="deep-report-decoy-full-question"
            creditCost={BUNDLE_COST}
            onUnlocked={onUnlocked}
            className="mt-4"
          />
          <Link href={perspectivesHref} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--soft-bordeaux)] underline">
            Сначала открыть полную картину
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
        </article>

        <article className="rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4">
          <p className="soft-eyebrow">подписка</p>
          <h4 className="mt-2 font-heading text-lg font-semibold text-[var(--soft-ink)]">Premium</h4>
          <p className="mt-2 font-heading text-2xl font-semibold text-[var(--soft-bordeaux)]">1 290 ₽</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            35 баллов в месяц, полная картина и подробный разбор как якорные форматы.
          </p>
          <Link href={appUrl("/billing?plan=premium")} className="soft-button soft-button-ghost mt-4">
            Выбрать Premium
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </article>
      </div>
    </section>
  );
}
