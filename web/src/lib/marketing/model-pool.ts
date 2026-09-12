import { AIProvider } from "@prisma/client";

/**
 * Providers with an existing connector and a usable free quota/free model.
 * Paid-only providers (including YandexGPT) are deliberately not part of the
 * autonomous marketing pool.
 */
export const MARKETING_FREE_PROVIDERS = [
  AIProvider.OPENROUTER,
  AIProvider.GEMINI,
  AIProvider.CEREBRAS,
  AIProvider.GROQ,
  AIProvider.MISTRAL,
  AIProvider.COHERE,
  AIProvider.OPENAI,
  // B703 — семь коннекторов на бесплатных тарифах. Список важен не только
  // как «что видно в суперадминке»: трансграничный гейт пускает публичный
  // SMM-контур ровно по нему (`cross-border-gate.ts`), и провайдер вне списка
  // получит отказ политики, а не отказ модели.
  AIProvider.KILOCODE,
  AIProvider.NVIDIA,
  AIProvider.OPENCODE_ZEN,
  AIProvider.TOKENROUTER,
  AIProvider.SAMBANOVA,
  AIProvider.HUGGINGFACE,
  AIProvider.POLLINATIONS,
] as const;

/**
 * Providers admitted to unattended generation today. The wider list above is
 * still visible in superadmin, but a connector enters this active list only
 * when it has both a free/trial quota and a model released on or after the
 * rolling freshness boundary. Direct OpenAI API has no free tier, so it
 * remains observable but does not silently create paid requests.
 */
export const MARKETING_ACTIVE_PROVIDERS = [
  AIProvider.OPENROUTER,
  AIProvider.GEMINI,
  AIProvider.GROQ,
  AIProvider.MISTRAL,
  // B703 — шесть из семи новых коннекторов. Pollinations в активный список НЕ
  // входит: на его бесплатном тарифе одна модель, gpt-oss-20b от 2025-08-05,
  // то есть старше рубежа свежести на полгода. Придумать ему свежее имя
  // модели значило бы получить 404 в бою — ровно та ошибка, от которой
  // предостерегает комментарий у предпочтений редактора ниже.
  AIProvider.KILOCODE,
  AIProvider.NVIDIA,
  AIProvider.OPENCODE_ZEN,
  AIProvider.SAMBANOVA,
  AIProvider.HUGGINGFACE,
] as const;

/**
 * B719 — ТРОЕ ВЫВЕДЕНЫ ИЗ АКТИВНОГО ПУЛА ПО РЕШЕНИЮ ВЛАДЕЛЬЦА 2026-08-23.
 *
 * Не «давно не отвечали», а НИ РАЗУ за всю сохранённую историю обращений
 * (`ai_attempts` с 2026-05-08). Замер прода 2026-08-23, окно 7 суток:
 *
 *   TOKENROUTER   0 успехов / 61 отказ — все HTTP_503, последний успех 08-12
 *   COHERE        0 / 27              — все HTTP_429, последний успех 08-06
 *   CEREBRAS      0 / 7               — все HTTP_402, последний успех 07-28
 *
 * Коды различают причины, и ни одна не проходит сама: 503 — у провайдера нет
 * мощности, 429 без единого успеха — бесплатный тариф выбран навсегда, 402 —
 * счёт (`INSUFFICIENT_CREDITS` в самом credential'е). Это не «дорога занята»,
 * это «дороги нет».
 *
 * ⚠ ПОЧЕМУ ЭТО НЕ КОСМЕТИКА. Мёртвый провайдер в активном пуле стоит денег
 * дважды. Во-первых, каждое обращение к нему списывается из бюджета материала
 * (`maxStructuredAttemptsPerMaterial`) — то есть материал умирает от расхода,
 * а не от качества; ровно дефект B699. Во-вторых, сам бюджет считается ОТ
 * РАЗМЕРА ПУЛА, поэтому трое мёртвых раздували его на три обращения, которые
 * гарантированно уходили в никуда.
 *
 * Из `MARKETING_FREE_PROVIDERS` они НЕ убраны намеренно: список выше — это
 * ещё и периметр трансграничного гейта и то, что видно в суперадминке.
 * Вернутся сами, как только у них появится успех: список активных правится
 * решением по замеру, а не молчанием.
 */
export const MARKETING_RETIRED_PROVIDERS = [
  AIProvider.CEREBRAS,
  AIProvider.COHERE,
  AIProvider.TOKENROUTER,
] as const;

/**
 * B712 — ПРЕДПОЧТЕНИЕ ВЛАДЕЛЬЦА, ЗАПИСАННОЕ ПОРЯДКОМ.
 *
 * Требование 2026-08-16 дословно: «Я бы поставил в приоритете следующие
 * провайдеры: Gemini -> Yandex -> OpenAI».
 *
 * Голова НЕ вращается: предпочтение обязано соблюдаться на каждом материале.
 * Вращается середина — бесплатный пул, у которого квоты независимы (B703).
 *
 * ⚠ YANDEX ЗДЕСЬ ЧИСЛИТСЯ, НО НЕ РАБОТАЕТ, И ЭТО НЕ ЗАБЫТЫЙ КОД. Проверено на
 * боевой базе 2026-08-17: ноль credential'ов (в таблице 16 провайдеров, YANDEX
 * не среди них), ноль моделей в каталоге, ни одного адаптера YandexGPT в
 * коде. Пока ключа нет, `marketingProviderOrder` его не отдаёт — место
 * объявлено, обращений в никуда не создаётся. Появится ключ и модель из
 * каталога — провайдер включится сам.
 */
