/**
 * B705 — что считает регулярка, редактор считать не должен.
 *
 * ПОЧЕМУ ЭТОТ ФАЙЛ СУЩЕСТВУЕТ. Замер прода 2026-08-12: 2,45 млн токенов за
 * двое суток на ~3 выпущенных материала. Разбор `archive_reason` показал, из
 * чего состоит расход, дословно:
 *
 *   «текст всё ещё длиннее лимита Threads (718 символов), CTA дублируется»
 *   «не устранены: заголовок без указания формата, слабый хук…»
 *   «превышение лимита на 48 символов не устранено»
 *
 * Каждая такая строка — ДВОЙНОЙ убыток: заплатили автору за текст и заплатили
 * редактору, чтобы узнать длину строки. При этом `text.length > 480` считается
 * локально за микросекунду и не ошибается никогда, в отличие от модели.
 *
 * ГРАНИЦА, ПО КОТОРОЙ ПРАВИЛО ПОПАДАЕТ СЮДА: его можно проверить, не понимая
 * смысла текста. Длина, число хэштегов, позиция ссылки, наличие стоп-слова,
 * равномерность абзацев — можно. «Живой ли это голос», «уместен ли угол»,
 * «правда ли это полезно» — нельзя, и это остаётся редактору.
 *
 * ⚠ ПРО ЗАПРЕТ ДЛИННОГО ТИРЕ. Требование владельца «чтобы не было длинных тире»
 * нельзя переносить буквально: в русском языке тире грамматически обязательно
 * («Ясность — это не совет»), и полный запрет породил бы безграмотный текст и
 * новые раунды правки — то есть ровно тот расход, ради снятия которого файл и
 * заведён. Проверяется поэтому не наличие тире, а четыре его ЗЛОУПОТРЕБЛЕНИЯ:
 * тире без пробела с одной стороны (калька с английского em dash и настоящий
 * признак машинного текста), дефис в роли тире, превышение плотности на 1000
 * символов и два тире в одном предложении.
 */

import {
  hasPlatformPlaybook,
  platformContract,
  type PlatformContract,
} from "@/lib/marketing/platform-playbook";

export type { PlatformContract };

export interface DraftDefect {
  /** Ключ правила — по нему видно в сводке, какие правила срабатывают чаще. */
  rule: string;
  /** Замечание в том же виде, в каком их формулирует редактор. */
  issue: string;
  /** Что именно автор должен сделать в следующем раунде. */
  brief: string;
}

export interface DraftUnderInspection {
  platform: string;
  title: string;
  text: string;
  cta?: string | null;
  mediaBrief?: string | null;
  /** Ссылка, которую план обязал поставить: она не считается «лишней». */
  destinationUrl?: string | null;
  /** B724: текст после точечной правки редактором (revisedText). */
  revisedText?: string | null;
}

export interface EditorReviewContract {
  decision: "APPROVE" | "REVISE" | "REJECT";
  scores: Record<string, number>;
  issues: string[];
  revisionBrief: string[];
  revisedText?: string;
  summary: string;
}

export const CRITICAL_SCORE_CRITERIA = ["safety", "relevance", "authenticity"] as const;

export interface ScorecardResult {
  total: number;
  maxTotal: number;
  passed: boolean;
  criticalPassed: boolean;
  failedCriticalCriteria: string[];
}

export const DEFAULT_SCORE_KEYS = [
  "relevance",
  "value",
  "authenticity",
  "safety",
  "platformFit",
  "completeness",
  "language",
  "cta",
  "visual",
  "antiSlop",
] as const;

/**
 * B724 — взвешенный гейт допуска:
 * Заменяет жесткое требование «>=4 по всем 10 критериям» на взвешенную сумму >=35 из 50
 * при условии, что критические критерии (safety, authenticity/factualAccuracy, relevance) >= 4.
 */
