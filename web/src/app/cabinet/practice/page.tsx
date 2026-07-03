import { Sparkles, Check, LockKeyhole, Leaf } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PageContainer } from "@/components/ui/page-container";
import { DailyPracticeActions } from "@/components/cabinet/daily-practice-actions";
import { getOrCreateDailyCard, dailyCardDate, dailyCardBeats } from "@/lib/daily-card";
import { getPracticeStreakSnapshot } from "@/lib/streaks";
import { daysWord, effectivePracticeStreak } from "@/lib/streak-display";
import { guardClientCabinet } from "@/lib/cabinet-access";

// Monday-based weekday labels for the «эта неделя» calendar.
const WEEKDAY_RU_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

type WeekDayCell = {
  key: string;
  label: string;
  dayNum: number;
  done: boolean;
  isToday: boolean;
  isFuture: boolean;
};

// G14: render the actual calendar week (Mon→Sun) so completed days fill in,
// today is highlighted, and days still ahead read as muted/coming — instead of
// an ambiguous trailing 7-day strip.
async function loadWeekStrip(userId: string): Promise<WeekDayCell[]> {
  const today = dailyCardDate(new Date());
  const mondayOffset = (today.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - mondayOffset);
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);

  // A "completed" day is a DailyCard with completedAt set (the daily-card POST
  // handler stamps completedAt and grants the +1 балл ledger entry atomically).
  const cards = await db.dailyCard.findMany({
    where: {
      userId,
      cardDate: { gte: monday, lte: sunday },
      completedAt: { not: null },
    },
    select: { cardDate: true },
  });
  const doneByISO = new Set(cards.map((c) => c.cardDate.toISOString().slice(0, 10)));

  const strip: WeekDayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setUTCDate(day.getUTCDate() + i);
    const iso = day.toISOString().slice(0, 10);
    strip.push({
      key: iso,
      label: WEEKDAY_RU_SHORT[i],
      dayNum: day.getUTCDate(),
      done: doneByISO.has(iso),
      isToday: day.getTime() === today.getTime(),
      isFuture: day.getTime() > today.getTime(),
    });
  }
  return strip;
}

