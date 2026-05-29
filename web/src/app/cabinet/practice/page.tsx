import Link from "next/link";
import { ArrowRight, Sparkles, Check, LockKeyhole, Compass, Leaf } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PageContainer } from "@/components/ui/page-container";
import { DailyPracticeActions } from "@/components/cabinet/daily-practice-actions";
import { getOrCreateDailyCard, dailyCardDate, dailyCardBeats } from "@/lib/daily-card";
import { mainUrl } from "@/lib/subdomain";

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
  // handler stamps completedAt and grants the +1 кредит ledger entry atomically).
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

async function loadTotalStreak(userId: string): Promise<number> {
  // Count consecutive days with completedAt ending today.
  const cards = await db.dailyCard.findMany({
    where: { userId, completedAt: { not: null } },
    orderBy: { cardDate: "desc" },
    take: 60,
    select: { cardDate: true },
  });
  if (cards.length === 0) return 0;
  let streak = 0;
  let cursor = dailyCardDate(new Date());
  for (const card of cards) {
    if (card.cardDate.getTime() === cursor.getTime()) {
      streak++;
      cursor = new Date(cursor);
      cursor.setUTCDate(cursor.getUTCDate() - 1);
    } else if (card.cardDate.getTime() < cursor.getTime()) {
      break;
    }
  }
  return streak;
}

