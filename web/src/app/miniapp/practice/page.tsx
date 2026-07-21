import { redirect } from "next/navigation";
import { Check, Leaf, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { DailyPracticeActions } from "@/components/cabinet/daily-practice-actions";
import { MiniAppProductFrame } from "@/components/miniapp/product-frame";
import { dailyCardBeats, dailyCardDate, getOrCreateDailyCard } from "@/lib/daily-card";
import { getPracticeStreakSnapshot } from "@/lib/streaks";
import { daysWord, effectivePracticeStreak } from "@/lib/streak-display";

const WEEKDAY_RU_SHORT = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];

async function weekStrip(userId: string) {
  const today = dailyCardDate(new Date());
  const monday = new Date(today);
  monday.setUTCDate(monday.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  const rows = await db.dailyCard.findMany({
    where: { userId, cardDate: { gte: monday, lte: sunday }, completedAt: { not: null } },
    select: { cardDate: true },
  });
  const completed = new Set(rows.map((row) => row.cardDate.toISOString().slice(0, 10)));
  return WEEKDAY_RU_SHORT.map((label, index) => {
    const date = new Date(monday);
    date.setUTCDate(date.getUTCDate() + index);
    const key = date.toISOString().slice(0, 10);
    return { key, label, day: date.getUTCDate(), done: completed.has(key), today: date.getTime() === today.getTime(), future: date.getTime() > today.getTime() };
  });
}

export default async function MiniAppPracticePage() {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect(`/miniapp/account?mode=login&intent=daily-practice&returnTo=${encodeURIComponent("/miniapp/practice")}`);
  const [{ card }, streak, week] = await Promise.all([
    getOrCreateDailyCard(userId),
    getPracticeStreakSnapshot(userId),
    weekStrip(userId),
  ]);
  const beats = dailyCardBeats(card.metadata);
  const completed = Boolean(card.completedAt);
  const liveStreak = effectivePracticeStreak(streak.count, streak.lastDoneDate);

  return (
    <MiniAppProductFrame title="Сегодняшний вопрос" eyebrow="ежедневная практика" price="+1 балл" priceMeta="за завершение" back="/miniapp/diary">
      <section className="miniapp-practice-intro">
        <p>Пять минут, чтобы заметить своё состояние раньше, чем оно превратится в тревогу или ссору.</p>
      </section>
      <DailyPracticeActions completed={completed} variant="full" prompt={card.prompt} perspective={beats.perspective} step={beats.step} initialReflection={card.reflectionText} />
      <section className="miniapp-practice-week" data-testid="miniapp-practice-week">
        <header><span>эта неделя</span>{liveStreak > 0 ? <strong><Sparkles size={14} />{liveStreak} {daysWord(liveStreak)} подряд</strong> : null}</header>
        <div>{week.map((item) => <span key={item.key} data-state={item.done ? "done" : item.today ? "today" : item.future ? "future" : "past"}><small>{item.label}</small><b>{item.done ? <Check size={14} /> : item.day}</b></span>)}</div>
        <footer><Leaf size={16} />Лучший ритм: {streak.longest} {daysWord(streak.longest)}</footer>
      </section>
    </MiniAppProductFrame>
  );
}