export const MARKETING_PRIORITY_HEAD = [
  AIProvider.GEMINI,
] as const;

/**
 * B719 — У РЕДАКТОРА СВОЯ ГОЛОВА, И ЭТО НЕ СИММЕТРИЯ РАДИ СИММЕТРИИ.
 *
 * Требование владельца 2026-08-23: «модель редактора смени на более
 * оптимальную». Замер, на котором выбрана модель, — живая проба боевыми
 * ключами с прод-ноды 2026-08-23: ОДИН И ТОТ ЖЕ вердикт по одному и тому же
 * черновику (промт 245–275 токенов), измерялись латентность и `usage`.
 *
 *   mistral-small-2603        0,69 с    63 токена вывода   валидный JSON
 *   prism-ml/Ternary-Bonsai   17,9 с  1 127 токенов, из них 1 005 —
 *                                     `reasoning_tokens` (89 %)
 *   (второй прогон)           29,5 с  2 323 токена, из них 2 175 (94 %)
 *   ministral-14b-2512         8,9 с   897 токенов
 *
 * Вердикт редактора — это одно поле `verdict`, список замечаний и одна фраза
 * обоснования. Всё, что сверх, — размышление, и в замере его 89–94 % вывода.
 * Семисуточная статистика прода подтверждает то же по латентности: маршруты
 * редактора на думающих моделях отвечают 17–36 с, Mistral — 4–5 с.
 *
 *   OPENCODE_ZEN nemotron-3-ultra-free        32,3 с   87 % успеха
 *   KILOCODE     nemotron-3.5-lightning:free  19,5 с   96 %
 *   NVIDIA       nemotron-3.5-lightning-30b   18,6 с   98 %
 *   OPENROUTER   nemotron-3-super-120b:free   17,6 с   99 %
 *   MISTRAL      mistral-small-2603            5,3 с  100 % (28/28)
 *
 * Поэтому редактор спрашивает Mistral ПЕРВЫМ. Это предпочтение, а не запрет:
 * дальше идёт обычное вращение пула, и когда квота Mistral кончится, вердикт
 * вынесет кто угодно, как раньше.
 *
 * ⚠ ПОЧЕМУ НЕ ПЕРЕИМЕНОВАТЬ МОДЕЛИ У ОСТАЛЬНЫХ. У NVIDIA, Kilo, OpenCode Zen,
 * SambaNova и Hugging Face каталог `ai_provider_models` пуст — имя второй
 * модели взять неоткуда, а выдуманное имя это 404 в бою (B703). Их
 * размышление гасится директивой, см. `MARKETING_REVIEWER_REASONING_OFF`.
 */
/**
 * B740 — ГОЛОВА РЕДАКТОРА ПЕРЕДАНА GEMINI ПО РЕШЕНИЮ ВЛАДЕЛЬЦА 2026-09-12.
 *
 * Требование дословно: «давай поставим этого провайдера на место писателя и
 * редактора». Автор уже стоял на Gemini (`MARKETING_PRIORITY_HEAD`), редактор
 * — на Mistral по замеру B719.
 *
 * ⚠ ЧТО ЭТО СТОИТ, ЧЕСТНО. Замер B719 остаётся верным: на одном и том же
 * черновике Mistral отвечал 0,69–5,3 с и 63 токенами вывода, и по латентности
 * он был лучшим в пуле. Смена головы означает, что вердикт станет медленнее и
 * дороже по токенам. Владелец принял это решение, зная замер; здесь оно
 * записано порядком, а не спрятано.
 *
 * ⚠ ПОЧЕМУ MISTRAL ОСТАЁТСЯ ВТОРЫМ, А НЕ УБРАН. У Gemini на боевых ключах 15
 * отказов 429 в сутки при 60 успехах (замер B712). Голова из одного провайдера
 * означала бы, что каждый четвёртый вердикт уходит в общее вращение пула — то
 * есть к думающим моделям с латентностью 17–36 с. Mistral сразу за головой
 * ловит ровно эти случаи и стоит 5 секунд вместо тридцати.
 *
 * ⚠ РОЛИ ПО-ПРЕЖНЕМУ РАЗДЕЛЕНЫ МОДЕЛЬЮ, А НЕ ПРОВАЙДЕРОМ. У Gemini автор
 * пишет на `gemini-3.6-flash`, редактор судит на `gemini-3.5-flash` — это
 * разные строки каталога, и `completeWithValidStructure` сверяет именно
 * модель (B623). Общий провайдер независимость проверки не отменяет.
 */
export const MARKETING_REVIEWER_PRIORITY_HEAD = [
  AIProvider.GEMINI,
  AIProvider.MISTRAL,
] as const;

/**
 * B719 — ВЫКЛЮЧАТЕЛЬ РАЗМЫШЛЕНИЯ У РОЛИ РЕДАКТОРА.
 *
 * Там, где модель поменять нельзя (каталог провайдера пуст), остаётся
 * штатный выключатель самого семейства весов. У NVIDIA Nemotron это
 * системная строка `detailed thinking off`, у Qwen — `/no_think`. Обе
 * документированы производителем весов и обе безвредны для модели, которая
 * их не знает: это обычный системный текст, а не поле протокола.
 *
 * Директива ставится ТОЛЬКО редактору. Автор пишет текст, и его размышление —
 * это работа; у редактора работа — вердикт, и размышление здесь оплачивается
 * впустую (89–94 % вывода в замере выше).
 *
 * Ключ — провайдер, а не модель: модель роли редактора у провайдера ровно
 * одна и берётся из `MARKETING_REVIEWER_MODEL_PREFERENCES` рядом.
 */
