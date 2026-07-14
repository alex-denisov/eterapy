export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, LogOut } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { getClarityCreditBalance } from "@/lib/clarity-credits";
import { getSubscriptionPlan } from "@/lib/entitlements";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { CLIENT_MORE_SECTIONS } from "@/lib/nav-model";
import { NAV_ICONS } from "@/components/nav/nav-icons";
import { appUrl, loginUrl, logoutUrl } from "@/lib/subdomain";

// B512 §3.3 — клиентский «Ещё»-хаб (mockup client-mobile-home-v2, экран 2):
// настоящая страница вместо bottom-sheet, зеркало практикского
// /practitioner/more. Профиль-карточка + секции «Кабинет» (Записи · Сообщения ·
// Кошелёк · Приглашения) / «Платформа» (кросс-shell лендинг-переходы; заменяет
// голый «На сайт») / «Аккаунт» (Настройки · Поддержка) + «Выйти».

function HubRow({
  href,
  icon,
  tone,
  label,
  count,
  meta,
}: {
  href: string;
  icon: React.ReactNode;
  tone?: "plat";
  label: string;
  count?: number;
  meta?: string;
}) {
  return (
    <Link
      href={href}
      data-testid="client-more-row"
      className="flex min-h-12 items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
    >
      <span
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]"
        style={
          tone === "plat"
            ? { background: "var(--soft-lilac-bg, #EFEAF6)", color: "#6E5BA6" }
            : { background: "var(--soft-paper-deep)", color: "var(--soft-terracotta-dark)" }
        }
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{label}</span>
      {typeof count === "number" && count > 0 && (
        <span
          className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-[var(--soft-apricot)] px-1.5 text-[11px] font-bold text-[var(--soft-bordeaux)] tabular-nums"
          aria-label={`${count} новых`}
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
      {meta && (
        <span className="shrink-0 text-xs font-bold tabular-nums text-[var(--soft-terracotta-dark)]">{meta}</span>
      )}
      <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" aria-hidden="true" />
    </Link>
  );
}

export default async function ClientMorePage() {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  guardClientCabinet(session.user.role);
  const userId = session.user.id;

  const [activeSub, credits, upcomingBookings, unreadMessages] = await Promise.all([
    db.userSubscription.findFirst({
      where: {
        userId,
        status: { in: ["TRIALING", "ACTIVE"] },
        OR: [{ currentPeriodEnd: null }, { currentPeriodEnd: { gt: new Date() } }],
      },
      select: { planKey: true },
      orderBy: { createdAt: "desc" },
    }).catch(() => null),
    getClarityCreditBalance(userId).catch(() => 0),
    db.booking.count({
      where: { clientId: userId, status: { in: ["PENDING", "CONFIRMED"] }, slot: { startAt: { gt: new Date() } } },
    }).catch(() => 0),
    db.practitionerClientMessage.count({ where: { clientId: userId, readAt: null } }).catch(() => 0),
  ]);

  const name = session.user.name ?? session.user.email ?? "Мой кабинет";
  const initial = name[0]?.toUpperCase() ?? "?";
  const planName = activeSub ? getSubscriptionPlan(activeSub.planKey)?.name ?? activeSub.planKey : null;
  const tariffLabel = planName ? `Тариф ${planName}` : "Бесплатный тариф";

  // Мета/каунтеры по строкам «Кабинета» (mockup: Записи·Сообщения — каунтер,
  // Кошелёк — баланс).
  function rowExtras(label: string): { count?: number; meta?: string } {
    if (label === "Записи") return { count: upcomingBookings };
    if (label === "Сообщения") return { count: unreadMessages };
    if (label === "Кошелёк") return { meta: String(credits) };
    return {};
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6 md:py-8" style={{ paddingBottom: 80 }} data-testid="client-more-page">
      <p className="soft-eyebrow">кабинет</p>
      <h1 className="soft-h1 mt-2">Ещё</h1>

      {/* Профиль-карточка → Настройки */}
      <Link
        href={appUrl("/settings")}
        data-testid="client-more-profile-card"
        className="mt-4 flex items-center gap-3.5 rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 transition-shadow hover:shadow-[0_10px_24px_rgba(60,40,25,.07)]"
      >
        <span
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full text-lg font-semibold text-white"
          style={{ background: "linear-gradient(135deg, var(--soft-terracotta), var(--soft-bordeaux))", fontFamily: "var(--font-heading-v4, serif)" }}
        >
          {initial}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-base font-semibold">{name}</span>
          <span className="mt-0.5 block truncate text-xs text-[var(--soft-ink-faint)]">{tariffLabel}</span>
        </span>
        <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[var(--soft-ink-faint)]" aria-hidden="true" />
      </Link>

      {CLIENT_MORE_SECTIONS.map((section) => (
        <section key={section.heading} className="mt-5" data-testid="client-more-section">
          <p className="soft-eyebrow mb-2">{section.heading}</p>
          <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
            {section.items.map((item) => {
              const Icon = NAV_ICONS[item.iconKey];
              return (
                <HubRow
                  key={item.href}
                  href={item.href}
                  icon={<Icon className="h-[18px] w-[18px]" aria-hidden="true" />}
                  tone={section.heading === "Платформа" ? "plat" : undefined}
                  label={item.label}
                  {...rowExtras(item.label)}
                />
              );
            })}
          </div>
        </section>
      ))}

      {/* Выйти */}
      <div className="mt-5 overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
        <a
          href={logoutUrl()}
          data-testid="client-more-logout"
          className="flex min-h-12 items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
        >
          <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px]" style={{ background: "#F6DEDE", color: "var(--soft-bordeaux)" }}>
            <LogOut className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>
          <span className="flex-1 text-sm font-medium text-[var(--soft-bordeaux)]">Выйти</span>
        </a>
      </div>
    </div>
  );
}
