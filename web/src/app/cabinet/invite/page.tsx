export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import Link from "next/link";
import { Gift, LifeBuoy } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { guardClientCabinet } from "@/lib/cabinet-access";
import { getReferralStats, getReferralCredits } from "@/lib/referral-stats";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { InviteLinkCard } from "@/components/cabinet/invite-link-card";

const STEPS: { title: string; body: string }[] = [
  { title: "Поделитесь ссылкой", body: "Отправьте её тому, кому может пригодиться бережный разбор." },
  { title: "Друг пробует разбор", body: "Он открывает свой первый разбор — спокойно и без обязательств." },
  { title: "Баллы приходят вам обоим", body: "Когда друг попробует, баллы получаете и вы, и он." },
];

export default async function CabinetInvitePage() {
  const session = await auth();
  if (!session?.user?.id) redirect(loginUrl());
  guardClientCabinet(session.user.role);
  const userId = session.user.id;

  const [stats, credits, latest] = await Promise.all([
    getReferralStats(userId),
    getReferralCredits(userId),
    db.dialogue.findFirst({
      where: { userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select: { safetyLevel: true },
    }),
  ]);

  // Crisis-guard: suppress the whole referral surface if the latest разбор was
  // flagged sensitive/crisis/blocked (doc 18 §23.3). Safety above monetization.
  const crisisGuard = ["sensitive", "crisis", "blocked"].includes(latest?.safetyLevel ?? "");

  if (crisisGuard) {
    return (
      <div className="p-6 md:p-8" data-testid="invite-page">
        <div className="soft-eyebrow">приглашения</div>
        <h1 className="soft-h1 mt-2">Это подождёт</h1>
        <div className="soft-card mt-5 p-6" data-testid="invite-crisis-guard">
          <p className="text-sm leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
            Сейчас важнее вы сами. Приглашения будут здесь, когда захотите вернуться к ним.
            Если тяжело — рядом есть поддержка.
          </p>
          <Link href={appUrl("/support")} className="soft-button soft-button-primary mt-4 inline-flex">
            <LifeBuoy className="size-4" aria-hidden="true" /> Поддержка
          </Link>
        </div>
      </div>
    );
  }

  const counter = [
    { n: stats.invited, label: "приглашены" },
    { n: stats.tried, label: "попробовали" },
    { n: stats.stayed, label: "остались" },
  ];

  return (
    <div className="max-w-4xl p-6 md:p-8" data-testid="invite-page">
      {/* Hero — owner-locked copy. */}
      <section
        className="soft-card p-6"
        data-testid="invite-hero"
        style={{ background: "linear-gradient(155deg, var(--soft-apricot) 0%, #F8E6D1 100%)", border: "1px solid transparent" }}
      >
        <p className="soft-eyebrow">подарите разбор — получите баллы</p>
        <h1 className="soft-h1 mt-2" style={{ color: "var(--soft-bordeaux)" }}>
          Подарите кому-то первый разбор — и пополните свой баланс
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed" style={{ color: "var(--soft-bordeaux)", opacity: 0.9 }}>
          Когда тот, кого вы позвали, попробует разбор, баллы придут вам обоим.
        </p>
        <div className="mt-5">
          <InviteLinkCard />
        </div>
      </section>

      {/* Earned / pending баллы (60-day expiry). */}
      <section className="mt-4 grid gap-4 sm:grid-cols-2">
        <div className="soft-card p-5" data-testid="invite-credits">
          <p className="soft-eyebrow">ваши баллы за приглашения</p>
          <div className="mt-2 flex items-baseline gap-4">
            <div>
              <p className="font-heading text-3xl font-semibold" style={{ color: "var(--soft-bordeaux)" }}>{credits.earned}</p>
              <p className="text-xs" style={{ color: "var(--soft-ink-soft)" }}>уже начислено</p>
            </div>
            {credits.pending > 0 && (
              <div>
                <p className="font-heading text-3xl font-semibold" style={{ color: "var(--soft-ink-faint)" }}>{credits.pending}</p>
                <p className="text-xs" style={{ color: "var(--soft-ink-soft)" }}>ждут подтверждения</p>
              </div>
            )}
          </div>
          <p className="mt-3 text-xs leading-relaxed" style={{ color: "var(--soft-ink-faint)" }}>
            Баллы за приглашения действуют 60 дней с момента начисления. Потратить их можно на цифровые разборы.
          </p>
        </div>

        {/* Staged friend-progress counter (no scoreboard). */}
        <div className="soft-card p-5" data-testid="invite-counter">
          <p className="soft-eyebrow">ваши приглашения</p>
          <div className="mt-3 flex gap-6">
            {counter.map((c) => (
              <div key={c.label}>
                <p className="font-heading text-3xl font-semibold" style={{ color: "var(--soft-bordeaux)" }}>{c.n}</p>
                <p className="text-xs" style={{ color: "var(--soft-ink-soft)" }}>{c.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3-step «как это работает». */}
      <section className="mt-4 soft-card p-6" data-testid="invite-steps">
        <p className="soft-eyebrow mb-4">как это работает</p>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <div key={step.title} className="rounded-[14px] border border-[var(--soft-paper-edge)] p-4">
              <span className="flex size-7 items-center justify-center rounded-full bg-[var(--soft-apricot)] text-sm font-bold text-[var(--soft-bordeaux)]">
                {i + 1}
              </span>
              <p className="mt-3 text-sm font-semibold" style={{ color: "var(--soft-ink)" }}>{step.title}</p>
              <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>{step.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 flex items-center gap-2 text-xs" style={{ color: "var(--soft-ink-faint)" }}>
          <Gift className="size-3.5" aria-hidden="true" />
          Это подарок близкому человеку, а не рассылка — приглашайте тех, кому это правда может помочь.
        </p>
      </section>
    </div>
  );
}