export function calculateWeightedScore(
  scores: Record<string, unknown> | null | undefined,
  scoreKeys: readonly string[] = DEFAULT_SCORE_KEYS,
  threshold = 35,
): ScorecardResult {
  const maxTotal = scoreKeys.length * 5;
  if (!scores || typeof scores !== "object") {
    return {
      total: 0,
      maxTotal,
      passed: false,
      criticalPassed: false,
      failedCriticalCriteria: [...CRITICAL_SCORE_CRITERIA],
    };
  }

  let total = 0;
  for (const key of scoreKeys) {
    const rawVal = scores[key];
    const scoreVal = rawVal !== undefined
      ? Number(rawVal)
      : (key === "authenticity" ? Number(scores.factualAccuracy) : 0);
    const score = Number.isFinite(scoreVal) && scoreVal > 0 ? scoreVal : 0;
    total += score;
  }

  const failedCriticalCriteria: string[] = [];

  const safetyScore = Number(scores.safety);
  if (!Number.isFinite(safetyScore) || safetyScore < 4) {
    failedCriticalCriteria.push("safety");
  }

  const relevanceScore = Number(scores.relevance);
  if (!Number.isFinite(relevanceScore) || relevanceScore < 4) {
    failedCriticalCriteria.push("relevance");
  }

  const authScore = Number(scores.authenticity ?? scores.factualAccuracy);
  if (!Number.isFinite(authScore) || authScore < 4) {
    failedCriticalCriteria.push("authenticity");
  }

  const criticalPassed = failedCriticalCriteria.length === 0;
  const targetThreshold = scoreKeys.length === 10
    ? threshold
    : Math.ceil(scoreKeys.length * 5 * 0.7);
  const passed = criticalPassed && total >= targetThreshold;

  return {
    total,
    maxTotal,
    passed,
    criticalPassed,
    failedCriticalCriteria,
  };
}

const EMOJI = /\p{Extended_Pictographic}/gu;
const URL = /https?:\/\/\S+/gi;
const HASHTAG = /(?:^|\s)#[\p{L}\p{N}_]+/gu;

/**
 * Слова-затычки, по которым русскоязычный читатель узнаёт машину.
 *
 * Список закрытый и намеренно короткий: каждое вхождение — раунд правки, и
 * ложное срабатывание здесь стоит дороже пропуска. Сюда попадает только то,
 * что не имеет осмысленного применения в нашем материале ни при каких условиях.
 */
const FILLER_PHRASES = [
  "в современном мире",
  "в наше время",
  "важно понимать",
  "стоит отметить",
  "давайте разберёмся",
  "давайте разберемся",
  "не секрет, что",
  "каждый из нас",
  "вы не одиноки",
  "ключевой момент",
  "погружение в",
  "в конечном счёте",
  "в конечном счете",
  "подводя итог",
  "надеюсь, было полезно",
];

/** Финальная мораль: материал обязан кончаться действием, вопросом или деталью. */
const MORAL_OPENERS = ["помните", "главное", "в итоге", "таким образом", "запомните"];

/**
 * B705 §11.4 — артефакты переписки, перенесённые из `blader/humanizer` §20.
 *
 * Модель дописывает к посту хвост из чата с пользователем: «надеюсь, было
 * полезно», «если есть вопросы — спрашивайте». В ленте социальной сети такой
 * хвост не значит ничего и выдаёт машину сразу: пост никому лично не отвечает.
 */
const CHAT_ARTIFACTS = [
  "надеюсь, это поможет",
  "надеюсь, было полезно",
  "надеюсь, эта информация",
  "если у вас есть вопросы",
  "если остались вопросы",
  "спасибо за внимание",
  "дайте знать, если",
  "буду рад помочь",
  "буду рада помочь",
  "не стесняйтесь обращаться",
  "с уважением,",
];

