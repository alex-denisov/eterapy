import Link from "next/link";
import { Pencil, Sparkles } from "lucide-react";
import db from "@/lib/db";
import { GOAL_STATUS_LABELS, parseCarePlanGoals } from "@/lib/care-plan";
import { formatMskDayMonth } from "@/lib/msk-time";
import { appUrl } from "@/lib/subdomain";

// B466 — «План» (mockup -client-plan, «План сопровождения»): цели с
// прогресс-барами, методы (AI выделяет из транскриптов → практик правит),
// фокус следующей сессии. Owner: прогресс НЕ авто — AI предлагает обновление,
// практик подтверждает (баннер → экран редактирования).

export async function CardPlan({ practitionerId, clientId }: { practitionerId: string; clientId: string }) {
  const plan = await db.clientCarePlan.findUnique({
    where: { practitionerId_clientId: { practitionerId, clientId } },
    select: { goals: true, methods: true, nextFocus: true, aiSuggestion: true, aiSuggestedAt: true, updatedAt: true },
  });
  const goals = parseCarePlanGoals(plan?.goals);

  if (!plan || (goals.length === 0 && plan.methods.length === 0 && plan.nextFocus.length === 0)) {
    return (
      <section className="soft-card mt-5 p-5 text-center" data-testid="client-card-plan-empty">
        <p className="soft-h3" style={{ color: "var(--soft-bordeaux)" }}>Плана сопровождения ещё нет</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Задайте цели и методы работы — после каждой сессии AI будет предлагать обновления, а вы подтверждать.
        </p>
        <Link href={appUrl(`/practitioner/clients/${clientId}/plan/edit`)} className="soft-button soft-button-primary mt-4 inline-flex">
          Создать план
        </Link>
      </section>
    );
  }

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="client-card-plan">
      {/* AI-предложение */}
      {plan.aiSuggestion != null && (
        <Link
          href={appUrl(`/practitioner/clients/${clientId}/plan/edit`)}
          className="soft-card block p-4 transition-shadow hover:shadow-[0_10px_24px_rgba(60,40,25,.07)]"
          style={{ borderLeft: "3px solid var(--soft-terracotta)" }}
        >
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Sparkles className="h-4 w-4" style={{ color: "var(--soft-amber-ink,#6E5114)" }} />
            AI предложил обновление после сессии
          </p>
          <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">Подтвердите или поправьте — план меняется только после вас</p>
        </Link>
      )}

      {/* Цели */}
      <section className="soft-card p-4 sm:p-5">
        <div className="flex items-baseline justify-between gap-2">
          <p className="soft-eyebrow">Цели</p>
          <span className="text-xs text-[var(--soft-ink-faint)]">обновлён {formatMskDayMonth(plan.updatedAt)}</span>
        </div>
        <div className="mt-3 flex flex-col gap-3.5">
          {goals.map((goal) => (
            <div key={goal.id} data-testid="client-plan-goal">
              <div className="flex items-center justify-between gap-2">
                <p className="min-w-0 flex-1 text-sm font-medium">{goal.title}</p>
                <span className="shrink-0 text-xs tabular-nums text-[var(--soft-ink-faint)]">
                  {goal.status === "new" ? GOAL_STATUS_LABELS.new : `${goal.progress}%`}
                </span>
              </div>
              <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-[var(--soft-paper-deep)]">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${goal.progress}%`,
                    background: goal.status === "done" ? "var(--soft-sage-ink,#4B6146)" : "var(--soft-bordeaux)",
                  }}
                />
              </div>
            </div>
          ))}
        </div>
        <p className="mt-3 border-t border-[var(--soft-paper-deep)] pt-2.5 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
          AI предлагает обновление прогресса после каждой сессии — вы подтверждаете или корректируете.
        </p>
      </section>

      {/* Методы */}
      {plan.methods.length > 0 && (
        <section className="soft-card p-4 sm:p-5">
          <p className="soft-eyebrow">Методы</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {plan.methods.map((method) => (
              <span key={method} className="soft-chip">{method}</span>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
            AI выделяет применённые методы из разборов сессий — редактируйте и дополняйте на экране плана.
          </p>
        </section>
      )}

      {/* Фокус следующей сессии */}
      {plan.nextFocus.length > 0 && (
        <section className="soft-card p-4 sm:p-5">
          <p className="soft-eyebrow">Фокус следующей сессии</p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {plan.nextFocus.map((item) => (
              <li key={item} className="flex gap-2 text-sm text-[var(--soft-ink-soft)]">
                <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--soft-terracotta)]" />
                {item}
              </li>
            ))}
          </ul>
        </section>
      )}

      <Link href={appUrl(`/practitioner/clients/${clientId}/plan/edit`)} className="soft-button soft-button-ghost w-fit">
        <Pencil className="size-4" aria-hidden="true" />
        Редактировать план
      </Link>
    </div>
  );
}