export default async function ClarityPracticePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    // CabinetShell already handles unauthenticated → /login.
    return null;
  }
  guardClientCabinet(session.user.role); // Y6: client-only surface

  const { card } = await getOrCreateDailyCard(userId);
  const [strip, practiceStreak] = await Promise.all([
    loadWeekStrip(userId),
    getPracticeStreakSnapshot(userId),
  ]);
  const completed = Boolean(card.completedAt);
  const beats = dailyCardBeats(card.metadata);

  return (
    <PageContainer>
      {/* Hero: today's question (v4.2 daily-practice mockup) */}
      <section className="soft-card overflow-hidden p-7 md:p-10" data-testid="practice-today" style={{ background: "linear-gradient(160deg,#FFFCF5 0%,#F4D9C1 100%)" }}>
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">ежедневная практика</p>
            <h1
              className="mt-3 font-heading italic leading-snug text-[var(--soft-bordeaux)]"
              style={{ fontSize: "clamp(1.75rem, 2.6vw, 2.5rem)" }}
            >
              Сегодняшний вопрос
            </h1>
            <p className="mt-5 max-w-prose text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Запишите свой вопрос дня — то, что просит внимания прямо сейчас.
              ETerapy предложит взгляд дня и один маленький шаг, который можно сделать сегодня.
            </p>
            <DailyPracticeActions
              completed={completed}
              variant="full"
              prompt={card.prompt}
              perspective={beats.perspective}
              step={beats.step}
              initialReflection={card.reflectionText}
            />
          </div>
          <aside className="rounded-[1.5rem] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5">
            <div className="flex items-center justify-between">
              <p className="soft-eyebrow">эта неделя</p>
              {/* Round-5 #6a: счётчик показываем только для живой серии. */}
              {effectivePracticeStreak(practiceStreak.count, practiceStreak.lastDoneDate) > 0 && (
                <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--soft-terracotta-dark)]" data-testid="practice-streak-total">
                  <Sparkles className="size-3" aria-hidden="true" />
                  {practiceStreak.count} {daysWord(practiceStreak.count)} подряд
                </span>
              )}
            </div>
            {/* G14: real Mon→Sun week — done days fill terracotta with a check,
                today gets a ringed apricot tile, future days read as dashed/muted. */}
            <div className="mt-4 grid grid-cols-7 gap-1.5" data-testid="practice-streak-strip">
              {strip.map((day) => {
                const cellClass = day.done
                  ? "border-[var(--soft-terracotta-dark)] bg-[var(--soft-terracotta-dark)] text-[#FBF0E1]"
                  : day.isToday
                    ? "border-2 border-[var(--soft-terracotta-dark)] bg-[var(--soft-apricot)] text-[var(--soft-bordeaux)]"
                    : day.isFuture
                      ? "border border-dashed border-[var(--soft-paper-edge)] text-[var(--soft-ink-faint)] opacity-60"
                      : "border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] text-[var(--soft-ink-faint)]";
                return (
                  <div key={day.key} className="flex flex-col items-center gap-1" title={day.key}>
                    <span className="text-[10px] uppercase tracking-wide text-[var(--soft-ink-faint)]">{day.label}</span>
                    <div className={`grid aspect-square w-full place-items-center rounded-[10px] text-[12px] font-semibold ${cellClass}`}>
                      {day.done ? <Check className="size-3.5" aria-hidden="true" /> : day.dayNum}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-[var(--soft-ink-faint)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[4px] bg-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                пройдено
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[4px] border-2 border-[var(--soft-terracotta-dark)] bg-[var(--soft-apricot)]" aria-hidden="true" />
                сегодня
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[4px] border border-dashed border-[var(--soft-paper-edge)]" aria-hidden="true" />
                впереди
              </span>
            </div>
            <div
              className="mt-4 flex items-center justify-between gap-3 rounded-[14px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper)] px-4 py-3"
              data-testid="practice-streak-badge"
            >
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--soft-ink-faint)]">мягкий ритм</p>
                <p className="mt-1 text-sm font-semibold text-[var(--soft-bordeaux)]">
                  Лучший стрик: {practiceStreak.longest} {daysWord(practiceStreak.longest)}
                </p>
              </div>
              <Leaf className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
            </div>
          </aside>
        </div>
      </section>

      {/* B329: "зачем" gradient card — v4.2 mission_detail.jsx:82-86. */}
      <section
        className="mt-6 soft-card p-6 md:p-7"
        data-testid="practice-why"
        style={{ background: "linear-gradient(140deg, #FFFCF5, #F4D9C1)" }}
      >
        <p className="soft-eyebrow" style={{ color: "var(--soft-terracotta-dark)" }}>зачем</p>
        <p className="mt-3 font-heading italic text-[var(--soft-bordeaux)]" style={{ fontSize: 19, lineHeight: 1.55 }}>
          Ежедневная практика помогает не «делать что-то правильно», а замечать своё состояние раньше,
          чем оно превратится в тревогу или ссору.
        </p>
      </section>

      {/* B329: "как пройти" numbered steps — v4.2 mission_detail.jsx:89-101. */}
      <section className="mt-4 soft-card p-6 md:p-7" data-testid="practice-steps">
        <p className="soft-eyebrow mb-4">как пройти сегодня</p>
        <div className="flex flex-col gap-3">
          {[
            "Запишите свой вопрос дня — то, что правда просит внимания прямо сейчас",
            "Прочитайте взгляд дня — мягкий разворот в вашей ситуации",
            "Сделайте маленький шаг с рекомендацией — за пару минут",
          ].map((step, i) => (
            <div key={step} className="flex items-start gap-4">
              <div
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-semibold"
                style={{
                  background: completed ? "var(--soft-sage, #9DAE89)" : "var(--soft-terracotta-dark)",
                  color: "#FBF0E1",
                }}
              >
                {completed ? <Check className="size-4" aria-hidden="true" /> : i + 1}
              </div>
              <p className="pt-0.5 text-[15px] leading-relaxed text-[var(--soft-ink)]">{step}</p>
            </div>
          ))}
        </div>
      </section>

      {/* B329: 3-up value cards moved BELOW interactive blocks. */}
      <section className="mt-4 grid gap-4 md:grid-cols-3" data-testid="practice-value">
        {[
          {
            eyebrow: "вопрос",
            title: "Один вопрос в день",
            body: "Без чек-листов. Простой повод вернуться к себе на 5 минут.",
          },
          {
            eyebrow: "взгляд дня",
            title: "Маленький разворот",
            body: "Помогаем заметить, что вы уже знаете, но ещё не сказали себе вслух.",
          },
          {
            eyebrow: "балл",
            title: "+1 балл",
            body: "За каждую завершённую практику. Можно потратить на любой цифровой формат.",
          },
        ].map((item) => (
          <article key={item.title} className="soft-card p-5" data-testid="practice-value-card">
            <p className="soft-eyebrow">{item.eyebrow}</p>
            <h3 className="soft-h3 mt-2">{item.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{item.body}</p>
          </article>
        ))}
      </section>

      {/* B329: privacy/credit disclaimer — v4.2 mission_detail.jsx:108-115. */}
      <section className="mt-4 soft-card-flat flex items-start gap-3 p-4">
        <LockKeyhole className="size-4 shrink-0 text-[var(--soft-bordeaux)]" aria-hidden="true" />
        <p className="text-[13.5px] leading-relaxed text-[var(--soft-ink-soft)]">
          Прогресс практики засчитывается только за реальное действие — не за просмотр или открытие
          страницы. Баллы не выводятся деньгами и не тратятся на встречи со специалистами.
        </p>
      </section>
    </PageContainer>
  );
}