export const MARKETING_REVIEWER_REASONING_OFF: Partial<Record<AIProvider, string>> = {
  [AIProvider.OPENROUTER]: "detailed thinking off",
  [AIProvider.NVIDIA]: "detailed thinking off",
  [AIProvider.KILOCODE]: "detailed thinking off",
  [AIProvider.OPENCODE_ZEN]: "detailed thinking off",
  [AIProvider.GROQ]: "/no_think",
};

/**
 * B719 — директива подавления размышления для роли, если она есть.
 *
 * Возвращает `null` для автора всегда и для провайдера без известного
 * выключателя: молчание здесь честнее, чем строка наугад.
 */
export function marketingReasoningSuppression(input: {
  feature: string;
  provider: AIProvider;
}): string | null {
  // B740: у SEO-редактора работа та же — один вердикт и список замечаний,
  // поэтому выключатель размышления распространяется и на него.
  const isReviewer = input.feature === "marketing-agent-reviewer"
    || input.feature === MARKETING_REPLY_REVIEWER_FEATURE
    || input.feature === SEO_LIBRARY_EDITOR_FEATURE;
  if (!isReviewer) return null;
  return MARKETING_REVIEWER_REASONING_OFF[input.provider] ?? null;
}

/**
 * B712 — платные маршруты. Стоят ПОСЛЕ всего бесплатного пула.
 *
 * ⚠ ПОЧЕМУ ПОСЛЕДНИМИ, А НЕ ВТОРЫМИ. Замер прода: у Gemini 15 отказов 429 за
 * сутки при 60 успехах. Платный провайдер сразу за головой означал бы 15
 * оплаченных обращений в сутки только на отказах головы — при том что
 * бесплатный пул в этот момент цел. Владелец назвал OpenAI словом «fallback»,
 * и хвост — это ровно оно.
 *
 * B719 — ПОРЯДОК ВНУТРИ ХВОСТА ЗАДАН ВЛАДЕЛЬЦЕМ 2026-08-23, ДОСЛОВНО:
 * «Яндекс стоит после бесплатного хвоста… OpenAI разрешен как иностранный
 * маршрут, поставь его перед Яндекс». Раньше здесь стоял обратный порядок по
 * требованию от 16.08 — оно отменено этим.
 *
 * Суточные потолки расхода к каждому из них — в `paid-route-budget.ts`.
 * Каждый провайдер ограничен в СВОЕЙ валюте счёта: OpenAI в долларах, Yandex
 * в рублях. Это не педантизм: пересчёт по выдуманному курсу дал бы потолок,
 * которому нельзя верить.
 */
export const MARKETING_PAID_PROVIDERS = [
  AIProvider.OPENAI,
  AIProvider.YANDEX,
] as const;

/**
 * B712 — выключатель платного хвоста. ПО УМОЛЧАНИЮ ВЫКЛЮЧЕН.
 *
 * Причина умолчания — не осторожность вообще, а конкретное правило этого
 * файла: активный пул бесплатен намеренно, «прямой OpenAI остаётся
 * наблюдаемым, но не создаёт молча платных обращений». Выкатка кода не имеет
 * права начать тратить деньги: это должно быть отдельным решением владельца,
 * принятым в тот момент, когда он его принимает, а не побочным эффектом
 * деплоя.
 *
 * B719 — ПОТОЛОК РАСХОДА ПОЯВИЛСЯ. Прежний комментарий здесь утверждал, что
 * таблицы цен у нас нет; это оказалось неверно — `model-pricing-reference.ts`
 * держит цены и Yandex (в пересчёте из прайса AI Studio), и OpenAI. Потолки и
 * их арифметика — в `paid-route-budget.ts`. Ограничитель, который работал и
 * без них, никуда не делся: платный провайдер стоит ПОСЛЕДНИМ и получает
 * обращение, только когда весь бесплатный пул отказал на этом материале.
 */
export function marketingPaidFallbackEnabled(
  env: Partial<NodeJS.ProcessEnv> = process.env,
): boolean {
  return env.MARKETING_PAID_FALLBACK_ENABLED === "true";
}

export const MARKETING_MODEL_RELEASE_CUTOFF = "2026-02-28";

