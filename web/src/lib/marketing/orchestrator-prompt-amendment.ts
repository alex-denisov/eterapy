/**
 * B740 — ПРАВКА ПРОМТА КАК ОТВЕТ НА ПОВТОРЯЮЩУЮСЯ ПРИЧИНУ ОТКАЗА.
 *
 * Владелец просил оркестратора, который улучшает «их промты, их работу, их
 * данные». Из всего перечисленного промт — самое опасное, что можно менять
 * автоматически: одна неудачная формулировка портит каждый следующий материал,
 * и заметно это станет через сутки по числу отказов, а не сразу.
 *
 * Поэтому здесь четыре ограничителя, и каждый закрывает свой способ всё
 * сломать:
 *
 *  1. ПОВОД — ИЗМЕРЕННЫЙ, А НЕ ПРИДУМАННЫЙ. Правка предлагается только тогда,
 *     когда ОДНА И ТА ЖЕ причина отказа встретилась несколько раз за сутки.
 *     «Мне кажется, промт можно улучшить» поводом не является.
 *  2. ДОПИСЫВАНИЕ, А НЕ ПЕРЕПИСЫВАНИЕ. Базовый текст роли не трогается вовсе:
 *     правка живёт в помеченном блоке в конце. Модель, переписывающая промт
 *     целиком, однажды выбросит правило, которое ставили руками после разбора
 *     инцидента, — и никто не заметит, потому что текст останется связным.
 *  3. БЛОК ОДИН И ОН ЗАМЕНЯЕТСЯ. Прошлый блок срезается перед добавлением
 *     нового. Иначе за месяц промт оброс бы тридцатью правилами, половина из
 *     которых противоречит друг другу.
 *  4. ДЛИНА ОГРАНИЧЕНА. Правило — одна-две фразы. Абзац на триста слов здесь
 *     означает, что модель ушла рассуждать, а не формулировать.
 */

import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import { defaultPromptTextForFeature } from "@/lib/ai-gateway/prompts";
import db from "@/lib/db";
import { MARKETING_TOPIC_RADAR_FEATURE } from "@/lib/marketing/model-pool";
import type { OrchestratorDirective } from "@/lib/marketing/orchestrator-actions";

/** Метки автоматического блока. Срез идёт по ним, а не по «последнему абзацу». */
export const AMENDMENT_OPEN = "<!-- orchestrator-amendment -->";
export const AMENDMENT_CLOSE = "<!-- /orchestrator-amendment -->";

/** Сколько раз причина должна повториться за сутки, чтобы стать поводом. */
export const AMENDMENT_MIN_OCCURRENCES = 3;
/** Потолок длины правила. Больше — это рассуждение, а не правило. */
export const AMENDMENT_MAX_CHARS = 400;

/** Текст без прошлого автоматического блока. */
export function stripAmendment(promptText: string): string {
  const start = promptText.indexOf(AMENDMENT_OPEN);
  if (start < 0) return promptText.trimEnd();
  const end = promptText.indexOf(AMENDMENT_CLOSE, start);
  const tail = end < 0 ? "" : promptText.slice(end + AMENDMENT_CLOSE.length);
  return (promptText.slice(0, start) + tail).trimEnd();
}

/** Текст с новым блоком вместо прошлого. */
export function withAmendment(promptText: string, rule: string): string {
  const base = stripAmendment(promptText);
  return [
    base,
    "",
    AMENDMENT_OPEN,
    "ПРАВИЛО, ДОБАВЛЕННОЕ ПО РАЗБОРУ ОТКАЗОВ:",
    rule.trim(),
    AMENDMENT_CLOSE,
  ].join("\n");
}

/** Текущий текст промта роли: правка из базы, а при её отсутствии — умолчание кода. */
export async function currentPromptText(feature: string): Promise<string | null> {
  const row = await db.aIPromptConfig
    .findUnique({ where: { feature }, select: { promptText: true } })
    .catch(() => null);
  return row?.promptText ?? defaultPromptTextForFeature(feature) ?? null;
}

/**
 * Одно правило от модели.
 *
 * ⚠ ЕЙ НЕ ПОКАЗЫВАЮТ ВЕСЬ ПРОМТ. Показать значило бы пригласить переписать:
 * модель, увидевшая текст целиком, начинает его «улучшать». Ей нужна ровно
 * причина отказа — из неё и следует правило.
 */
export async function draftAmendmentRule(input: {
  cause: string;
  occurrences: number;
  role: string;
}): Promise<string | null> {
  try {
    const response = await aiComplete({
      feature: MARKETING_TOPIC_RADAR_FEATURE,
      dataClass: "PUBLIC_MARKETING",
      maxTokens: 300,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: [
            `Ты правишь системный промт роли «${input.role}» в маркетинговом конвейере ETerapy.`,
            "Тебе называют ПРИЧИНУ, по которой материалы этой роли раз за разом не доходят до выпуска.",
            "Твой ответ — ОДНО правило, которое эту причину снимает. Одна-две фразы, повелительное наклонение, по-русски.",
            "Никаких вступлений, нумерации, кавычек и пояснений — только сам текст правила.",
            "Правило должно быть проверяемым: «пиши лучше» правилом не является.",
          ].join("\n"),
        },
        {
          role: "user",
          content: `Причина отказа, встретилась ${input.occurrences} раз за сутки: ${input.cause}`,
        },
      ],
    });
    const rule = response.text.trim().replace(/^["'«]|["'»]$/g, "").trim();
    if (rule.length < 20 || rule.length > AMENDMENT_MAX_CHARS) {
      log.warn("orchestrator.amendment_rejected", { length: rule.length });
      return null;
    }
    return rule;
  } catch (error) {
    log.warn("orchestrator.amendment_failed", { error: serializeError(error) });
    return null;
  }
}

/**
 * Готовая директива правки промта, или `null`, если правило не получилось.
 *
 * `null` здесь — нормальный исход, а не сбой: пул мог отказать, модель могла
 * ответить абзацем вместо правила. Молчать об этом нельзя, но и городить
 * инцидент не из чего — находка о повторяющейся причине уже в отчёте.
 */
export async function promptAmendmentDirective(input: {
  feature: string;
  role: string;
  cause: string;
  occurrences: number;
  dayKey: string;
}): Promise<OrchestratorDirective | null> {
  const current = await currentPromptText(input.feature);
  if (!current) return null;
  const rule = await draftAmendmentRule({
    cause: input.cause,
    occurrences: input.occurrences,
    role: input.role,
  });
  if (!rule) return null;
  return {
    key: `${input.dayKey}:prompt.${input.feature}`,
    target: "smm",
    action: "update_prompt",
    payload: { feature: input.feature, promptText: withAmendment(current, rule) },
    problem: `«${input.cause}» — ${input.occurrences} материалов за сутки по одной причине`,
    rationale:
      `Дописываю к промту роли «${input.role}» одно правило: ${rule} `
      + "Базовый текст не трогаю — правка живёт в отдельном помеченном блоке и "
      + "на следующей правке заменяется целиком, а не накапливается. Прежний "
      + "текст сохранён и откатывается одной командой.",
    risk: "reversible",
  };
}
