/**
 * B640 — жёсткие ограничения площадок в одном месте.
 *
 * Замер прода 2026-08-03: за неделю опубликован **один** материал. Не потому,
 * что провайдеры молчали или очередь стояла: автор систематически выдавал текст
 * длиннее допустимого и без обязательного медиа-брифа, а валидатор на выходе
 * брал такой материал и выбрасывал (`ARCHIVED` / `FAILED`) — 11 штук на
 * threads, 8 на telegram, 8 на dzen, 2 на instagram.
 *
 * Это лечится в генерации, а не в валидации. Число символов площадки —
 * измеримое требование, и с ним можно сделать ровно три вещи по возрастанию
 * стоимости:
 *
 * 1. сказать автору точную цифру ДО написания (`platformLimitsForPrompt`);
 * 2. если нарушил — вернуть на доработку с указанием, на сколько именно
 *    перебор, а не выбросить (`draftLimitViolations`);
 * 3. если и после раундов не уложился — усечь детерминированно, сохранив
 *    ссылку (`trimToLimit`), и пометить это как правку системы.
 *
 * Выбрасывать материал за длину — самый дорогой и самый бесполезный из
 * вариантов: потрачены токены обеих ролей, а на площадку не вышло ничего.
 */

import { platformContract, platformPlaybook } from "@/lib/marketing/platform-playbook";

export interface PlatformPublishLimits {
  /** Предел длины готового текста ВМЕСТЕ со ссылкой; `null` — предела нет. */
  textLimit: number | null;
  /** Площадка не принимает материал без визуальной идеи. */
  mediaBriefRequired: boolean;
  /** Почему предел именно такой — попадает в промпт автора. */
  note: string;
}

/**
 * Ключи — как в `externalPublications.platform` (нижний регистр).
 *
 * Telegram: 1000, а не 4096, потому что собственный пост уходит подписью к
 * изображению (`sendPhoto`), а у подписи предел 1024 — берём с запасом на
 * разметку. Дзен и Reddit — длинные форматы, предела по длине у них нет.
 */
/**
 * B705 — числа берутся из плейбука, а не из собственной таблицы.
 *
 * До этой правки здесь стояла ВТОРАЯ таблица пределов, и она уже разошлась с
 * плейбуком: telegram 1000 против 900, vk 4000 против 1400, instagram 2200
 * против 700, reddit 10 000 против 2500. Два источника правды про одно число —
 * это гарантированное расхождение, и оно уже случилось: автору в промт уходила
 * одна цифра, а валидатор проверял другую.
 *
 * Теперь у длины и обязательности медиа один владелец — `platform-playbook.ts`,
 * а этот модуль остаётся тем, чем он полезен: усечением, запасными значениями
 * и формулировкой замечаний.
 */
export function platformPublishLimits(platform: string): PlatformPublishLimits {
  const contract = platformContract(platform);
  const playbook = platformPlaybook(platform);
  return {
    textLimit: contract.maxCharacters,
    mediaBriefRequired: contract.mediaBriefRequired,
    note: playbook.role,
  };
}

/**
 * То, что видит автор в задаче — точные цифры именно для этой площадки, а не
 * абзац в общем контракте. Общий контракт автор уже читал: цифры в нём стояли
 * всё время, пока прод выдавал материал на 40% длиннее предела.
 */
export function platformLimitsForPrompt(platform: string): {
  platform: string;
  maxCharacters: number | null;
  mediaBriefRequired: boolean;
  note: string;
} {
  const limits = platformPublishLimits(platform);
  return {
    platform,
    maxCharacters: limits.textLimit,
    mediaBriefRequired: limits.mediaBriefRequired,
    note: limits.note,
  };
}

export interface LimitViolation {
  /**
   * B705 — `contract` это всё остальное, что проверяет `inspectDraft`:
   * хэштеги, эмодзи, длинное тире, штампы, симметрия абзацев, позиция ссылки.
   *
   * Отдельным видом, а не четвёртым «почти length», потому что три прежних
   * вида система умеет чинить сама на последнем раунде (усечь, подставить
   * визуальную идею, написать призыв), а `contract` — почти нет. Смешать их
   * значило бы либо чинить нечинимое, либо потерять готовые починки.
   */
  kind: "length" | "media-brief" | "cta" | "contract";
  /** Ключ правила `inspectDraft`; у прежних трёх видов пусто. */
  rule?: string;
  /** Замечание в том же виде, в каком их формулирует редактор. */
  issue: string;
  /** Что именно должен сделать автор в следующем раунде. */
  brief: string;
}

/**
 * B700 фаза 6 — сколько слов в призыве, если убрать из него адрес.
 *
 * Живёт рядом с лимитами площадок, но лимитом НЕ является: требование призыва
 * общее для всех площадок и приходит от продукта, а не от API. Поэтому
 * `draftLimitViolations` его не проверяет — проверяет `repairPublishableDraft`,
 * где собран весь контракт выпускаемого материала.
 *
 * Два — это граница между ПРИЗЫВОМ и ГОЛЫМ АДРЕСОМ, и ровно она измерима кодом.
 * Планка намеренно низкая: единственный настоящий CTA среди семи материалов
 * замера был «Разбор целиком: <ссылка>» — два слова, и он хороший. Требовать
 * больше значило бы забраковать пример, который владелец назвал правильным.
 * Качество призыва — вопрос оценочной карты редактора, а не счётчика слов: код
 * умеет отличить фразу от адреса и не умеет отличить хорошую фразу от плохой.
 */
