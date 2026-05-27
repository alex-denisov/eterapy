import Link from "next/link";
import { ArrowRight, Sparkles, Check } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { PageContainer } from "@/components/ui/page-container";
import { DailyPracticeActions } from "@/components/cabinet/daily-practice-actions";
import { getOrCreateDailyCard, dailyCardDate } from "@/lib/daily-card";
import { mainUrl } from "@/lib/subdomain";

const WEEKDAY_RU = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

async function loadStreakStrip(userId: string): Promise<Array<{ key: string; label: string; done: boolean; isToday: boolean }>> {
  const today = dailyCardDate(new Date());
  const sevenAgo = new Date(today);
  sevenAgo.setUTCDate(sevenAgo.getUTCDate() - 6);

  // We treat "completed" as a DailyCard row with completedAt set in the
  // last 7 days (the daily-card POST handler stamps completedAt and
  // grants the +1 кредит ledger entry atomically).
  const cards = await db.dailyCard.findMany({
    where: {
      userId,
      cardDate: { gte: sevenAgo, lte: today },
      completedAt: { not: null },
    },
    select: { cardDate: true },
  });
  const doneByISO = new Set(cards.map((c) => c.cardDate.toISOString().slice(0, 10)));

  const strip: Array<{ key: string; label: string; done: boolean; isToday: boolean }> = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date(today);
    day.setUTCDate(day.getUTCDate() - i);
    const iso = day.toISOString().slice(0, 10);
    strip.push({
      key: iso,
      label: WEEKDAY_RU[day.getUTCDay()],
      done: doneByISO.has(iso),
      isToday: i === 0,
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
  const [strip, streak] = await Promise.all([
    loadStreakStrip(userId),
    loadTotalStreak(userId),
  ]);
  const completed = Boolean(card.completedAt);

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
            <DailyPracticeActions completed={completed} />
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

      {/* What you get */}
      <section className="mt-6 grid gap-4 md:grid-cols-3" data-testid="practice-value">
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

      {/* Differentiator: 7 дней — отдельный продукт */}
      <section className="mt-6 soft-card flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between" data-testid="practice-seven-days-link">
        <div>
          <p className="soft-eyebrow">если нужен маршрут с началом и концом</p>
          <h3 className="soft-h3 mt-2">7 дней к ясности — отдельный продукт</h3>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Один большой вопрос, неделя сфокусированной работы и итоговая карта. Не подменяет ежедневную
            практику — это разовый интенсив.
          </p>
        </div>
        <Link href={mainUrl("/products/seven-days")} className="soft-button soft-button-ghost shrink-0">
          Открыть маршрут
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </section>
    </PageContainer>
  );
}