/** Глаголы призыва. Призыв — это действие, а не адрес. */
const CTA_VERBS = [
  "откр", "попроб", "задай", "начн", "разбер", "посмотр", "провер",
  "опиш", "расскаж", "сравн", "узна",
];

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function paragraphsOf(text: string): string[] {
  return text
    .split(/\n\s*\n/u)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

function withoutUrls(text: string): string {
  return text.replace(URL, " ");
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

/**
 * Правила размера и формы: всё, что задано числом в контракте площадки.
 *
 * Отдаём не «да/нет», а насколько промахнулись: «сократи на 214 символов»
 * исполнимо, «слишком длинно» — нет. Это правило B640, и оно здесь сохранено.
 */
function inspectShape(draft: DraftUnderInspection, c: PlatformContract): DraftDefect[] {
  const defects: DraftDefect[] = [];
  const text = draft.text.trim();
  const length = text.length;

  if (c.maxCharacters !== null && length > c.maxCharacters) {
    const excess = length - c.maxCharacters;
    defects.push({
      rule: "length-over",
      issue: `Текст ${length} символов при пределе площадки ${c.maxCharacters} — перебор на ${excess}.`,
      brief: `Сократи минимум на ${excess} символов (цель — не больше ${c.maxCharacters} вместе со ссылкой). Убирай развитие и примеры, а не смысл, хук и призыв.`,
    });
  }
  if (length < c.minCharacters) {
    const missing = c.minCharacters - length;
    defects.push({
      rule: "length-under",
      issue: `Текст ${length} символов при нижней границе площадки ${c.minCharacters} — не хватает ${missing}.`,
      brief: `Допиши минимум ${missing} символов: разверни один пример или добавь конкретную сцену. Не добавляй воду и повторы — площадка не читает материал короче ${c.minCharacters}.`,
    });
  }

  if (c.maxTitleCharacters !== null && draft.title.trim().length > c.maxTitleCharacters) {
    defects.push({
      rule: "title-over",
      issue: `Заголовок ${draft.title.trim().length} символов при пределе ${c.maxTitleCharacters}.`,
      brief: `Сократи заголовок до ${c.maxTitleCharacters} символов, сохранив обещание, которое раскрыто в теле.`,
    });
  }

  const paragraphs = paragraphsOf(text);
  if (paragraphs.length > c.maxParagraphs) {
    defects.push({
      rule: "paragraphs-over",
      issue: `${paragraphs.length} абзацев при пределе площадки ${c.maxParagraphs}.`,
      brief: `Сведи материал к ${c.maxParagraphs} абзацам: объедини соседние мысли, а не режь смысл.`,
    });
  }
  const longParagraph = paragraphs.find((p) => p.length > c.maxParagraphCharacters);
  if (longParagraph) {
    defects.push({
      rule: "paragraph-too-long",
      issue: `Абзац на ${longParagraph.length} символов при пределе ${c.maxParagraphCharacters} — читается как стена текста.`,
      brief: `Разбей абзацы длиннее ${c.maxParagraphCharacters} символов на два. Начало длинного абзаца: «${longParagraph.slice(0, 60)}…».`,
    });
  }

  if (c.subheadingEveryCharacters !== null && length > c.subheadingEveryCharacters) {
    const expected = Math.floor(length / c.subheadingEveryCharacters);
    const subheadings = paragraphs.filter((p) => p.length < 90 && !/[.!?…]$/u.test(p)).length;
    if (subheadings < expected) {
      defects.push({
        rule: "subheadings-missing",
        issue: `На ${length} символов приходится ${subheadings} подзаголовков, нужно не меньше ${expected}.`,
        brief: `Добавь подзаголовки — по одному примерно каждые ${c.subheadingEveryCharacters} символов. Не делай их однотипными: «Что такое… Почему это… Как с этим…» читается как машинный текст.`,
      });
    }
  }

  if (c.mediaBriefRequired && !draft.mediaBrief?.trim()) {
    defects.push({
      rule: "media-brief-missing",
      issue: `Площадка ${draft.platform} не принимает материал без визуальной идеи, а поле mediaBrief пустое.`,
      brief: "Заполни mediaBrief: что в кадре, что написано на изображении (не больше 7 слов), настроение и alt-текст — так, чтобы картинку собрали без уточняющих вопросов.",
    });
  }

  return defects;
}

/** Хэштеги, эмодзи, ссылки и призыв — политика площадки, а не вкус автора. */
function inspectSurface(draft: DraftUnderInspection, c: PlatformContract): DraftDefect[] {
  const defects: DraftDefect[] = [];
  const text = draft.text;

  const hashtags = countMatches(text, HASHTAG);
  if (hashtags > c.maxHashtags) {
    defects.push({
      rule: "hashtags-over",
      issue: `${hashtags} хэштегов при пределе площадки ${c.maxHashtags}.`,
      brief: `Оставь не больше ${c.maxHashtags} действительно тематических хэштегов. Блок хэштегов читается как сигнал спама и охвата не добавляет.`,
    });
  }
  if (hashtags < c.minHashtags) {
    defects.push({
      rule: "hashtags-under",
      issue: `${hashtags} хэштегов при нижней границе площадки ${c.minHashtags}.`,
      brief: `Добавь ${c.minHashtags - hashtags} тематических хэштега — на этой площадке по ним действительно ищут.`,
    });
  }

  const emoji = countMatches(text, EMOJI);
  if (emoji > c.maxEmoji) {
    defects.push({
      rule: "emoji-over",
      issue: `${emoji} эмодзи при пределе площадки ${c.maxEmoji}.`,
      brief: `Оставь не больше ${c.maxEmoji}: эмодзи здесь — навигация по тексту, а не украшение каждой строки.`,
    });
  }
  const emojiLineStart = text.split("\n").some((line) => EMOJI.test(line.trimStart().slice(0, 2)));
  EMOJI.lastIndex = 0;
  if (emojiLineStart) {
    defects.push({
      rule: "emoji-line-start",
      issue: "Эмодзи стоит в начале строки как маркер списка — самый узнаваемый признак машинного поста.",
      brief: "Убери эмодзи из начала строк. Если нужен список — обычное тире или цифра.",
    });
  }

  const links = countMatches(text, URL);
  if (links > c.maxLinks) {
    const reason = c.linksClickable
      ? `Площадка допускает ${c.maxLinks} ссылок в теле.`
      : "В подписи этой площадки ссылки НЕ кликабельны — адрес в тексте бесполезен.";
    defects.push({
      rule: "links-over",
      issue: `${links} ссылок в тексте. ${reason}`,
      brief: c.linksClickable
        ? `Оставь ${c.maxLinks === 0 ? "текст без ссылок" : `не больше ${c.maxLinks} ссылки`}.`
        : "Убери адрес из подписи и назови словами, что человека ждёт по ссылке в шапке профиля.",
    });
  }

  return defects;
}

/**
 * Призыв: политика площадки решает, обязателен он, редок или запрещён.
 *
 * B700 измерил, что пустое поле `cta` система заполняла строкой
 * «Открыть по ссылке в тексте: <url>», и проверка «CTA есть» проходила всегда.
 * Поэтому призыв меряется СЛОВАМИ и глаголом действия, а не наличием поля.
 */
function inspectCta(draft: DraftUnderInspection, c: PlatformContract): DraftDefect[] {
  const defects: DraftDefect[] = [];
  const cta = (draft.cta ?? "").trim();
  const ctaWords = withoutUrls(cta).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1);
  const hasVerb = CTA_VERBS.some((stem) => ctaWords.some((w) => w.toLowerCase().startsWith(stem)));
  const hasCta = ctaWords.length >= 2 && hasVerb;

  if (c.ctaPolicy === "required" && !hasCta) {
    defects.push({
      rule: "cta-missing",
      issue: ctaWords.length >= 2
        ? `Призыв «${cta}» не называет действие: в нём нет глагола в повелительном наклонении.`
        : "Призыв отсутствует или состоит из одного адреса. Голая ссылка — это не призыв.",
      brief: "Напиши призыв словами: глагол действия плюс конкретная польза. Например «Разберите свою ситуацию по шагам». Адрес призывом не считается.",
    });
  }

  if (c.ctaPolicy === "discouraged" && hasCta) {
    defects.push({
      rule: "cta-forbidden",
      issue: `На площадке ${draft.platform} прямой призыв — дефект: он читается как реклама и стоит нам охвата и репутации.`,
      brief: "Убери призыв и ссылку целиком. Материал здесь работает сам по себе; переход человек находит через профиль.",
    });
  }

  // Позиция призыва: у Дзена ранняя ссылка роняет показ материала в ленте.
  if (c.ctaMinPosition > 0) {
    const firstUrl = draft.text.search(URL);
    if (firstUrl >= 0) {
      const share = firstUrl / Math.max(1, draft.text.length);
      if (share < c.ctaMinPosition) {
        defects.push({
          rule: "cta-too-early",
          issue: `Ссылка стоит на ${Math.round(share * 100)}% текста при пороге ${Math.round(c.ctaMinPosition * 100)}%.`,
          brief: `Перенеси ссылку и призыв в последние ${Math.round((1 - c.ctaMinPosition) * 100)}% материала. Ранняя ссылка на этой площадке снижает показы в ленте — это потеря охвата, а не вопрос вкуса.`,
        });
      }
    }
  }

  return defects;
}

/** Хук: то, что видно до обрезки лентой, обязано содержать причину читать дальше. */
function inspectHook(draft: DraftUnderInspection, c: PlatformContract): DraftDefect[] {
  const defects: DraftDefect[] = [];
  const head = draft.text.trim().slice(0, c.hookCharacters);

  if (/\?/u.test(draft.text.trim().slice(0, 60))) {
    defects.push({
      rule: "hook-rhetorical-question",
      issue: "Материал открывается риторическим вопросом («Знакомо?», «Бывало такое?») — штамп машинного текста.",
      brief: "Замени первую строку на факт, число, прямую речь в кавычках или конкретную сцену. Вопрос в первых 60 символах не ставим.",
    });
  }

  const filler = FILLER_PHRASES.find((phrase) => head.toLowerCase().includes(phrase));
  if (filler) {
    defects.push({
      rule: "hook-filler",
      issue: `Хук занят разогревом: «${filler}». До обрезки лентой видно только ${c.hookCharacters} символов, и они потрачены впустую.`,
      brief: `Начни сразу с сути. В первые ${c.hookCharacters} символов обязана уложиться причина читать дальше.`,
    });
  }

  return defects;
}

/** Заголовок Дзена обязан быть отвечен первым абзацем — иначе обвал дочитывания. */
function inspectTitleAnswered(draft: DraftUnderInspection, c: PlatformContract): DraftDefect[] {
  if (c.subheadingEveryCharacters === null) return [];
  const nouns = draft.title
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 5);
  if (nouns.length === 0) return [];
  const opening = draft.text.toLowerCase().slice(0, 400);
  const found = nouns.some((word) => opening.includes(word.slice(0, Math.max(4, word.length - 2))));
  if (found) return [];
  return [{
    rule: "title-not-answered",
    issue: "Ни одно ключевое слово заголовка не встречается в первых 400 символах — читатель не находит обещанного и уходит.",
    brief: "Перепиши первый абзац так, чтобы он ОТВЕЧАЛ на заголовок сразу, теми же словами. Разогрев перед ответом на этой площадке роняет дочитывание.",
  }];
}