export const CTA_MIN_WORDS = 2;

export function ctaWordsOf(cta: string | null | undefined): number {
  const withoutUrls = (cta ?? "").replace(/https?:\/\/\S+/gi, " ");
  return withoutUrls.split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 1).length;
}

/**
 * Нарушения жёстких требований площадки. Возвращаем не «да/нет», а насколько
 * промахнулись: «сократи на 214 символов» исполнимо, «слишком длинно» — нет.
 */
export function draftLimitViolations(input: {
  platform: string;
  text: string;
  mediaBrief?: string | null;
}): LimitViolation[] {
  const limits = platformPublishLimits(input.platform);
  const violations: LimitViolation[] = [];
  const length = input.text.length;

  if (limits.textLimit !== null && length > limits.textLimit) {
    const excess = length - limits.textLimit;
    violations.push({
      kind: "length",
      issue: `Текст ${length} символов при пределе площадки ${limits.textLimit} — перебор на ${excess}.`,
      brief: `Сократи текст минимум на ${excess} символов (цель — не больше ${limits.textLimit} вместе со ссылкой), сохранив хук, один вывод и CTA. Убирай развитие и примеры, а не смысл.`,
    });
  }

  if (limits.mediaBriefRequired && !input.mediaBrief?.trim()) {
    violations.push({
      kind: "media-brief",
      issue: `Площадка ${input.platform} не принимает материал без визуальной идеи, а поле mediaBrief пустое.`,
      brief: "Заполни mediaBrief: что изображено, настроение, ключевой объект — так, чтобы дизайнер собрал картинку без уточняющих вопросов.",
    });
  }

  return violations;
}

/**
 * Детерминированное усечение — последняя ступень, когда раунды доработки не
 * помогли. Режем по границе предложения, а не по символу: обрубок на середине
 * слова читается как поломка, а не как короткий пост.
 *
 * `mustKeep` (целевая ссылка) переносится в конец и в бюджет входит: материал
 * без ссылки бессмысленен, ради неё и жертвуем последним абзацем.
 */
export function trimToLimit(input: {
  text: string;
  limit: number;
  mustKeep?: string | null;
}): string {
  const keep = input.mustKeep?.trim() || "";
  if (input.text.length <= input.limit) return input.text;

  // Ссылку вырезаем из тела, чтобы не усечь её саму и не оставить в середине.
  let body = keep ? input.text.split(keep).join(" ").replace(/\s+\n/g, "\n") : input.text;
  body = body.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();

  const tail = keep ? `\n\n${keep}` : "";
  const budget = input.limit - tail.length;
  if (budget <= 0) return keep.slice(0, input.limit);

  if (body.length > budget) {
    const window = body.slice(0, budget);
    // Ищем последнюю границу предложения; «…» и перевод строки тоже граница.
    const sentenceEnd = Math.max(
      window.lastIndexOf(". "),
      window.lastIndexOf("! "),
      window.lastIndexOf("? "),
      window.lastIndexOf("…"),
      window.lastIndexOf("\n"),
    );
    if (sentenceEnd > budget * 0.5) {
      body = window.slice(0, sentenceEnd + 1).trim();
    } else {
      const space = window.lastIndexOf(" ");
      const cut = space > 0 ? window.slice(0, space) : window;
      body = `${cut.trim()}…`.slice(0, budget);
    }
  }

  return `${body.trim()}${tail}`;
}

/**
 * Запасная визуальная идея, когда автор не дал её и после доработок.
 * Намеренно скучная и общая: её задача — не заменить работу автора, а не дать
 * материалу умереть из-за одного пустого поля. В карточке она помечена как
 * правка системы, чтобы редактор видел, что идею придумал не автор.
 */
/**
 * B700 фаза 6 — типовой призыв СЛОВАМИ на последний раунд.
 *
 * Не «Открыть по ссылке в тексте», как было: это подпись к адресу, а не
 * предложение действия. Формулировка обещает разбор своей ситуации — то самое,
 * ради чего читатель приходит, — и не обещает результата.
 *
 * Это последняя ступень, а не режим по умолчанию: до неё призыв обязан
 * написать автор, и его отсутствие — замечание редактора.
 */
export function fallbackCta(topic?: string | null): string {
  const subject = topic?.trim();
  return subject
    ? `Разобрать свою ситуацию по теме «${subject}» спокойно и по шагам`
    : "Разобрать свою ситуацию спокойно и по шагам";
}

export function fallbackMediaBrief(input: { title: string; topic?: string | null }): string {
  const subject = (input.topic?.trim() || input.title.trim() || "спокойное самонаблюдение");
  return `Спокойная минималистичная иллюстрация по теме «${subject}»: один узнаваемый предмет или сцена, мягкий приглушённый свет, без текста на картинке и без лиц крупным планом.`;
}
