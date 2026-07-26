// B375 (M26): бесплатный «итог недели» — собирается после 7 отмеченных дней
// подряд из вопросов и взглядов дня за последнюю неделю, сохраняется как
// ProductResult (productKey "weekly-summary") и попадает в Дневник; оттуда
// его можно расшарить обезличенным фрагментом.

import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { aiComplete } from "@/lib/ai";
import { dailyCardBeats } from "@/lib/daily-card";
import { log, serializeError } from "@/lib/logger";

export const WEEKLY_SUMMARY_PRODUCT_KEY = "weekly-summary";

type WeekEntry = { day: string; question: string | null; perspective: string | null };

/** Понедельник недели (UTC), в которую попадает `now`. */
export function startOfPracticeWeek(now = new Date()): Date {
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekday = (day.getUTCDay() + 6) % 7; // 0 = понедельник
  day.setUTCDate(day.getUTCDate() - weekday);
  return day;
}

export function buildDeterministicWeeklySummary(entries: WeekEntry[]): string {
  const questions = entries.filter((entry) => entry.question);
  const lines: string[] = [
    "Итог недели",
    "",
    `За последнюю неделю вы возвращались к себе ${entries.length} ${entries.length === 1 ? "раз" : entries.length < 5 ? "раза" : "раз"} — это уже результат.`,
    "",
  ];
  if (questions.length) {
    lines.push("О чём вы спрашивали себя:");
    for (const entry of questions.slice(0, 7)) {
      lines.push(`- ${entry.day}: «${(entry.question ?? "").slice(0, 140)}»`);
    }
    lines.push("");
  }
  lines.push(
    "Что стоит забрать с собой:",
    "- маленькие ежедневные возвращения работают лучше редких больших разборов;",
    "- вопросы недели уже показывают, какая тема просит внимания — её можно разобрать глубже;",
    "- ритм важнее идеальности: пропуск дня ничего не обнуляет, кроме серии.",
  );
  return lines.join("\n");
}

async function collectWeekEntries(userId: string, weekStart: Date): Promise<WeekEntry[]> {
  const cards = await db.dailyCard.findMany({
    where: { userId, completedAt: { not: null }, cardDate: { gte: weekStart } },
    orderBy: { cardDate: "asc" },
    select: { cardDate: true, reflectionText: true, metadata: true },
  });
  return cards.map((card) => {
    const beats = dailyCardBeats(card.metadata);
    return {
      day: card.cardDate.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
      question: card.reflectionText ?? null,
      perspective: beats.perspective ?? null,
    };
  });
}

/**
 * Сгенерировать и сохранить «итог недели». Идемпотентно в пределах недели:
 * повторный вызов той же недели возвращает существующий результат.
 */
export async function generateWeeklySummary(input: { userId: string; requestId?: string; now?: Date }) {
  const weekStart = startOfPracticeWeek(input.now);
  const existing = await db.productResult.findFirst({
    where: {
      userId: input.userId,
      productKey: WEEKLY_SUMMARY_PRODUCT_KEY,
      createdAt: { gte: weekStart },
      status: { not: "DELETED" },
    },
    select: { id: true },
  });
  if (existing) return existing;

  const entries = await collectWeekEntries(input.userId, weekStart);
  const fallback = buildDeterministicWeeklySummary(entries);

  let text = fallback;
  let source = "deterministic_v1";
  try {
    const response = await aiComplete({
      feature: "daily-practice",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 900,
      temperature: 0.5,
      messages: [
        {
          role: "system",
          content: [
            "Собери тёплый «Итог недели» ежедневной практики ETerapy на русском.",
            "Структура: что человек замечал на неделе, какая тема звучала чаще, один бережный вывод и один маленький шаг на следующую неделю.",
            "Без диагнозов, без давления, без медицинских/юридических/финансовых советов. До 1500 символов.",
          ].join(" "),
        },
        {
          role: "user",
          content: entries.length
            ? entries.map((entry) => `${entry.day}: вопрос «${entry.question ?? "—"}»; взгляд: ${entry.perspective ?? "—"}`).join("\n")
            : "Записей за неделю нет — собери мягкий итог о ценности самого ритма возвращений.",
        },
      ],
    });
    if (response.text.trim().length >= 200) {
      text = response.text.trim().slice(0, 4000);
      source = "ai";
    }
  } catch (error) {
    log.error("weekly_summary.ai_failed", { err: serializeError(error) });
  }

  return db.productResult.create({
    data: {
      userId: input.userId,
      productKey: WEEKLY_SUMMARY_PRODUCT_KEY,
      status: "READY",
      title: `Итог недели · с ${weekStart.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" })}`,
      resultText: text,
      savedAt: new Date(),
      metadata: { weekStart: weekStart.toISOString(), source, reward: "practice_week_milestone" } as Prisma.InputJsonObject,
    },
  });
}

export const WEEK_DAY_LABELS = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"] as const;

/** Чистый помощник для UI: статус пн–вс текущей недели по завершённым дням. */
export function practiceWeekDays(completedDays: Date[], now = new Date()) {
  const weekStart = startOfPracticeWeek(now);
  const doneKeys = new Set(completedDays.map((d) => d.toISOString().slice(0, 10)));
  const todayKey = now.toISOString().slice(0, 10);
  return WEEK_DAY_LABELS.map((label, index) => {
    const day = new Date(weekStart);
    day.setUTCDate(day.getUTCDate() + index);
    const key = day.toISOString().slice(0, 10);
    // B593: «ещё не наступил» и «пропущен» — разные вещи. На /practice это
    // различалось, и при переезде полосы на «Дневник» различие нельзя терять:
    // иначе вторник в понедельник выглядит уже проваленным.
    return { label, done: doneKeys.has(key), isToday: key === todayKey, isFuture: key > todayKey };
  });
}