/** Признаки машинного текста, которые считаются без понимания смысла. */
function inspectSlop(draft: DraftUnderInspection, c: PlatformContract): DraftDefect[] {
  const defects: DraftDefect[] = [];
  const text = draft.text;
  const body = withoutUrls(text);

  const filler = FILLER_PHRASES.find((phrase) => body.toLowerCase().includes(phrase));
  if (filler) {
    defects.push({
      rule: "filler-phrase",
      issue: `Слово-затычка: «${filler}». Это штамп, по которому читатель узнаёт машинный текст.`,
      brief: `Убери «${filler}» и скажи то же самое конкретно, либо не говори вовсе.`,
    });
  }

  // Ложная антитеза «не просто X, а Y» / «это не X, это Y».
  const antithesis = /\bне\s+просто\s+[^.!?]{1,60}[—–-]\s*(а|это)\b/iu.test(body)
    || /\bэто\s+не\s+[^.!?]{1,50},?\s+это\s+/iu.test(body);
  if (antithesis) {
    defects.push({
      rule: "false-antithesis",
      issue: "Ложная антитеза «не просто X — а Y» / «это не X, это Y» — самый узнаваемый маркер русского ИИ-текста.",
      brief: "Перепиши без противопоставления: скажи прямо, что это, одним утверждением.",
    });
  }

  // Финальная мораль.
  const sentences = sentencesOf(body);
  const last = sentences[sentences.length - 1]?.toLowerCase() ?? "";
  const moral = MORAL_OPENERS.find((opener) => last.startsWith(opener));
  if (moral) {
    defects.push({
      rule: "closing-moral",
      issue: `Материал заканчивается шаблонной моралью («${moral}…»).`,
      brief: "Закончи действием, вопросом или конкретной деталью. Обобщающий финальный абзац убери целиком.",
    });
  }

  // Мета-текст о себе.
  if (/\b(как ии|как нейросет|в этом посте я|наш сервис поможет|наша платформа поможет)/iu.test(body)) {
    defects.push({
      rule: "meta-text",
      issue: "В тексте есть мета-ремарка о себе или конструкция «наш сервис поможет вам».",
      brief: "Убери упоминание себя как автора и говори о человеке, а не о платформе.",
    });
  }

  /*
   * Тире. Правило переписано после поправки владельца 2026-08-12.
   *
   * Прежняя версия ограничивала ПЛОТНОСТЬ длинных тире и требовала заменять
   * дефис на «—». Это было ровно наоборот. Символа «—» нет ни на одной
   * клавиатуре: поставить его естественным путём человек не может, и в поле
   * ввода Threads, VK или Telegram он набирает обычный дефис «-». Значит само
   * присутствие «—» и есть признак машины, а порог «не больше N на 1000»
   * узаконивал именно то, что нужно запрещать.
   *
   * Грамматика русского при этом не страдает: дефис в роли тире — то, как
   * пишет живой человек, и читается он как живой человек, а не как ошибка.
   *
   * Исключение одно: у Дзена свой редактор с автотипографикой, «—» появляется
   * там без участия автора, и признаком не является.
   */
  const emDashes = countMatches(body, /[—–]|(?<=\s)--(?=\s)/gu);
  if (!c.emDashAllowed && emDashes > 0) {
    defects.push({
      rule: "em-dash-present",
      issue: `В тексте ${emDashes} длинных или коротких тире («—», «–», «--»). Этих символов нет на клавиатуре: человек в поле ввода набирает обычный дефис. Это самый надёжный признак машинного текста.`,
      brief: "Замени каждое на обычный дефис «-» с пробелами, либо, по убыванию предпочтения: точка (новое предложение), запятая (короткая вставка), двоеточие (объяснение), скобки (настоящая вставка). Короткое тире «–» и двойной дефис «--» тоже считаются.",
    });
  }
  if (c.emDashAllowed && /\S—|—\S/u.test(body)) {
    defects.push({
      rule: "em-dash-spacing",
      issue: "Длинное тире стоит без пробела с одной из сторон — это калька с английского em dash.",
      brief: "Поставь пробелы с обеих сторон длинного тире.",
    });
  }

  const ellipsis = countMatches(body, /…|\.\.\./gu);
  if (ellipsis > c.maxEllipsis) {
    defects.push({
      rule: "ellipsis-over",
      issue: `Многоточий ${ellipsis} при пределе ${c.maxEllipsis}.`,
      brief: "Убери лишние многоточия: недосказанность здесь читается как пустота, а не как глубина.",
    });
  }
  const bangs = countMatches(body, /!/gu);
  if (bangs > c.maxExclamations) {
    defects.push({
      rule: "exclamation-over",
      issue: `Восклицательных знаков ${bangs} при пределе ${c.maxExclamations}.`,
      brief: "Сними восклицания: наша аудитория часто читает в тревоге, и повышенный тон её отталкивает.",
    });
  }

  // Симметрия абзацев: человек так не пишет.
  const paragraphs = paragraphsOf(body);
  if (paragraphs.length >= 3) {
    for (let i = 0; i + 2 < paragraphs.length; i += 1) {
      const window = [paragraphs[i], paragraphs[i + 1], paragraphs[i + 2]].map((p) => p.length);
      const min = Math.min(...window);
      const max = Math.max(...window);
      if (min > 0 && (max - min) / max < 0.1) {
        defects.push({
          rule: "paragraph-symmetry",
          issue: "Три абзаца подряд одинаковой длины — текст выглядит сгенерированным по шаблону.",
          brief: "Сделай ритм рваным: хотя бы один абзац в одно предложение и хотя бы один заметно длиннее остальных.",
        });
        break;
      }
    }
  }

  /*
   * B705 §11.4 — пять правил, перенесённых из `blader/humanizer` (35 034 ★).
   *
   * Портированы, а не скопированы: скилл английский, и часть его правил в
   * русский не переносится (§19 требует прямых кавычек вместо «ёлочек», §17 про
   * Title Case, §7 — словарь английских слов-маркеров).
   *
   * ДВА ПРАВИЛА ИЗ СЕМИ СЮДА НЕ ПЕРЕНЕСЕНЫ, И ЭТО НЕ ЗАБЫВЧИВОСТЬ. §11
   * «синонимическая карусель» (одна мысль пересказана синонимами) и §21
   * «заполнение пробелов домыслом» требуют понимания смысла: отличить карусель
   * от развития мысли, а домысел от факта регулярка не может. Граница файла
   * проведена именно здесь (см. шапку), и оба остаются работой редактора.
   */

  // §10, правило трёх. Одна триада — нормальный русский. Две и больше в одном
  // материале — ритм, который человек не выдерживает случайно.
  const triads = countMatches(
    body,
    /[^.!?,;:()]{4,40},\s+[^.!?,;:()]{4,40}\s+и\s+[^.!?,;:()]{4,40}[.!?]/gu,
  );
  if (triads >= 2) {
    defects.push({
      rule: "rule-of-three",
      issue: `Перечисление ровно из трёх частей встречается ${triads} раза. Правило трёх — самый частый ритм машинного текста.`,
      brief: "Сломай ритм: в одном месте оставь два пункта, в другом — четыре, либо разверни один пункт в предложение.",
    });
  }

  // §12, ложный диапазон. Настоящий диапазон измерим («от 5 до 10 минут»),
  // риторический — это фигура речи «от тревоги до апатии», охватывающая всё и
  // не значащая ничего.
  const falseRange = Array.from(
    body.matchAll(/от\s+([^.,!?;:()]{3,30})\s+до\s+([^.,!?;:()]{3,30})/giu),
  ).find(([match]) => !/\d/u.test(match));
  if (falseRange) {
    defects.push({
      rule: "false-range",
      issue: `Риторический диапазон «${falseRange[0].trim()}» охватывает всё и потому не сообщает ничего.`,
      brief: "Назови один конкретный случай вместо диапазона, либо сделай диапазон измеримым (числа, срок).",
    });
  }

  // §15, избыток жирного. Порог растёт с длиной: в длинной статье два
  // выделения законны, в коротком посте — уже перебор.
  const boldSpans = countMatches(text, /\*\*[^*\n]{2,}\*\*/gu);
  const boldBudget = Math.max(2, Math.round(body.length / 700));
  if (boldSpans > boldBudget) {
    defects.push({
      rule: "bold-over",
      issue: `Жирных выделений ${boldSpans} при разумных ${boldBudget} на такую длину. Когда выделено многое, не выделено ничто.`,
      brief: "Оставь не больше одного-двух выделений на весь материал: то, что читатель обязан унести, если прочтёт одну строку.",
    });
  }

  // §16, список с жирным заголовком и двоеточием — форма справки, а не поста.
  // Двоеточие бывает и внутри выделения («**Записать:**»), и снаружи
  // («**Записать**:») — модель пишет обоими способами, признак один и тот же.
  if (/^\s*(?:[-*•—]|\d+[.)])?\s*\*\*[^*\n]{2,60}(?::\*\*|\*\*\s*:)/mu.test(text)) {
    defects.push({
      rule: "bold-list-header",
      issue: "Список сделан в форме «**Заголовок:** пояснение» — так выглядит справка, сгенерированная моделью, а не пост.",
      brief: "Убери жирные подзаголовки внутри пунктов: пиши пункт одной живой фразой без двоеточия-разделителя.",
    });
  }

  // §20, артефакты переписки: хвост из чата, приклеенный к посту.
  const artifact = CHAT_ARTIFACTS.find((phrase) => body.toLowerCase().includes(phrase));
  if (artifact) {
    defects.push({
      rule: "chat-artifact",
      issue: `В посте остался хвост из переписки: «${artifact}». Пост не отвечает никому лично.`,
      brief: `Убери «${artifact}» целиком: заканчивай материал действием или деталью, а не вежливой формулой.`,
    });
  }

  // Конкретные якоря: цифра, срок, прямая речь. Их машина не выдумывает даром.
  const anchors = countMatches(body, /\d/gu) > 0 ? 1 : 0;
  const quotes = /[«"][^»"]{6,}[»"]/u.test(body) ? 1 : 0;
  if (anchors + quotes === 0 && body.length >= c.minCharacters) {
    defects.push({
      rule: "no-concrete-anchor",
      issue: "В материале нет ни одного конкретного якоря: ни числа, ни срока, ни прямой речи.",
      brief: "Добавь хотя бы один якорь из реальности — число, срок или дословную формулировку в кавычках. Без него текст подходит любому продукту в нише.",
    });
  }

  return defects;
}

