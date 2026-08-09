/**
 * B699 — сколько ключу остывать, решает провайдер, а не мы.
 *
 * До этой правки HTTP 429 давал всем ключам плоские пять минут. Замер прода
 * 2026-08-09 показал, чего это стоит: ровно ~5 успешных генераций автора в час,
 * круглые сутки, ноль выпущенных материалов. Ключ, исчерпанный на сутки,
 * возвращался на пробу через пять минут, автор писал материал заново и списывал
 * токены с того же потолка, о который спотыкался редактор.
 *
 * Провайдер при этом называет свой срок прямо в теле отказа, и сроки разные на
 * четыре порядка:
 *
 *   Groq   «Please try again in 58m35.183999999s»  — суточный лимит токенов
 *   Gemini «Please retry in 49.593789631s»         — минутная квота
 *   Cohere «limited to 1000 API calls / month»     — месячный триал
 *
 * Здесь этот срок читается. Текст отказа — ДАННЫЕ внешней стороны: из него
 * берётся только число, и только в сторону ожидания. Обнулить остывание чужой
 * строкой нельзя.
 */

export interface FailureClassification {
  cooldownMs: number;
  regionBlocked: boolean;
}

export interface FailureDetail {
  /** Текст ответа провайдера, как он пришёл. Необязателен: его может не быть. */
  providerMessage?: string;
}

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;

/**
 * Верхний предел остывания одного ключа.
 *
 * Месячный триал Cohere и суточные квоты Gemini формально ждут дольше, но
 * бессрочное выбывание — это ровно та ошибка, которую B694 уже разбирал: снять
 * флаг было бы нечем, кроме правки в базе. Сутки означают «сегодня не ходим»:
 * раз в сутки ключ возвращается на одну пробу, и если квота всё ещё пуста —
 * уходит остывать снова. Одна проба в сутки не жжёт ничего.
 */
export const MAX_CREDENTIAL_COOLDOWN_MS = 24 * HOUR;

/** Плоский срок для 429 без подсказки — прежнее поведение. */
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 5 * MINUTE;

/**
 * «try again in 58m35.183999999s», «retry in 49.593789631s», «try again in 2h30m».
 *
 * Числа с дробной частью и любое сочетание h/m/s. Ищем именно связку
 * «(try again|retry) in …»: голое «5s» встречается в тексте отказа и в других
 * ролях (лимиты, идентификаторы), и принимать его за срок нельзя.
 */
const RETRY_HINT = /(?:try again|retry)\s+in\s+(-?[\d.]+h)?\s*(-?[\d.]+m)?\s*(-?[\d.]+m?s)?/i;

/**
 * Признаки исчерпания на суточном и более длинном горизонте, когда срок не
 * назван числом. Такие квоты не восстанавливаются за пять минут никогда.
 */
const LONG_HORIZON_EXHAUSTION = /(\bper month\b|\/\s*month\b|\bmonthly\b|\bper day\b|\/\s*day\b|\bTPD\b|\bdaily (?:limit|quota)\b)/i;

function parseUnit(raw: string | undefined, multiplier: number): number {
  if (!raw) return 0;
  const value = Number.parseFloat(raw);
  return Number.isFinite(value) ? value * multiplier : 0;
}

/**
 * Срок ожидания, названный провайдером, в миллисекундах.
 *
 * `null` — провайдер ничего не сказал. Ноль и отрицательные значения тоже дают
 * `null`: «ждать нисколько» не бывает ответом на исчерпанную квоту, а принять
 * его значило бы позволить чужой строке отменить остывание.
 */
export function retryDelayFromProviderMessage(message: string | undefined | null): number | null {
  if (!message) return null;

  const hint = message.match(RETRY_HINT);
  if (hint) {
    const [, hours, minutes, seconds] = hint;
    const ms = parseUnit(hours, HOUR)
      + parseUnit(minutes, MINUTE)
      // «35.18s» и «250ms» разбираются одним хвостом: у миллисекунд остаётся «m».
      + (seconds?.toLowerCase().endsWith("ms")
        ? parseUnit(seconds, 1)
        : parseUnit(seconds, SECOND));
    if (ms > 0) return Math.min(Math.round(ms), MAX_CREDENTIAL_COOLDOWN_MS);
    // Провайдер назвал срок, но он нулевой или отрицательный. Это не «можно
    // сразу»: разбор считается несостоявшимся, и решает общее правило ниже.
  }

  if (LONG_HORIZON_EXHAUSTION.test(message)) return MAX_CREDENTIAL_COOLDOWN_MS;

  return null;
}

/**
 * Срок остывания ключа по коду отказа и, если он есть, по ответу провайдера.
 *
 * B694: у региональной блокировки есть срок. Раньше `cooldownMs: 0` вместе с
 * жёстким `regionBlocked: false` в выборке означал вечное выбывание — снять
 * флаг было нечем, кроме правки в базе, и один разовый 403 навсегда уводил
 * провайдера из пула. Сутки — это «сегодня не ходим», а не «никогда».
 */
export function classifyCredentialFailure(
  code: string | undefined,
  detail?: FailureDetail,
): FailureClassification {
  if (!code) return { cooldownMs: MINUTE, regionBlocked: false };

  // 403 — свойство маршрута, а не квоты: срок из тела ответа его не сокращает.
  // Иначе бодрое «retry in 1s» вернуло бы ключ в пул мгновенно — и он снова
  // получил бы 403.
  if (code === "HTTP_403") return { cooldownMs: MAX_CREDENTIAL_COOLDOWN_MS, regionBlocked: true };
  if (code === "HTTP_401") return { cooldownMs: 30 * MINUTE, regionBlocked: false };
  if (code === "HTTP_402") return { cooldownMs: HOUR, regionBlocked: false };
  if (code === "HTTP_429") {
    return {
      cooldownMs: retryDelayFromProviderMessage(detail?.providerMessage) ?? DEFAULT_RATE_LIMIT_COOLDOWN_MS,
      regionBlocked: false,
    };
  }
  if (code === "TIMEOUT" || /^HTTP_5\d\d$/.test(code)) return { cooldownMs: MINUTE, regionBlocked: false };
  if (code === "MISSING_CONFIG") return { cooldownMs: 0, regionBlocked: false };
  return { cooldownMs: MINUTE, regionBlocked: false };
}
