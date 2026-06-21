"use client";

import Link from "next/link";
import { ArrowRight, Heart, Sparkles, type LucideIcon } from "lucide-react";
import { pointsWord } from "@/lib/points";

// #4/#11: shared «что дальше» / «что вам подойдет» recommendations block, in the
// exact card design of the checkin triage (soft-triage-primary cards + a «другие
// форматы» row of soft-triage-option cards + an elevated specialist card). Tarot
// and chat-analysis both render through this so the design stays identical.

export type TriagePrimary = {
  key: string;
  ribbon: string;
  icon: LucideIcon;
  title: string;
  description: string;
  priceMain?: string | null;
  priceSub?: string | null;
  ctaLabel: string;
  href?: string;
  onClick?: () => void;
  testId?: string;
};

export type TriageProduct = {
  slug: string;
  name: string;
  href: string;
  price?: string | null;
  creditCost?: number | null;
  icon?: LucideIcon;
};

export type TriageSpecialist = {
  name: string;
  rationale?: string | null;
  pricePerSession: number;
  href: string;
};

function PrimaryInner({ card }: { card: TriagePrimary }) {
  const Icon = card.icon;
  return (
    <>
      <span className="soft-triage-ribbon">{card.ribbon}</span>
      <div className="mt-2 flex items-start gap-3">
        <Icon className="mt-1 size-6 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <div>
          <h3 className="soft-h3">{card.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{card.description}</p>
        </div>
      </div>
      <div className="mt-auto flex items-end justify-between gap-4 pt-5">
        <div>
          {card.priceMain ? (
            <div className="font-heading text-2xl font-semibold leading-none text-[var(--soft-bordeaux)]">{card.priceMain}</div>
          ) : null}
          {card.priceSub ? <div className="mt-1 text-[11px] text-[var(--soft-ink-faint)]">{card.priceSub}</div> : null}
        </div>
        <span className="soft-button soft-button-primary text-sm">
          {card.ctaLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </span>
      </div>
    </>
  );
}

export function ServiceTriage({
  eyebrow,
  primary,
  secondary = [],
  specialist = null,
  specialistHref = "/practitioners",
  otherFormatsLabel = "другие форматы",
  testId = "service-triage",
}: {
  eyebrow: string;
  primary: TriagePrimary[];
  secondary?: TriageProduct[];
  specialist?: TriageSpecialist | null;
  specialistHref?: string;
  otherFormatsLabel?: string;
  testId?: string;
}) {
  return (
    <section className="mt-5" data-testid={testId} aria-label="Что можно сделать дальше">
      <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">{eyebrow}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 sm:items-stretch">
        {primary.map((card) =>
          card.href ? (
            <Link key={card.key} href={card.href} className="soft-card soft-triage-primary flex flex-col p-5" data-testid={card.testId ?? "triage-primary-cta"}>
              <PrimaryInner card={card} />
            </Link>
          ) : (
            <button
              key={card.key}
              type="button"
              onClick={card.onClick}
              className="soft-card soft-triage-primary flex w-full flex-col p-5 text-left"
              data-testid={card.testId ?? "triage-primary-cta"}
            >
              <PrimaryInner card={card} />
            </button>
          ),
        )}
      </div>

      <p className="soft-eyebrow mt-4 text-[var(--soft-terracotta-dark)]">{otherFormatsLabel}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2" data-testid="triage-secondary-options">
        {secondary.map((item) => {
          const Icon = item.icon ?? Sparkles;
          return (
            <Link key={item.slug} href={item.href} className="soft-triage-option" data-testid="triage-secondary-option">
              <Icon className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[var(--soft-ink)]">{item.name}</span>
                {item.creditCost != null && (
                  <span className="block text-[11px] text-[var(--soft-ink-faint)]">или −{item.creditCost} {pointsWord(item.creditCost)}</span>
                )}
              </span>
              {item.price ? <span className="font-heading font-semibold text-[var(--soft-bordeaux)]">{item.price}</span> : null}
            </Link>
          );
        })}

        <Link
          href={specialist?.href ?? specialistHref}
          className="soft-triage-option sm:col-span-2 ring-1 ring-[var(--soft-terracotta-dark)] bg-[var(--soft-paper-card)]"
          data-testid="specialist-recommendation"
        >
          <Heart className="size-4 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="block truncate font-medium text-[var(--soft-ink)]">{specialist?.name ?? "Встреча со специалистом"}</span>
              <span className="rounded-full bg-[var(--soft-terracotta-dark)] px-2 py-0.5 text-[9px] uppercase tracking-wide text-[#FBF0E1]">человек рядом</span>
            </span>
            <span className="block truncate text-[11px] text-[var(--soft-ink-faint)]">
              {specialist?.rationale ?? "живое сопровождение, когда нужно"}
            </span>
          </span>
          {specialist ? (
            <span className="font-heading font-semibold text-[var(--soft-bordeaux)]">
              от {specialist.pricePerSession.toLocaleString("ru-RU")} ₽
            </span>
          ) : null}
        </Link>
      </div>
    </section>
  );
}