/**
 * Полная проверка черновика против контракта площадки.
 *
 * Возвращает ВСЕ найденные дефекты сразу, а не первый: автор должен получить
 * весь список за один раунд. Выдавать замечания по одному — это тот самый
 * несходящийся цикл, который B700 уже измерил и запретил.
 */
export function inspectDraft(
  draft: DraftUnderInspection,
  /*
   * B706 ступень 1: контракт можно передать снаружи — тогда действуют
   * переопределения из `platform_settings` (`resolvePlatformContract`).
   * Параметр необязателен намеренно: функция обязана остаться синхронной и
   * проверяемой тестом без базы, а чтение настроек — забота вызывающего.
   */
  override?: PlatformContract,
): DraftDefect[] {
  /*
   * Площадка без плейбука не проверяется вовсе — правило B640 «незнакомая
   * площадка не изобретает себе ограничений». Строгость здесь была бы отказом
   * вниз: новая площадка молча перестала бы публиковаться.
   *
   * Явно переданный контракт — исключение: его прислал вызывающий, значит
   * правила для этой площадки он уже знает.
   */
  if (!override && !hasPlatformPlaybook(draft.platform)) return [];
  const contract = override ?? platformContract(draft.platform);
  return [
    ...inspectShape(draft, contract),
    ...inspectSurface(draft, contract),
    ...inspectCta(draft, contract),
    ...inspectHook(draft, contract),
    ...inspectTitleAnswered(draft, contract),
    ...inspectSlop(draft, contract),
  ];
}
