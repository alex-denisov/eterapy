export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import {
  BadgeCheck,
  ChevronRight,
  CircleHelp,
  Gift,
  LogOut,
  Settings,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Star,
} from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getActivePractitionerPlanKey } from "@/lib/practitioner-entitlements";
import { getPractitionerAiQuota } from "@/lib/practitioner-ai-quota-db";
import { practitionerTierBadge, practitionerTierFromPlanKey } from "@/lib/practitioner-tier";
import { categoryLabel } from "@/lib/practitioner-taxonomy";
import { appUrl, loginUrl, logoutUrl } from "@/lib/subdomain";

// B466 — «Ещё» hub (Practice cockpit IA). The former flat sidebar pages live
// here as grouped rows: Практика (услуги · отзывы · приглашения) + Аккаунт
// (этика · настройки · помощь · выйти), topped by the profile summary card.

function HubRow({
  href,
  icon,
  tone,
  label,
  meta,
}: {
  href: string;
  icon: React.ReactNode;
  tone?: "warm" | "sage" | "calm";
  label: string;
  meta?: string;
}) {
  const toneStyle =
    tone === "warm"
      ? { background: "#F6E7DD", color: "var(--soft-terracotta-dark)" }
      : tone === "sage"
        ? { background: "var(--soft-sage, #E4EADF)", color: "var(--soft-sage-ink, #4B6146)" }
        : { background: "var(--soft-paper-deep)", color: "var(--soft-ink-soft)" };
  return (
    <Link href={href} data-testid="practitioner-more-row" className="flex min-h-12 items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={toneStyle}>
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      {meta && <span className="shrink-0 text-xs text-[var(--soft-ink-faint)]">{meta}</span>}
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
    </Link>
  );
}

// Мобильная строка «Ещё» (mockup .row): иконка · заголовок(flex) · meta · шеврон.
function HubRowMobile({
  href,
  icon,
  tone,
  label,
  meta,
}: {
  href: string;
  icon: React.ReactNode;
  tone?: "warm" | "sage";
  label: string;
  meta?: string;
}) {
  return (
    <Link href={href} className="pcab-row" data-testid="more-row-mobile">
      <span className={`pcab-row-ic${tone ? ` ${tone}` : ""}`}>{icon}</span>
      <span className="pcab-hrow-t">{label}</span>
      {meta && <span className="pcab-hrow-meta">{meta}</span>}
      <ChevronRight className="pcab-chev" size={18} aria-hidden="true" />
    </Link>
  );
}

