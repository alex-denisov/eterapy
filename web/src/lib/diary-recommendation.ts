// B389 (M26): темы Дневника + мягкие «наблюдения». Чистая, детерминированная
// логика. Топик→услуга рекомендации переехали в lib/cabinet-recommendations.ts
// (B464 round-4: day-seeded rotation + anti-repeat) — здесь остаются dominant
// topic, наблюдения и подсчёт тем.

import { dialogueTopicLabelRu, type DialogueTopic } from "@/lib/dialogue-router";

export type DiaryTopicCounts = Record<string, number>;

export type DiaryObservation = {
  topic: string;
  topicLabel: string;
  count: number;
  text: string;
};

// Игровая механика: N записей по теме открывают «наблюдение».
export const OBSERVATION_MIN = 3;

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

// Русские формы слова «запись» — «13 записей», не «13 записи» (round-4 #12).
export function entriesWord(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "запись";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "записи";
  return "записей";
}

// Мягкое самонаблюдение: тема с ≥3 записями «созревает» в наблюдение (одно за
// раз, самое частое). Формулировка — тёплое зеркало от первого взгляда, без
// «дневник заметил/открыл» (surveillance framing, owner #4 / round-4 #12).
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
        text: `Вы возвращаетесь к теме «${topicLabel}» — уже ${entry.count} ${entriesWord(entry.count)}. Похоже, сейчас она важнее других.`,
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
