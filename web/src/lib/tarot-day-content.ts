/**
 * B678 — трактовка карты дня: генерация моделью и кэш на 156 вариантов.
 *
 * Почему кэш живёт в `platform_settings`, а не в новой таблице: строк ровно
 * 156 (78 карт × 2 положения), они не связаны ни с пользователем, ни с датой,
 * и переживают любую выкатку. Новая таблица ради справочника из 156 строк —
 * это миграция и обслуживание там, где хватает ключа.
 *
 * Пользовательских данных в промте НЕТ вовсе: модель видит только название
 * карты и её положение. Поэтому один и тот же ответ можно отдать всем.
 */
import type { Prisma } from "@prisma/client";
import db from "@/lib/db";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import {
  TAROT_DAY_INTERPRETATION_VERSION,
  fallbackTarotDayInterpretation,
  parseTarotDayInterpretation,
  tarotDayOrientationLabel,
  type TarotDayInterpretation,
  type TarotDayPick,
} from "@/lib/tarot-day";

export type TarotDayInterpretationSource = "cache" | "ai" | "deterministic_v1";

export function tarotDayCacheKey(pickKey: string) {
  return `tarot-day.${TAROT_DAY_INTERPRETATION_VERSION}.${pickKey}`;
}

async function readCached(pickKey: string): Promise<TarotDayInterpretation | null> {
  try {
    const row = await db.platformSetting.findUnique({ where: { key: tarotDayCacheKey(pickKey) } });
    if (!row?.value) return null;
    return parseTarotDayInterpretation(JSON.parse(row.value));
  } catch {
    return null;
  }
}

async function writeCached(pickKey: string, interpretation: TarotDayInterpretation): Promise<void> {
  const value = JSON.stringify(interpretation);
  try {
    await db.platformSetting.upsert({
      where: { key: tarotDayCacheKey(pickKey) },
      create: { key: tarotDayCacheKey(pickKey), value, updatedBy: "tarot-day" },
      update: { value, updatedBy: "tarot-day" },
    });
  } catch (error) {
    // Не сумели закэшировать — не повод не показать карту. Следующий заход
    // просто сгенерирует текст ещё раз.
    log.warn("tarot-day.cache_write_failed", { pickKey, error: serializeError(error) });
  }
}

function parseModelResponse(text: string): TarotDayInterpretation | null {
  if (!text) return null;
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return parseTarotDayInterpretation(JSON.parse(match[0]));
  } catch {
    return null;
  }
}

/**
 * Трактовка карты дня. Порядок: кэш → модель → детерминированный текст.
 *
 * Функция ТОТАЛЬНАЯ — она никогда не бросает и всегда возвращает текст: карта
 * дня стоит первым блоком кабинета, и пустое место там читается как поломка
 * продукта, а не как недоступность модели.
 */
export async function getTarotDayInterpretation(
  pick: TarotDayPick,
  options: { allowGenerate?: boolean } = {},
): Promise<{ interpretation: TarotDayInterpretation; source: TarotDayInterpretationSource }> {
  const cached = await readCached(pick.key);
  if (cached) return { interpretation: cached, source: "cache" };

  if (options.allowGenerate === false) {
    return { interpretation: fallbackTarotDayInterpretation(pick), source: "deterministic_v1" };
  }

  try {
    const response = await aiComplete({
      feature: "daily-tarot",
      maxTokens: 500,
      temperature: 0.7,
      messages: [
        {
          role: "system",
          content: [
            "Ты ведёшь рубрику «Карта дня» в продукте ETerapy — спокойный разбор символа дня в системе Райдера—Уэйта—Смит.",
            "Верни ТОЛЬКО JSON без markdown:",
            '{"headline": "...", "body": "...", "focus": "...", "question": "..."}',
            "headline — короткий заголовок дня, 2–5 слов, без названия карты.",
            "body — трактовка карты именно как карты дня, 2–3 предложения.",
            "focus — на что обратить внимание сегодня, одно предложение.",
            "question — один вопрос себе, от первого лица.",
            "Тон: спокойный, уважительный, без фатальных прогнозов, без обещаний событий, без предсказаний здоровья, смерти, беременности, суда и денег.",
            "Карта описывает настроение и фокус дня, а не факты будущего. Только русский язык.",
          ].join(" "),
        },
        {
          role: "user",
          content: `Карта дня: «${pick.card.name}», ${tarotDayOrientationLabel(pick.reversed)}. Ключевое значение колоды: ${pick.reversed ? pick.card.reversedMeaning : pick.card.upright}.`,
        },
      ],
    });

    const parsed = parseModelResponse(response.text);
    if (!parsed) {
      return { interpretation: fallbackTarotDayInterpretation(pick), source: "deterministic_v1" };
    }
    await writeCached(pick.key, parsed);
    return { interpretation: parsed, source: "ai" };
  } catch (error) {
    log.warn("tarot-day.interpretation_fallback", { pickKey: pick.key, error: serializeError(error) });
    return { interpretation: fallbackTarotDayInterpretation(pick), source: "deterministic_v1" };
  }
}

/** Сколько из 156 вариантов уже сгенерировано — строка контроля для суперадминки. */
export async function tarotDayInterpretationCoverage(): Promise<{ cached: number; total: number }> {
  const cached = await db.platformSetting.count({
    where: { key: { startsWith: `tarot-day.${TAROT_DAY_INTERPRETATION_VERSION}.` } },
  });
  return { cached, total: 156 };
}

/** Тип-страховка: значение уходит в Json-поля как обычный объект. */
export function tarotDayMetadata(
  pick: TarotDayPick,
  interpretation: TarotDayInterpretation,
  source: TarotDayInterpretationSource,
): Prisma.InputJsonObject {
  return {
    key: pick.key,
    cardCode: pick.card.code,
    cardName: pick.card.name,
    reversed: pick.reversed,
    dayKey: pick.dayKey,
    source,
    headline: interpretation.headline,
    body: interpretation.body,
    focus: interpretation.focus,
    question: interpretation.question,
  };
}