export default async function ClarityPracticePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    // CabinetShell already handles unauthenticated → /login.
    return null;
  }

  const { card } = await getOrCreateDailyCard(userId);
  const [strip, streak, activeRoute] = await Promise.all([
    loadWeekStrip(userId),
    loadTotalStreak(userId),
    // B329: surface the user's active 7-day route on the practice page so
    // the daily ritual and the structured route live on one screen
    // (per docs/Design/v4.2/screens/mission_detail.jsx layout).
    db.clarityRoute.findFirst({
      where: { userId, status: { in: ["ACTIVE", "PAUSED"] } },
      orderBy: { updatedAt: "desc" },
      select: { id: true, title: true, status: true, currentDay: true },
    }),
  ]);
  const completed = Boolean(card.completedAt);
  const beats = dailyCardBeats(card.metadata);

  return (
    <PageContainer>
      {/* Hero: today's question (v4.2 daily-practice mockup) */}
      <section className="soft-card overflow-hidden p-7 md:p-10" data-testid="practice-today" style={{ background: "linear-gradient(160deg,#FFFCF5 0%,#F4D9C1 100%)" }}>
        <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="soft-eyebrow text-[var(--soft-terracotta-dark)]">сегодняшний вопрос ясности</p>
            <h1
              className="mt-3 font-heading italic leading-snug text-[var(--soft-bordeaux)]"
              style={{ fontSize: "clamp(1.75rem, 2.6vw, 2.5rem)" }}
            >
              {card.prompt}
            </h1>
            <p className="mt-5 max-w-prose text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              {card.body}
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
            <p className="soft-eyebrow">эта неделя</p>
            <div className="mt-4 grid grid-cols-7 gap-1.5" data-testid="practice-streak-strip">
              {strip.map((day) => {
                const filledClass = day.done
                  ? "border-[var(--soft-terracotta-dark)] bg-[var(--soft-terracotta-dark)] text-[#FBF0E1]"
                  : day.isToday
                    ? "border-[var(--soft-apricot)] bg-[var(--soft-apricot)] text-[var(--soft-bordeaux)]"
                    : "border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] text-[var(--soft-ink-faint)]";
                return (
                  <div
                    key={day.key}
                    className={`grid aspect-square place-items-center rounded-[10px] border text-[11px] font-semibold ${filledClass}`}
                    title={day.key}
                  >
                    {day.done ? <Check className="size-3" aria-hidden="true" /> : day.isToday ? "•" : day.label}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 flex items-center justify-between text-xs">
              <span className="text-[var(--soft-ink-soft)]" data-testid="practice-streak-total">
                {streak} {streak === 1 ? "день" : streak >= 2 && streak <= 4 ? "дня" : "дней"} подряд
              </span>
              <span className="inline-flex items-center gap-1 font-semibold text-[var(--soft-terracotta-dark)]">
                <Sparkles className="size-3" aria-hidden="true" />
                +1 за день
              </span>
            </p>
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
            "Открыть практику в момент паузы — обед, поездка, перед сном",
            "Ответить на вопрос дня — без редактирования",
            "Прочитать ракурс дня и примерить его на свою ситуацию",
            "Сделать маленький шаг, который предлагает практика",
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

      {/* B329: extra practice slot — docs §4 "Дополнительная практика 99 ₽ или 1 кредит". */}
      <section
        className="mt-4 soft-card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between"
        data-testid="practice-extra-slot"
      >
        <div>
          <p className="soft-eyebrow" style={{ color: "var(--soft-terracotta-dark)" }}>хочется ещё одну сегодня?</p>
          <h3 className="soft-h3 mt-2">Дополнительная практика — 99 ₽ или 1 кредит</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            {completed
              ? "Вы уже прошли сегодняшнюю — можно открыть ещё одну: новый вопрос, новый ракурс."
              : "Сначала завершите сегодняшнюю — а потом можно купить ещё одну на этот же день."}
          </p>
        </div>
        <Link
          href={mainUrl("/products/clarity-practice")}
          className="soft-button soft-button-primary shrink-0"
          data-testid="practice-extra-cta"
        >
          {completed ? "Купить ещё одну" : "Открыть продукт"}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
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
            eyebrow: "ракурс",
            title: "Маленький разворот",
            body: "Помогаем заметить, что вы уже знаете, но ещё не сказали себе вслух.",
          },
          {
            eyebrow: "кредит",
            title: "+1 кредит ясности",
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

      {/* B329: 7-day route — show current progress if active, else upsell. */}
      {activeRoute ? (
        <section
          className="mt-4 soft-card p-6 md:p-7"
          data-testid="practice-active-route"
          style={{ background: "linear-gradient(160deg, #F4D9C1, #F8E6D1)" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="soft-eyebrow" style={{ color: "var(--soft-terracotta-dark)" }}>ваш маршрут</p>
              <h3 className="soft-h3 mt-2">{activeRoute.title}</h3>
              <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
                День {activeRoute.currentDay} из 7 ·{" "}
                {activeRoute.status === "PAUSED" ? "на паузе" : "активен"}
              </p>
            </div>
            <Compass className="size-7 text-[var(--soft-bordeaux)]" aria-hidden="true" />
          </div>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/50">
            <div
              className="h-full rounded-full bg-[var(--soft-terracotta-dark)] transition-all"
              style={{ width: `${Math.round(((activeRoute.currentDay - 1) / 7) * 100)}%` }}
            />
          </div>
          <Link
            href={mainUrl("/products/seven-days")}
            className="soft-button soft-button-primary mt-5 inline-flex"
            data-testid="practice-route-continue"
          >
            Продолжить день {activeRoute.currentDay}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      ) : (
        <section
          className="mt-4 soft-card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between"
          data-testid="practice-seven-days-link"
        >
          <div>
            <p className="soft-eyebrow">если нужен маршрут с началом и концом</p>
            <h3 className="soft-h3 mt-2">7 дней к ясности — отдельный продукт</h3>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Один большой вопрос, неделя сфокусированной работы и итоговая карта. Не подменяет
              ежедневную практику — это разовый интенсив.
            </p>
          </div>
          <Link href={mainUrl("/products/seven-days")} className="soft-button soft-button-ghost shrink-0">
            <Leaf className="size-4" aria-hidden="true" />
            Открыть маршрут
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      )}

      {/* B329: privacy/credit disclaimer — v4.2 mission_detail.jsx:108-115. */}
      <section className="mt-4 soft-card-flat flex items-start gap-3 p-4">
        <LockKeyhole className="size-4 shrink-0 text-[var(--soft-bordeaux)]" aria-hidden="true" />
        <p className="text-[13.5px] leading-relaxed text-[var(--soft-ink-soft)]">
          Прогресс практики засчитывается только за реальное действие — не за просмотр или открытие
          страницы. Кредиты не выводятся деньгами и не тратятся на встречи со специалистами.
        </p>
      </section>
    </PageContainer>
  );
}
