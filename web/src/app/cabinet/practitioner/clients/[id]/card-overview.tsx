import Link from "next/link";
import { CalendarClock, ChevronRight, ClipboardList, Sparkles } from "lucide-react";
import db from "@/lib/db";
import { parseCarePlanGoals } from "@/lib/care-plan";
import { formatMskDayMonth, formatMskTime } from "@/lib/msk-time";
import { appUrl } from "@/lib/subdomain";
import { analysisState, type CardBooking } from "./card-types";

// B466 — «Обзор» (owner-дедупликация): кто клиент + статус одной строкой со
// ссылками в разделы + «требует внимания». БЕЗ полных списков.

export async function CardOverview({
  practitionerId,
  clientId,
  clientLabel,
  bookings,
}: {
  practitionerId: string;
  clientId: string;
  clientLabel: string;
  bookings: CardBooking[];
}) {
  const now = new Date();
  const plan = await db.clientCarePlan.findUnique({
    where: { practitionerId_clientId: { practitionerId, clientId } },
    select: { goals: true, aiSuggestion: true, aiSuggestedAt: true, updatedAt: true },
  });

  const lastContext = [...bookings].reverse().find((b) => b.meetingContext)?.meetingContext ?? null;
  const upcoming = bookings
    .filter((b) => ["CONFIRMED", "IN_PROGRESS"].includes(b.status) && b.slot && b.slot.endAt >= now)
    .sort((a, b) => a.slot!.startAt.getTime() - b.slot!.startAt.getTime())[0];
  const lastAnalyzed = [...bookings].reverse().find((b) => analysisState(b) === "ready");
  const goals = parseCarePlanGoals(plan?.goals);
  const avgProgress = goals.length > 0 ? Math.round(goals.reduce((s, g) => s + g.progress, 0) / goals.length) : null;

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="client-card-overview">
      {/* О клиенте */}
      <section className="soft-card p-4 sm:p-5">
        <p className="soft-eyebrow">О клиенте</p>
        {lastContext ? (
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Запрос: {lastContext}
          </p>
        ) : (
          <p className="mt-2 text-sm text-[var(--soft-ink-faint)]">
            Запрос не указан — он появится из контекста записи клиента.
          </p>
        )}
      </section>

      {/* Статус одной строкой — со ссылками в разделы */}
      <section className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
        <Link
          href={upcoming ? appUrl(`/practitioner/calendar/booking/${upcoming.id}`) : appUrl(`/practitioner/calendar/propose?client=${clientId}`)}
          className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
        >
          <CalendarClock className="h-[18px] w-[18px] shrink-0 text-[var(--soft-terracotta-dark)]" />
          <span className="min-w-0 flex-1 text-sm">
            {upcoming?.slot
              ? <>Ближайшая сессия — <span className="font-medium">{formatMskDayMonth(upcoming.slot.startAt)} в {formatMskTime(upcoming.slot.startAt)}</span></>
              : "Сессий впереди нет — предложите время"}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
        </Link>
        <Link href={appUrl(`/practitioner/clients/${clientId}?tab=plan`)} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40">
          <ClipboardList className="h-[18px] w-[18px] shrink-0 text-[var(--soft-ink-soft)]" />
          <span className="min-w-0 flex-1 text-sm">
            {goals.length > 0
              ? <>План сопровождения — {goals.length} {goals.length === 1 ? "цель" : goals.length < 5 ? "цели" : "целей"}{avgProgress !== null ? `, прогресс ~${avgProgress}%` : ""}</>
              : "Плана сопровождения ещё нет — создать"}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
        </Link>
        <Link
          href={lastAnalyzed ? appUrl(`/practitioner/sessions/${lastAnalyzed.id}`) : appUrl(`/practitioner/clients/${clientId}?tab=sessions`)}
          className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-[var(--soft-paper-deep)]/40"
        >
          <Sparkles className="h-[18px] w-[18px] shrink-0" style={{ color: "var(--soft-amber-ink,#6E5114)" }} />
          <span className="min-w-0 flex-1 text-sm">
            {lastAnalyzed?.slot
              ? <>Последний AI-разбор — сессия {formatMskDayMonth(lastAnalyzed.slot.startAt)}</>
              : "AI-разборов пока нет"}
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-[var(--soft-ink-faint)]" />
        </Link>
      </section>

      {/* Требует внимания */}
      {plan?.aiSuggestion != null && (
        <Link
          href={appUrl(`/practitioner/clients/${clientId}/plan/edit`)}
          className="soft-card block p-4 transition-shadow hover:shadow-[0_10px_24px_rgba(60,40,25,.07)]"
          style={{ borderLeft: "3px solid var(--soft-terracotta)" }}
          data-testid="client-card-ai-suggestion"
        >
          <p className="text-sm font-medium">AI предложил обновление плана после сессии</p>
          <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
            {clientLabel} · подтвердите или поправьте цели — без вашего подтверждения план не меняется
          </p>
        </Link>
      )}
    </div>
  );
}
