// B389 (M26): рекомендательный движок Дневника + игровая механика «наблюдений».
// Дневник анализирует темы записей и рекомендует РОВНО ОДНУ механику/услугу за раз
// (контекстный апселл без перегруза). Чистая, детерминированная логика — фикстуры
// в b389-diary-recommendation.test.ts покрывают 4 канонических кейса плана (П.7).

import { dialogueTopicLabelRu, type DialogueTopic } from "@/lib/dialogue-router";

export type DiaryTopicCounts = Record<string, number>;

export type DiaryRecommendationKey =
  | "family-scenarios"
  | "together"
  | "deep-report"
  | "daily-question";

export type DiaryRecommendation = {
  key: DiaryRecommendationKey;
  eyebrow: string;
  title: string;
  body: string;
  ctaLabel: string;
  // относительный путь; surface сам оборачивает в mainUrl/appUrl
  route: string;
  // на какой поддомен ведёт ссылка
  surface: "main" | "app";
  paid: boolean;
};

export type DiaryObservation = {
  topic: string;
  topicLabel: string;
  count: number;
  text: string;
};

// Семья требует глубины (genogram-механика «что повторяется в роду»).
export const FAMILY_SCENARIOS_MIN = 3;
// Минимум записей по теме, чтобы считать её «преобладающей».
export const DOMINANT_TOPIC_MIN = 2;
// Игровая механика: N записей по теме открывают «наблюдение».
export const OBSERVATION_MIN = 3;

function countFor(counts: DiaryTopicCounts, topic: string): number {
  return Math.max(0, Math.floor(counts[topic] ?? 0));
}

function totalEntries(counts: DiaryTopicCounts): number {
  return Object.values(counts).reduce((sum, n) => sum + Math.max(0, Math.floor(n ?? 0)), 0);
}

// Доминирующая тема: максимум по количеству; при равенстве — по приоритету
// (более «осмысленные для разбора» темы выигрывают tie-break).
const TIE_BREAK_PRIORITY: DialogueTopic[] = ["family", "relationships", "anxiety", "career", "money", "self", "other"];

export function dominantTopic(counts: DiaryTopicCounts): { topic: string; count: number } | null {
  let best: { topic: string; count: number } | null = null;
  for (const [topic, raw] of Object.entries(counts)) {
    const count = Math.max(0, Math.floor(raw ?? 0));
    if (count <= 0) continue;
    if (
      !best ||
      count > best.count ||
      (count === best.count && tiePriority(topic) < tiePriority(best.topic))
    ) {
      best = { topic, count };
    }
  }
  return best;
}

function tiePriority(topic: string): number {
  const idx = TIE_BREAK_PRIORITY.indexOf(topic as DialogueTopic);
  return idx === -1 ? TIE_BREAK_PRIORITY.length : idx;
}

const RECS: Record<DiaryRecommendationKey, Omit<DiaryRecommendation, "body">> = {
  "family-scenarios": {
    key: "family-scenarios",
    eyebrow: "тема рода",
    title: "Семейные сценарии",
    ctaLabel: "Собрать семейные сценарии",
    route: "/products/family-scenarios",
    surface: "main",
    paid: true,
  },
  together: {
    key: "together",
    eyebrow: "про отношения",
    title: "Вместе",
    ctaLabel: "Посмотреть «Вместе»",
    route: "/products/pair",
    surface: "main",
    paid: true,
  },
  "deep-report": {
    key: "deep-report",
    eyebrow: "вернуться к теме",
    title: "Подробный разбор",
    ctaLabel: "Открыть подробный разбор",
    route: "/products/deep-report",
    surface: "main",
    paid: true,
  },
  "daily-question": {
    key: "daily-question",
    eyebrow: "мягкий ритм",
    title: "Ежедневный вопрос",
    ctaLabel: "Ответить на вопрос дня",
    route: "/cabinet",
    surface: "app",
    paid: false,
  },
};

export function recommendForDiary(counts: DiaryTopicCounts): DiaryRecommendation {
  const family = countFor(counts, "family");
  const dominant = dominantTopic(counts);

  // 1) Тема рода в ≥3 разборах → «Семейные сценарии» (платно, genogram).
  if (family >= FAMILY_SCENARIOS_MIN) {
    return {
      ...RECS["family-scenarios"],
      body: `Дневник заметил тему рода и семьи в нескольких разборах (${family}). «Семейные сценарии» бережно покажут, что повторяется из поколения в поколение — и где это можно мягко прервать.`,
    };
  }

  // Недостаточно сигнала → мягкий пуш «Ежедневного вопроса».
  if (!dominant || dominant.count < DOMINANT_TOPIC_MIN) {
    return {
      ...RECS["daily-question"],
      body: "Дневник собирает повторяющиеся темы после каждого разбора. Начните с короткого вопроса дня — и дневник начнёт замечать ваши узоры.",
    };
  }

  const label = dialogueTopicLabelRu(dominant.topic);

  // 2) Преобладают «отношения» → «Вместе».
  if (dominant.topic === "relationships") {
    return {
      ...RECS.together,
      body: `Чаще всего в дневнике звучит тема «${label}». «Вместе» поможет свериться со взглядом близкого человека — без терапии вдвоём, просто увидеть, где вы совпадаете.`,
    };
  }

  // 3) «Тревога/состояние» → «Подробный разбор».
  if (dominant.topic === "anxiety") {
    return {
      ...RECS["deep-report"],
      body: `Дневник замечает тему «${label}». Подробный разбор поможет рассмотреть её спокойно и по частям, с бережным следующим шагом.`,
    };
  }

  // Другая ощутимая тема (карьера/деньги/я и опоры) → общий подробный разбор.
  return {
    ...RECS["deep-report"],
    body: `За последние разборы чаще всего возвращается тема «${label}». Можно собрать её в подробный разбор и наметить, куда двигаться дальше.`,
  };
}

// Игровая механика: тема с ≥3 записями открывает одно «наблюдение» (одно за раз,
// самое «созревшее»). Возвращаем все доступные, surface показывает первое.
export function buildObservations(counts: DiaryTopicCounts): DiaryObservation[] {
  return Object.entries(counts)
    .map(([topic, raw]) => ({ topic, count: Math.max(0, Math.floor(raw ?? 0)) }))
    .filter((entry) => entry.count >= OBSERVATION_MIN)
    .sort((a, b) => b.count - a.count || tiePriority(a.topic) - tiePriority(b.topic))
    .map((entry) => {
      const topicLabel = dialogueTopicLabelRu(entry.topic);
      return {
        topic: entry.topic,
        topicLabel,
        count: entry.count,
        text: `${entry.count} записи по теме «${topicLabel}» — дневник открыл наблюдение. Похоже, эта тема для вас сейчас важнее других.`,
      };
    });
}

export function topObservation(counts: DiaryTopicCounts): DiaryObservation | null {
  return buildObservations(counts)[0] ?? null;
}

// Подсчёт тем из готовых записей карты (диалоги несут topic; продукты — нет).
export function tallyDiaryTopics(items: Array<{ topic?: string | null }>): DiaryTopicCounts {
  const counts: DiaryTopicCounts = {};
  for (const item of items) {
    const topic = item.topic;
    if (!topic) continue;
    counts[topic] = (counts[topic] ?? 0) + 1;
  }
  return counts;
}

export { totalEntries };