/**
 * B713 §7 — СИЛЬНАЯ МОДЕЛЬ ДОСТАЁТСЯ ТОМУ, КТО ПИШЕТ.
 *
 * Замер прода 14.08 → 17.08 (`ai_attempts`, только маркетинговые обращения)
 * показал перевёрнутое распределение: флагманы пула стояли на РЕДАКТОРЕ,
 * который лишь выносит суждение, а автор — от которого зависит текст — работал
 * на самых слабых и наименее надёжных моделях.
 *
 *   nemotron-3-super-120b:free  89 успехов / 0 отказов — был у редактора
 *   mistral-medium-2604         41 / 0                 — был у редактора
 *   nemotron-3-ultra-free       27 / 2                 — был у редактора
 *   nemotron-3-ultra-550b:free  18 / 1                 — был у редактора
 *   gemma-4-31b-it:free          0 / 1                 — БЫЛ У АВТОРА
 *   deepseek-v4-flash-free       0 / 4                 — БЫЛ У АВТОРА
 *   qwen3.6-27b                 38 / 37                — у автора, он и выдал
 *                                                        утёкший <think>
 *
 * У трёх провайдеров модель автора была МЕРТВА при живой модели редактора:
 * каждое обращение автора туда — гарантированно потраченная попытка из бюджета
 * материала, то есть тот же дефект, что B703 нашёл у Hugging Face, только
 * дешевле не становится от того, что он молчаливый.
 *
 * ⚠ ПОЧЕМУ НЕ ПРОСТО «ПОМЕНЯТЬ МЕСТАМИ ВЕЗДЕ». Там, где модель редактора тоже
 * мертва, менять нечего: провайдер отдаёт автору свою единственную живую
 * модель и честно становится ОДНОМОДЕЛЬНЫМ — обе роли смотрят в одну строку,
 * и `marketingProvidersWithSingleModel()` объявляет это само. Придумать
 * вторую модель нельзя: выдуманное имя — это 404 в бою (B703).
 *
 * ⚠ GEMINI НЕ ТРОГАЕМ. У автора там `3.6-flash` — она новее редакторской
 * `3.5-flash`, то есть роли уже расставлены верно. Перестановка «ради
 * симметрии» отдала бы автору модель постарше.
 */
export const MARKETING_WRITER_MODEL_PREFERENCES: Partial<Record<AIProvider, string>> = {
  // 89/0 — сильнейшая живая модель пула. Вторая модель OpenRouter в замере
  // мертва (0/1), поэтому провайдер становится одномодельным.
  [AIProvider.OPENROUTER]: "nvidia/nemotron-3-super-120b-a12b:free",
  /**
   * B741 — АВТОР ПЕРЕВЕДЁН НА `gemini-3.8-flash`.
   *
   * Имя НЕ выдумано: модель вышла в общий доступ 2026-09-02 и объявлена
   * рабочей лошадью семейства. Это ровно та проверка, которой требует правило
   * этого файла — «выдуманное имя модели это 404 в бою» (B703).
   *
   * Перевод стал возможен и осмыслен после того, как владелец привязал к ключу
   * биллинг: на бесплатном тарифе упор шёл в 429 (замер B712: 15 отказов в
   * сутки при 60 успехах), и голова пула регулярно уступала место вращению.
   * Расход при этом ограничен потолком — см. `paid-route-budget.ts`.
   */
  [AIProvider.GEMINI]: "gemini-3.8-flash",
  [AIProvider.CEREBRAS]: "gemma-4-31b",
  [AIProvider.GROQ]: "qwen/qwen3.6-27b",
  // 41/0 против 3/0 у small: обе живы, роли меняются местами.
  [AIProvider.MISTRAL]: "mistral-medium-2604",
  [AIProvider.COHERE]: "command-a-plus-05-2026",
  // B703 — модели, ответившие боевым ключом при НУЛЕВОМ балансе (проба
  // 2026-08-11). У SambaNova и TokenRouter бесплатная модель одна на обе роли:
  // вторая отвечает 402/403. Их одиночество объявляет
  // `marketingProvidersWithSingleModel()`, а не молчание.
  // 18/1 (ultra-550b) против 9/0 (lightning): обе живы, роли меняются местами.
  [AIProvider.KILOCODE]: "nvidia/nemotron-3-ultra-550b-a55b:free",
  [AIProvider.NVIDIA]: "nvidia/nemotron-3-super-120b-a12b",
  // 27/2 против 0/4 у deepseek: провайдер становится одномодельным.
  [AIProvider.OPENCODE_ZEN]: "nemotron-3-ultra-free",
  [AIProvider.TOKENROUTER]: "moonshotai/kimi-k3-free",
  [AIProvider.SAMBANOVA]: "gemma-4-31B-it",
  [AIProvider.HUGGINGFACE]: "prism-ml/Ternary-Bonsai-27B-AWQ-4bit",
  /**
   * B719 — платный хвост. Имена НЕ выдуманы, оба сверены с боевыми данными:
   * `gpt-5.4-mini` есть в каталоге прода `ai_provider_models` (там же лежит
   * его датированный псевдоним `gpt-5.4-mini-2026-03-17`, откуда и взята дата
   * выпуска), `yandexgpt/latest` — тот самый маршрут, которым платформа уже
   * ходит в YandexGPT Pro (`yandex-adapter.ts`, `YANDEX_TEXT_MODELS`).
   *
   * ⚠ `gpt-4o-mini` в `model_override` боевого credential'а СЮДА НЕ ГОДИТСЯ:
   * модель 2024 года, рубеж свежести пула — 2026-02-28. Явное имя здесь
   * сильнее override'а, потому что маршрут получает `model` параметром.
   */
  [AIProvider.OPENAI]: "gpt-5.4-mini",
  [AIProvider.YANDEX]: "yandexgpt/latest",
};

/**
 * B699 — у Mistral редактор перестал быть автором.
 *
 * Обе роли указывали на `mistral-small-2603`, и в день, когда все остальные
 * провайдеры исчерпали квоты, единственный живой провайдер оказывался
 * непригоден: «в пуле не осталось модели, отличной от модели автора». Модель
 * `mistral-medium-2604` есть в каталоге `ai_provider_models` прода и свежее
 * рубежа 2026-02-28.
 *
 * У Cerebras, Groq и Cohere вторая пригодная модель не проставлена намеренно:
 * в снятом каталоге её нет, а выдуманное имя модели — это 404 в бою. Их
 * одиночество честно объявляется через `marketingProvidersWithSingleModel`.
 */