export default async function PractitionerMorePage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const userId = session.user!.id!;
  const practitioner = await db.practitioner.findUnique({
    where: { userId },
    select: {
      title: true,
      verified: true,
      categories: true,
      directions: true,
      ratingSum: true,
      reviewCount: true,
      user: { select: { name: true, email: true } },
    },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const practitionerRow = await db.practitioner.findUnique({ where: { userId }, select: { id: true } });
  const [planKey, quota] = await Promise.all([
    getActivePractitionerPlanKey(userId),
    practitionerRow ? getPractitionerAiQuota(practitionerRow.id, userId) : Promise.resolve(null),
  ]);
  const tier = practitionerTierFromPlanKey(planKey);
  const name = practitioner.user.name ?? practitioner.user.email ?? "Специалист";
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
  const rating = practitioner.reviewCount > 0
    ? (practitioner.ratingSum / practitioner.reviewCount).toFixed(1).replace(".", ",")
    : null;
  const servicesMeta = practitioner.categories.length > 0
    ? `${categoryLabel(practitioner.categories[0])}${practitioner.directions.length > 0 ? ` · ${practitioner.directions.length}` : ""}`
    : undefined;

  const reviewWord = practitioner.reviewCount === 1 ? "отзыв" : practitioner.reviewCount < 5 ? "отзыва" : "отзывов";

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 по mockup practitioner-more-hub */}
      <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-more-mobile">
        <div style={{ marginTop: 2 }}>
          <div className="pcab-eyebrow">Кабинет практика</div>
          <h1 className="pcab-greeting">Ещё</h1>
        </div>

        <Link href={appUrl("/practitioner/profile")} className="pcab-pcard" data-testid="more-profile-card-mobile">
          <span className="pcab-pcard-av">{initials || "?"}</span>
          <span className="pcab-pcard-main">
            <span className="pcab-pcard-name">
              <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
              {practitioner.verified && (
                <BadgeCheck size={16} style={{ color: "var(--pc-sage-ink)", flex: "none" }} aria-label="Верифицирован" />
              )}
              <span className="pcab-tierchip">{practitionerTierBadge(tier)}</span>
            </span>
            {practitioner.title && <span className="pcab-pcard-sub">{practitioner.title}</span>}
            {rating && (
              <span className="pcab-pcard-rating">
                <Star size={13} style={{ fill: "currentColor" }} aria-hidden="true" />
                {rating} · {practitioner.reviewCount} {reviewWord}
              </span>
            )}
          </span>
          <span className="pcab-pcard-cta">Профиль</span>
        </Link>

        <section className="pcab-group">
          <div className="pcab-eyebrow" style={{ marginBottom: 9 }}>Практика</div>
          <div className="pcab-list">
            <HubRowMobile href={appUrl("/practitioner/ai-usage")} icon={<Sparkles size={18} aria-hidden="true" />} tone="warm" label="Разборы и AI" meta={quota ? `${quota.usedThisMonth} из ${quota.included}` : undefined} />
            <HubRowMobile href={appUrl("/practitioner/services")} icon={<SlidersHorizontal size={18} aria-hidden="true" />} label="Услуги и направления" meta={servicesMeta} />
            <HubRowMobile href={appUrl("/practitioner/reviews")} icon={<Star size={18} aria-hidden="true" />} tone="warm" label="Отзывы" meta={rating ? `${rating} · ${practitioner.reviewCount}` : "пока нет"} />
            <HubRowMobile href={appUrl("/practitioner/invite")} icon={<Gift size={18} aria-hidden="true" />} tone="sage" label="Приглашения" meta="свои клиенты" />
          </div>
        </section>

        <section className="pcab-group">
          <div className="pcab-eyebrow" style={{ marginBottom: 9 }}>Аккаунт</div>
          <div className="pcab-list">
            <HubRowMobile href={appUrl("/practitioner/ethics")} icon={<Shield size={18} aria-hidden="true" />} label="Этика и безопасность" />
            <HubRowMobile href={appUrl("/practitioner/settings")} icon={<Settings size={18} aria-hidden="true" />} label="Настройки" />
            <HubRowMobile href={appUrl("/support")} icon={<CircleHelp size={18} aria-hidden="true" />} label="Помощь и поддержка" />
            <a href={logoutUrl()} className="pcab-row" data-testid="more-logout-mobile">
              <span className="pcab-row-ic warm"><LogOut size={18} aria-hidden="true" /></span>
              <span className="pcab-hrow-t" style={{ color: "var(--pc-bordeaux)" }}>Выйти</span>
            </a>
          </div>
        </section>
      </div>

      {/* ДЕСКТОП — прежний вид (ждёт новых десктоп-макетов R9-5) */}
      <div className="mx-auto hidden w-full max-w-2xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }}>
      <p className="soft-eyebrow">Кабинет практика</p>
      <h1 className="soft-h1 mt-2">Ещё</h1>

      {/* Profile summary card */}
      <Link
        href={appUrl("/practitioner/profile")}
        data-testid="practitioner-more-profile-card"
        className="mt-5 flex items-center gap-3.5 rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 transition-shadow hover:shadow-[0_10px_24px_rgba(60,40,25,.07)]"
      >
        <span
          className="flex h-[54px] w-[54px] shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
          style={{ background: "linear-gradient(135deg, var(--soft-terracotta), var(--soft-bordeaux))" }}
        >
          {initials || "?"}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-base font-semibold">
            <span className="truncate">{name}</span>
            {practitioner.verified && (
              <BadgeCheck className="h-4 w-4 shrink-0 text-[var(--soft-sage-ink,#4B6146)]" aria-label="Верифицирован" />
            )}
            <span
              className="shrink-0 rounded-full px-2 py-px text-[10.5px] font-semibold tracking-wide"
              style={{ background: "var(--soft-amber-bg, #F2E2C2)", color: "var(--soft-amber-ink, #6E5114)" }}
            >
              {practitionerTierBadge(tier)}
            </span>
          </span>
          <span className="mt-0.5 block truncate text-xs text-[var(--soft-ink-faint)]">{practitioner.title}</span>
          {rating && (
            <span className="mt-1 flex items-center gap-1 text-xs" style={{ color: "var(--soft-amber-ink, #6E5114)" }}>
              <Star className="h-3 w-3 fill-current" />
              {rating} · {practitioner.reviewCount}{" "}
              {practitioner.reviewCount === 1 ? "отзыв" : practitioner.reviewCount < 5 ? "отзыва" : "отзывов"}
            </span>
          )}
        </span>
        <span className="shrink-0 text-xs font-semibold text-[var(--soft-bordeaux)]">Профиль</span>
      </Link>

      {/* Практика */}
      <section className="mt-6">
        <p className="soft-eyebrow mb-2.5">Практика</p>
        <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
          <HubRow
            href={appUrl("/practitioner/ai-usage")}
            icon={<Sparkles className="h-[18px] w-[18px]" />}
            tone="warm"
            label="Разборы и AI"
            meta={quota ? `${quota.usedThisMonth} из ${quota.included}` : undefined}
          />
          <HubRow
            href={appUrl("/practitioner/services")}
            icon={<SlidersHorizontal className="h-[18px] w-[18px]" />}
            label="Услуги и направления"
            meta={servicesMeta}
          />
          <HubRow
            href={appUrl("/practitioner/reviews")}
            icon={<Star className="h-[18px] w-[18px]" />}
            tone="warm"
            label="Отзывы"
            meta={rating ? `${rating} · ${practitioner.reviewCount}` : "пока нет"}
          />
          <HubRow
            href={appUrl("/practitioner/invite")}
            icon={<Gift className="h-[18px] w-[18px]" />}
            tone="sage"
            label="Приглашения"
            meta="свои клиенты"
          />
        </div>
      </section>

      {/* Аккаунт */}
      <section className="mt-6">
        <p className="soft-eyebrow mb-2.5">Аккаунт</p>
        <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
          <HubRow
            href={appUrl("/practitioner/ethics")}
            icon={<Shield className="h-[18px] w-[18px]" />}
            label="Этика и безопасность"
          />
          <HubRow
            href={appUrl("/practitioner/settings")}
            icon={<Settings className="h-[18px] w-[18px]" />}
            label="Настройки"
          />
          <HubRow
            href={appUrl("/support")}
            icon={<CircleHelp className="h-[18px] w-[18px]" />}
            label="Помощь и поддержка"
          />
          <a
            href={logoutUrl()}
            data-testid="practitioner-more-logout"
            className="flex min-h-12 items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]" style={{ background: "#F6E7DD", color: "var(--soft-terracotta-dark)" }}>
              <LogOut className="h-[18px] w-[18px]" />
            </span>
            <span className="flex-1 text-sm font-medium text-[var(--soft-bordeaux)]">Выйти</span>
          </a>
        </div>
      </section>
      </div>
    </>
  );
}