export const MARKETING_REVIEWER_MODEL_PREFERENCES: Partial<Record<AIProvider, string>> = {
  // B713: обе роли смотрят в одну модель — вторая (gemma-4-31b-it:free) в
  // замере 14–17.08 дала 0 успехов. Провайдер одномодельный, и это объявлено.
  [AIProvider.OPENROUTER]: "nvidia/nemotron-3-super-120b-a12b:free",
  /**
   * B741 — редактору достаётся `gemini-3.6-flash`, освободившаяся у автора.
   *
   * ⚠ РАЗНЫЕ МОДЕЛИ У РОЛЕЙ — ЭТО НЕ ВКУС, А УСЛОВИЕ НЕЗАВИСИМОСТИ ПРОВЕРКИ.
   * `completeWithValidStructure` сверяет именно модель (B623): совпади они,
   * редактор судил бы собственный текст. Поэтому при смене модели автора
   * модель редактора обязана сдвинуться следом, а не остаться на месте.
   */
  [AIProvider.GEMINI]: "gemini-3.6-flash",
  [AIProvider.CEREBRAS]: "gemma-4-31b",
  [AIProvider.GROQ]: "qwen/qwen3.6-27b",
  [AIProvider.MISTRAL]: "mistral-small-2603",
  [AIProvider.COHERE]: "command-a-plus-05-2026",
  // B703. У Hugging Face бесплатны ровно две модели — обе `Ternary-Bonsai-27B`
  // с ценой входа $0, разной сборки; на них и разводились роли. B713: сборка
  // `-gguf` в замере дала 0 успехов при 4 отказах, поэтому вторая роль уходит
  // на живую сборку, а провайдер становится одномодельным.
  [AIProvider.KILOCODE]: "nvidia/nemotron-3.5-lightning:free",
  [AIProvider.NVIDIA]: "nvidia/nemotron-3.5-lightning-30b-a3b",
  [AIProvider.OPENCODE_ZEN]: "nemotron-3-ultra-free",
  [AIProvider.TOKENROUTER]: "moonshotai/kimi-k3-free",
  [AIProvider.SAMBANOVA]: "gemma-4-31B-it",
  [AIProvider.HUGGINGFACE]: "prism-ml/Ternary-Bonsai-27B-AWQ-4bit",
};

const MARKETING_MODEL_RELEASES: Readonly<Record<string, string>> = {
  "google/gemma-4-31b-it:free": "2026-04-03",
  "nvidia/nemotron-3-super-120b-a12b:free": "2026-03-11",
  // B741 — дата общего доступа `gemini-3.8-flash`, объявленная Google.
  "gemini-3.8-flash": "2026-09-02",
  "gemini-3.6-flash": "2026-07-21",
  "gemini-3.5-flash": "2026-05-19",
  "gemma-4-31b": "2026-04-03",
  "qwen/qwen3.6-27b": "2026-07-17",
  "mistral-small-2603": "2026-03-16",
  "mistral-medium-2604": "2026-04-21",
  "command-a-plus-05-2026": "2026-05-20",
  // B703 — даты не выдуманы: они сняты из полей `created` тех каталогов,
  // которые их отдают (Kilo и Hugging Face — оба OpenRouter-совместимы), и
  // сверены между каталогами для одних и тех же весов. Там, где каталог даты
  // не отдаёт (NVIDIA NIM, SambaNova, OpenCode Zen ставят `created` временем
  // ответа), взята дата тех же весов из каталога, который её отдаёт.
  "nvidia/nemotron-3.5-lightning:free": "2026-08-11",
  "nvidia/nemotron-3-ultra-550b-a55b:free": "2026-06-04",
  "nvidia/nemotron-3-super-120b-a12b": "2026-03-11",
  "nvidia/nemotron-3.5-lightning-30b-a3b": "2026-08-11",
  "deepseek-v4-flash-free": "2026-07-31",
  "nemotron-3-ultra-free": "2026-06-04",
  "moonshotai/kimi-k3-free": "2026-06-13",
  "gemma-4-31B-it": "2026-04-03",
  "prism-ml/Ternary-Bonsai-27B-AWQ-4bit": "2026-07-11",
  "prism-ml/Ternary-Bonsai-27B-gguf": "2026-07-04",
  /**
   * B719 — платный хвост. Дата `gpt-5.4-mini` взята из каталога прода: там же
   * лежит датированный псевдоним `gpt-5.4-mini-2026-03-17`, то есть дата не
   * оценка, а имя строки в каталоге.
   */
  "gpt-5.4-mini": "2026-03-17",
};

/**
 * B719 — у скользящего псевдонима нет даты выпуска, и придумывать её нельзя.
 *
 * `yandexgpt/latest` по устройству указывает на «текущую» версию: сегодня одну,
 * завтра другую. Проставить ему дату значило бы записать в допущенные не
 * модель, а обещание. Поэтому рубеж свежести к платному хвосту не применяется
 * вовсе — и это не дыра, а разные вопросы:
 *
 *   рубеж свежести отвечает «не подсунул ли БЕСПЛАТНЫЙ тариф старые веса
 *   вместо новых» — вопрос имеет смысл там, где модель нам не выбирают;
 *
 *   платный маршрут выбран владельцем поимённо, и защищает его не возраст
 *   весов, а суточный потолок расхода (`paid-route-budget.ts`).
 */
export function marketingModelFreshnessApplies(provider: AIProvider): boolean {
  return !(MARKETING_PAID_PROVIDERS as readonly AIProvider[]).includes(provider);
}

/**
 * B699 — какие модели пул вообще может предъявить, если жив только этот набор
 * провайдеров.
 */
function marketingPoolModels(providers: readonly AIProvider[]): Set<string> {
  const active = new Set<AIProvider>(MARKETING_ACTIVE_PROVIDERS);
  const models = new Set<string>();
  for (const provider of providers) {
    if (!active.has(provider)) continue;
    const writer = MARKETING_WRITER_MODEL_PREFERENCES[provider];
    const reviewer = MARKETING_REVIEWER_MODEL_PREFERENCES[provider];
    if (writer) models.add(writer);
    if (reviewer) models.add(reviewer);
  }
  return models;
}

/**
 * B699 — можно ли вообще развести автора и редактора на разные модели.
 *
 * Отвечает ДО вызова автора. Замер прода 2026-08-09: 88 успешных генераций
 * автора за сутки и ноль публикаций — текст писался, токены списывались, и
 * только потом выяснялось, что независимой модели для проверки нет. Списанные
 * токены при этом уходили с того самого потолка, из-за которого её и не было:
 * нехватка кормила сама себя.
 *
 * Провайдеры вне активного списка не учитываются: платный OpenAI виден в
 * superadmin, но молча создавать платные запросы в контент-плане он не должен
 * (запрет владельца 2026-08-09).
 */
export function marketingPoolCanSeparateRoles(providers: readonly AIProvider[]): boolean {
  return marketingPoolModels(providers).size >= 2;
}

/**
 * B699 — провайдеры, у которых обе роли ходят в одну модель.
 *
 * В одиночку такой провайдер конвейер не тянет, сколько бы ёмкости у него ни
 * было. Список держится явным и под тестом: он сократится тогда, когда у
 * провайдера появится вторая пригодная модель, а не молча.
 */
export function marketingProvidersWithSingleModel(): AIProvider[] {
  return MARKETING_ACTIVE_PROVIDERS.filter(
    (provider) => !marketingPoolCanSeparateRoles([provider]),
  );
}

/**
 * B703 — под каким именем провайдер вернул те самые веса.
 *
 * Замер прода 2026-08-13: роутер Hugging Face на запрос
 * `prism-ml/Ternary-Bonsai-27B-AWQ-4bit` отвечает каноническим именем весов
 * `Prism-ML/Ternary-Bonsai-27B` — другой регистр и без хвоста сборки. Сверка
 * шла точным совпадением строки, поэтому УСПЕШНЫЙ ответ выбрасывался как
 * «модель не одобрена», а обращение уходило в бюджет материала. За сутки так
 * пропало 14 успешных вызовов.
 *
 * Ищем одобренные записи, для которых пришедшее имя — это либо та же строка с
 * точностью до регистра, либо её начало по границе разделителя. Граница
 * обязательна: без неё `gpt-4` подошло бы к `gpt-4o-mini`, то есть к ДРУГИМ
 * весам.
 */
function approvedReleasesFor(model: string): string[] {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return [];
  const exact = Object.keys(MARKETING_MODEL_RELEASES).find(
    (key) => key.toLowerCase() === normalized,
  );
  if (exact) return [MARKETING_MODEL_RELEASES[exact]];
  return Object.entries(MARKETING_MODEL_RELEASES)
    .filter(([key]) => {
      const candidate = key.toLowerCase();
      if (!candidate.startsWith(normalized)) return false;
      const boundary = candidate.charAt(normalized.length);
      return boundary === "-" || boundary === "_" || boundary === "." || boundary === ":";
    })
    .map(([, releaseDate]) => releaseDate);
}

export function marketingModelFreshness(model: string): {
  eligible: boolean;
  releaseDate: string | null;
  reason: string;
} {
  const candidates = approvedReleasesFor(model);
  /**
   * Одно общее имя может покрывать несколько сборок одних весов. Личность
   * модели по нему не восстановить — но РЕШЕНИЕ восстановить можно, и только
   * когда оно у всех вариантов одинаково. Берём самую раннюю дату: если она
   * проходит рубеж, проходят и остальные. Неоднозначность решается отказом,
   * а не догадкой.
   */
  const releaseDate = candidates.length > 0
    ? candidates.reduce((earliest, date) => (date < earliest ? date : earliest))
    : null;
  if (!releaseDate) {
    return {
      eligible: false,
      releaseDate,
      reason: `release date is not approved for the marketing pool (cutoff ${MARKETING_MODEL_RELEASE_CUTOFF})`,
    };
  }
  const eligible = releaseDate >= MARKETING_MODEL_RELEASE_CUTOFF;
  return {
    eligible,
    releaseDate,
    reason: eligible
      ? `released ${releaseDate}`
      : `released ${releaseDate}, before cutoff ${MARKETING_MODEL_RELEASE_CUTOFF}`,
  };
}

export function marketingModelPreferences(
  feature: string,
): Partial<Record<AIProvider, string>> {
  if (feature === "marketing-agent-writer" || feature === "marketing-reply-writer") {
    return MARKETING_WRITER_MODEL_PREFERENCES;
  }
  if (feature === "marketing-agent-reviewer" || feature === "marketing-reply-reviewer") {
    return MARKETING_REVIEWER_MODEL_PREFERENCES;
  }
  /**
   * B727 — радару тем нужны ИМЕНА МОДЕЛЕЙ, а не только место в пуле.
   *
   * Пустая карта здесь означала бы «модель возьмём из каталога провайдера», а у
   * NVIDIA, Kilo, OpenCode Zen, SambaNova и Hugging Face каталог
   * `ai_provider_models` пуст (B703). Радар доходил бы только до Gemini —
   * единственного, у кого имя модели зашито в адаптер, — и вставал бы на его
   * 429 вместо того, чтобы спросить следующего.
   *
   * Берётся карта АВТОРА, а не редактора: работа радара — структурированное
   * извлечение из текста, это ближе к письму, чем к вердикту, и подавлять
   * размышление здесь не нужно.
   */
  if (feature === MARKETING_TOPIC_RADAR_FEATURE) {
    return MARKETING_WRITER_MODEL_PREFERENCES;
  }
  return {};
}

/**
 * B628 — у разговора отдельный кошелёк.
 *
 * Суточный потолок считается по ключу возможности. Пока плановые публикации и
 * ответы людям тратили ОДИН ключ, всплеск генерации плана закрывал ответы на
 * весь остаток суток: замер прода 2026-07-30 — 603 001 токен за 2,5 часа, после
 * чего ни один ответ написать было нельзя. Разговор нельзя отложить до завтра —
 * человек на другой стороне ждёт сейчас, — поэтому у него собственная ёмкость,
 * которую план не может занять в принципе.
 */
export const MARKETING_REPLY_WRITER_FEATURE = "marketing-reply-writer";
export const MARKETING_REPLY_REVIEWER_FEATURE = "marketing-reply-reviewer";

/**
 * B727 — у радара тем свой ключ возможности, а не общий с автором.
 *
 * Причина та же, по которой её завели ответам (B640): суточный потолок считается
 * по ключу. Радар зовётся в крон-проходе планировщика и по природе всплесковый —
 * дели он ёмкость с автором, один прогон планирования недели мог бы закрыть
 * выпуск постов на остаток суток.
 *
 * Ключ ОБЯЗАН стоять в этом списке: трансграничный гейт пускает публичный
 * SMM-контур ровно по нему, и вызов с незарегистрированным ключом получает
 * отказ политики (`PUBLIC_MARKETING_ROUTE_FORBIDDEN`), а не отказ модели.
 */
export const MARKETING_TOPIC_RADAR_FEATURE = "marketing-topic-radar";

/**
 * B740 — SEO-агент пишет ПУБЛИЧНЫЕ страницы Библиотеки и данных клиента не
 * видит: на вход идут поисковая фраза, тема каталога и название услуги.
 * Поэтому класс данных у него тот же, что у SMM, — `PUBLIC_MARKETING`.
 *
 * Ключи ОБЯЗАНЫ стоять здесь: трансграничный гейт пускает публичный контур
 * ровно по этому списку, и вызов с незарегистрированным ключом получает отказ
 * политики (`PUBLIC_MARKETING_ROUTE_FORBIDDEN`), а не отказ модели — то есть
 * выглядит как поломка провайдера, которой нет.
 */
export const SEO_LIBRARY_WRITER_FEATURE = "seo-library-writer";
export const SEO_LIBRARY_EDITOR_FEATURE = "seo-library-editor";

export const PUBLIC_MARKETING_AI_FEATURES = [
  "marketing-agent-writer",
  "marketing-agent-reviewer",
  MARKETING_REPLY_WRITER_FEATURE,
  MARKETING_REPLY_REVIEWER_FEATURE,
  MARKETING_TOPIC_RADAR_FEATURE,
  SEO_LIBRARY_WRITER_FEATURE,
  SEO_LIBRARY_EDITOR_FEATURE,
] as const;

export type PublicMarketingAIFeature = typeof PUBLIC_MARKETING_AI_FEATURES[number];

export function isPublicMarketingAIFeature(feature: string): feature is PublicMarketingAIFeature {
  return (PUBLIC_MARKETING_AI_FEATURES as readonly string[]).includes(feature);
}

export function marketingForeignLLMEnabled() {
  return process.env.MARKETING_FOREIGN_LLM_ENABLED === "true";
}

function stableSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Rotate the first-choice provider per material. Fallbacks retain the whole
 * pool, while `excluded` guarantees that reviewer never uses writer's
 * provider.
 *
 * B699 — `availableNow` убирает из обхода ключи, про которые в базе УЖЕ
 * записано, что они остывают.
 *
 * Замер прода 2026-08-09 15:27: один проход редактора стучался в groq, cohere,
 * openrouter, gemini и cerebras — все пять с `ALL_PROVIDERS_FAILED` — и лишь
 * шестым доходил до живого Mistral. Каждый стук считался обращением, бюджет
 * материала в 12 обращений (B680) выгорал за два раунда правки, и материал
 * умирал от расхода, а не от собственного качества.
 *
 * Пустой список означает «состояние ключей прочитать не удалось», а не
 * «живых нет»: чтение вспомогательное, и его отказ не должен молча
 * останавливать контур. Тогда обход идёт по всему пулу, как раньше.
 */
export function marketingProviderOrder(
  seed: string,
  excluded: AIProvider[] = [],
  availableNow: readonly AIProvider[] = [],
  options: { paidFallback?: boolean; role?: "writer" | "reviewer" } = {},
): AIProvider[] {
  const excludedSet = new Set(excluded);
  const availableSet = new Set(availableNow);
  const usable = (provider: AIProvider) => {
    if (excludedSet.has(provider)) return false;
    return availableSet.size === 0 || availableSet.has(provider);
  };

  /*
   * B712 — ГОЛОВА ПО ПРИОРИТЕТУ, СЕРЕДИНА ВРАЩАЕТСЯ, ХВОСТ ПЛАТНЫЙ.
   *
   * Голова берётся из `MARKETING_PRIORITY_HEAD` и НЕ участвует во вращении:
   * владелец назвал предпочтение, и оно обязано соблюдаться на каждом
   * материале, а не на каждом седьмом.
   *
   * Середина вращается как прежде. Это не украшение: у бесплатных провайдеров
   * квоты независимые, и постоянная голова выжигала бы одну, не трогая
   * остальные (B703). Вращать надо ровно то, что бесплатно и взаимозаменяемо.
   */
  /*
   * B719 — у ролей разные головы, потому что у них разная работа.
   *
   * Автор пишет текст: голову ему назвал владелец (Gemini). Редактор выносит
   * вердикт, и там выигрывает не сила модели, а её немногословность — замер
   * у `MARKETING_REVIEWER_PRIORITY_HEAD` показывает разницу в 18 раз по
   * выводу и в 26 по времени на одном и том же черновике.
   */
  const priorityHead = options.role === "reviewer"
    ? MARKETING_REVIEWER_PRIORITY_HEAD
    : MARKETING_PRIORITY_HEAD;
  const head = priorityHead.filter(
    (provider) => MARKETING_ACTIVE_PROVIDERS.includes(provider as never) && usable(provider),
  );
  const headSet = new Set<AIProvider>(head);
  const rotating = MARKETING_ACTIVE_PROVIDERS.filter(
    (provider) => !headSet.has(provider) && usable(provider),
  );
  const spun = rotating.length > 0
    ? (() => {
      const offset = stableSeed(seed) % rotating.length;
      return [...rotating.slice(offset), ...rotating.slice(0, offset)];
    })()
    : [];

  /*
   * ⚠ ПЛАТНЫЙ ХВОСТ ТОЛЬКО ПО ЯВНОМУ РАЗРЕШЕНИЮ И ТОЛЬКО ПОСЛЕДНИМ.
   *
   * `MARKETING_ACTIVE_PROVIDERS` бесплатен намеренно: комментарий к нему
   * говорит прямо, что прямой OpenAI «остаётся наблюдаемым, но не создаёт
   * молча платных обращений». Разрешение приходит параметром, а не
   * умолчанием, и платный провайдер стоит ПОСЛЕ всего бесплатного пула:
   * тогда деньги тратятся, только когда бесплатной ёмкости не осталось
   * вовсе, а не на каждом 429 у головы.
   *
   * Провайдер без ключа сюда не попадает: `availableNow` его отсечёт, а при
   * пустом `availableNow` — отсутствие credential'а в базе. Поэтому YANDEX
   * может стоять в списке до того, как он подключён, и это не создаёт
   * обращений в никуда.
   */
  /*
   * B719 — спец-случай «YANDEX только при известном списке ключей» снят.
   *
   * Он стоял здесь, пока у Yandex не было ни адаптера, ни имени модели, и
   * защищал от обращения в никуда. Оба условия закрыты: адаптер
   * (`yandex-adapter.ts`) работает в продукте давно, имя модели взято из
   * `YANDEX_TEXT_MODELS`. Провайдера без ключа по-прежнему отсекает
   * `availableNow`; на боевой базе 2026-08-23 credential'а YANDEX нет, и
   * поэтому маршрут просто не предлагается — молча и правильно.
   */
  const paid = options.paidFallback
    ? MARKETING_PAID_PROVIDERS.filter((provider) => usable(provider))
    : [];

  return [...head, ...spun, ...paid];
}

/**
 * B719 — кого маршруту SMM вообще разрешено спрашивать.
 *
 * Охрана в `aiComplete` сверялась с `MARKETING_FREE_PROVIDERS` и отвечала
 * `MARKETING_PAID_PROVIDER_BLOCKED`. Пока платного хвоста не существовало,
 * это было верно буквально. Теперь хвост разрешён владельцем поимённо, и
 * список разрешённых обязан включать его — иначе выкаченный платный маршрут
 * падал бы на собственной охране, а не на отсутствии ключа.
 *
 * ⚠ Охрана при этом не ослабляется. Список остаётся ЗАКРЫТЫМ: провайдер вне
 * его по-прежнему получает отказ политики. Расширился он ровно на тех двоих,
 * кого назвал владелец, и ровно с теми потолками расхода, что он назвал.
 */
export const MARKETING_ROUTABLE_PROVIDERS = [
  ...MARKETING_FREE_PROVIDERS,
  ...MARKETING_PAID_PROVIDERS.filter(
    (provider) => !(MARKETING_FREE_PROVIDERS as readonly AIProvider[]).includes(provider),
  ),
] as const;

export function marketingProviderFromLabel(label: string): AIProvider | null {
  const normalized = label.trim().toUpperCase();
  return (MARKETING_FREE_PROVIDERS as readonly AIProvider[]).find((provider) => provider === normalized) ?? null;
}
