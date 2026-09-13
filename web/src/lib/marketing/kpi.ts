/**
 * B743 — KPI агентов: месяц, квартал, год.
 *
 * Требование владельца 2026-09-13: «Их ключевые метрики (KPI) должны быть
 * зафиксированы и по ним они должны отчитываться, это должно подстёгивать их к
 * выполнению своей работы более успешно каждый раз».
 *
 * ⚠ ГЛАВНОЕ РЕШЕНИЕ ЭТОГО ФАЙЛА: KPI СЧИТАЕТСЯ ИЗ ТОГО, ЧТО МЫ УЖЕ МЕРИМ.
 * Красивая метрика, под которую нет замера, — это не цель, а обещание завести
 * замер; в отчёте она выглядит как работа, а на деле её никто не считает.
 * Поэтому каждая метрика ниже названа вместе с источником, и источник — живая
 * таблица или живой снимок, а не план завести таблицу.
 *
 * ⚠ ВТОРОЕ РЕШЕНИЕ: «ПОДСТЁГИВАТЬ» — ЭТО МЕХАНИКА, А НЕ УГОВОРЫ. Сказать
 * модели в промте «мы отстаём от плана» — не механизм: она ответит согласием и
 * напишет то же самое. Подстёгивает разрыв, ПРЕВРАЩЁННЫЙ В ДЕЙСТВИЕ: отставание
 * по страницам поднимает суточную норму выпуска, отставание по глубине корпуса
 * — темп дописывания, отставание по качеству опускает их обратно. Поэтому
 * `kpiPressure` возвращает не текст, а предложения правок с числами, и они
 * проходят тот же белый список границ, что и прочие правки оркестратора.
 *
 * ⚠ ТРЕТЬЕ: ЦЕЛИ ПОСТАВЛЕНЫ ОТ ЗАМЕРА, А НЕ ОТ ЖЕЛАНИЯ. Замер корпуса
 * 2026-09-12: 199 карточек Библиотеки, гейт глубины проходят 27, медиана
 * собственных слов 65. Снимок поиска тех же суток: ~120 показов, 7 переходов,
 * средняя позиция 18,4, страниц в поиске ~43. Годовая цель по глубине корпуса
 * — 100 %, потому что тонкая карточка не ранжируется вовсе и держать её нет
 * смысла; месячные и квартальные цели — линейная разбивка того же пути с
 * поправкой на темп дописывания, который владелец согласился не ускорять
 * ради обхода Яндекса.
 */

export type KpiPeriod = "month" | "quarter" | "year";
export type KpiAgent = "seo" | "smm" | "orchestrator";

/** Куда метрика должна двигаться. */
export type KpiDirection = "up" | "down";

export interface KpiDefinition {
  id: string;
  agent: KpiAgent;
  title: string;
  unit: string;
  direction: KpiDirection;
  /** Откуда берётся факт. Обязательно: метрика без источника — это обещание. */
  source: string;
  /** Зачем эта метрика. Обязательно: без ответа её нельзя защитить на разборе. */
  why: string;
  /** Замеренная точка отсчёта и дата замера. */
  baseline: { value: number; measuredAt: string };
  targets: Record<KpiPeriod, number>;
}

export const KPI_PERIOD_TITLES: Record<KpiPeriod, string> = {
  month: "месяц",
  quarter: "квартал",
  year: "год",
};

/**
 * ⚠ ПОЧЕМУ МЕТРИК МАЛО, А НЕ ДВАДЦАТЬ. Двадцать метрик — это ноль метрик:
 * по любой неделе найдётся зелёная, и отчёт превращается в витрину. У каждого
 * агента по три-четыре, и среди них обязательно есть ОГРАНИЧИТЕЛЬ — метрика,
 * которая портится, если гнать основную. Без ограничителя KPI «больше страниц»
 * выполняется выпуском мусора, и это не гипотеза: корпус из 199 карточек с
 * медианой 65 слов ровно так и набирался.
 */
export const AGENT_KPIS: readonly KpiDefinition[] = [
  // ── SEO-агент ────────────────────────────────────────────────────────────
  {
    id: "seo.indexable_share",
    agent: "seo",
    title: "Доля корпуса, проходящая гейт глубины",
    unit: "%",
    direction: "up",
    source: "libraryDepth() по всем карточкам Библиотеки, считается в коде",
    why: "Тонкая карточка не ранжируется вовсе. Это единственная метрика, которая "
      + "объясняет «за всё время нет роста в SEO»: ранжировать было нечего.",
    baseline: { value: 14, measuredAt: "2026-09-12" },
    targets: { month: 25, quarter: 55, year: 100 },
  },
  {
    id: "seo.searchable_pages",
    agent: "seo",
    title: "Страниц в поиске Яндекса",
    unit: "страниц",
    direction: "up",
    source: "Яндекс.Вебмастер, поле searchablePages суточного снимка",
    why: "Прямая проверка того, что глубина корпуса превратилась в индексацию, "
      + "а не осталась нашим внутренним числом.",
    baseline: { value: 43, measuredAt: "2026-09-12" },
    targets: { month: 70, quarter: 140, year: 260 },
  },
  {
    id: "seo.impressions",
    agent: "seo",
    title: "Показов в поиске за период",
    unit: "показов",
    direction: "up",
    source: "сумма impressions суточных снимков за период",
    why: "Показы двигаются раньше переходов и позиций: по ним видно, что новые "
      + "страницы попали в выдачу, ещё до того как они начнут собирать клики.",
    baseline: { value: 3_600, measuredAt: "2026-09-12" },
    targets: { month: 6_000, quarter: 25_000, year: 150_000 },
  },
  {
    id: "seo.unique_share",
    agent: "seo",
    title: "Доля выпущенных страниц, прошедших гейт уникальности с первого раза",
    unit: "%",
    direction: "up",
    source: "поле uniqueness строк seo_library_pages",
    why: "ОГРАНИЧИТЕЛЬ. Без него «больше страниц» выполняется переписыванием "
      + "собственного корпуса, и это ровно тот сигнал, за который домен уже "
      + "снимали с индекса 2026-08-17.",
    baseline: { value: 0, measuredAt: "2026-09-12" },
    targets: { month: 80, quarter: 90, year: 95 },
  },

  // ── SMM-агент ────────────────────────────────────────────────────────────
  {
    id: "smm.slot_fill",
    agent: "smm",
    title: "Доля закрытых слотов контент-плана",
    unit: "%",
    direction: "up",
    source: "externalPublication со статусом PUBLISHED против слотов плана периода",
    why: "Основная работа агента: план существует, чтобы выполняться. Замер "
      + "2026-08-17 показал 198 материалов, умерших не дойдя до выпуска.",
    baseline: { value: 62, measuredAt: "2026-09-12" },
    targets: { month: 80, quarter: 88, year: 93 },
  },
  {
    id: "smm.approved_share",
    agent: "smm",
    title: "Доля материалов, вышедших с полным одобрением редактора",
    unit: "%",
    direction: "up",
    source: "отсутствие releasedWithoutApproval у выпущенных строк",
    why: "ОГРАНИЧИТЕЛЬ к заполнению слотов: слот можно закрыть материалом, "
      + "который редактор так и не одобрил, и такой выпуск не должен считаться "
      + "успехом наравне с одобренным.",
    baseline: { value: 71, measuredAt: "2026-09-12" },
    targets: { month: 80, quarter: 85, year: 90 },
  },
  {
    id: "smm.sameness_rate",
    agent: "smm",
    title: "Доля материалов с замечанием об однотипности",
    unit: "%",
    direction: "down",
    source: "замечания sameness-overlap и sameness-shape конвейера (B743)",
    why: "Прямой ответ на слова владельца про Дзен: «много статей "
      + "повторяющихся, одинаковых и однотипных». Пока это не считается, "
      + "«стало лучше» остаётся ощущением.",
    baseline: { value: 100, measuredAt: "2026-09-13" },
    targets: { month: 40, quarter: 20, year: 10 },
  },
  {
    id: "smm.cost_per_material",
    agent: "smm",
    title: "Расход платного маршрута на один выпущенный материал",
    unit: "центов",
    direction: "down",
    source: "суточный расход платного маршрута против числа выпущенных материалов",
    why: "ОГРАНИЧИТЕЛЬ к качеству: качество легко купить лишними кругами "
      + "редактуры, и без этой метрики рост одобрения оплачивался бы деньгами "
      + "владельца молча.",
    baseline: { value: 0, measuredAt: "2026-09-13" },
    targets: { month: 12, quarter: 10, year: 8 },
  },

  // ── Оркестратор ──────────────────────────────────────────────────────────
  {
    id: "orchestrator.fix_effectiveness",
    agent: "orchestrator",
    title: "Доля применённых правок, снявших находку",
    unit: "%",
    direction: "up",
    source: "agentDirective со статусом APPLIED против повторного появления той же находки",
    why: "Главная метрика автономии: агент, который каждые сутки предлагает "
      + "одну и ту же правку, выглядит работающим и не работает.",
    baseline: { value: 0, measuredAt: "2026-09-13" },
    targets: { month: 50, quarter: 70, year: 80 },
  },
  {
    id: "orchestrator.owner_actions_open",
    agent: "orchestrator",
    title: "Шагов владельца, висящих дольше двух недель",
    unit: "штук",
    direction: "down",
    source: "находки с ownerAction, повторяющиеся в отчётах периода",
    why: "ОГРАНИЧИТЕЛЬ к автономии: агент не должен подменять работу просьбами "
      + "к человеку. Растущий список — признак, что он перекладывает.",
    baseline: { value: 3, measuredAt: "2026-09-13" },
    targets: { month: 2, quarter: 1, year: 0 },
  },
  {
    id: "orchestrator.green_days",
    agent: "orchestrator",
    title: "Доля суток без инцидентов контура",
    unit: "%",
    direction: "up",
    source: "сутки без открытых сигналов уровня incident",
    why: "Итоговая метрика: всё остальное существует ради того, чтобы контур "
      + "работал сам и молча.",
    baseline: { value: 0, measuredAt: "2026-09-13" },
    targets: { month: 60, quarter: 75, year: 90 },
  },
];

export function kpisFor(agent: KpiAgent): readonly KpiDefinition[] {
  return AGENT_KPIS.filter((kpi) => kpi.agent === agent);
}

export interface KpiReading {
  definition: KpiDefinition;
  /** Факт за период. `null` — замера не было; это НЕ ноль. */
  actual: number | null;
  period: KpiPeriod;
}

export interface KpiVerdict extends KpiReading {
  target: number;
  /**
   * Выполнение в долях единицы, где 1 — цель достигнута.
   *
   * У метрик «вниз» считается обратное отношение: падение с 100 до 40 при цели
   * 40 — это выполнение, а не провал, и одна формула на оба направления
   * однажды показала бы рост расхода как успех.
   */
  attainment: number | null;
  onTrack: boolean;
}

export function judgeKpi(reading: KpiReading): KpiVerdict {
  const target = reading.definition.targets[reading.period];
  if (reading.actual === null) {
    return { ...reading, target, attainment: null, onTrack: false };
  }
  const attainment = reading.definition.direction === "up"
    ? (target === 0 ? 1 : reading.actual / target)
    // Цель «вниз» достигнута, когда факт не больше цели. Ноль цели значит
    // «ни одного», и тогда любой факт больше нуля — невыполнение.
    : (reading.actual === 0 ? 1 : (target === 0 ? 0 : target / reading.actual));
  return {
    ...reading,
    target,
    attainment,
    onTrack: reading.definition.direction === "up"
      ? reading.actual >= target
      : reading.actual <= target,
  };
}

/** Границы периода по московскому времени. */
export function periodBounds(period: KpiPeriod, now: Date): { start: Date; end: Date } {
  const moscow = new Date(now.getTime() + 3 * 60 * 60_000);
  const year = moscow.getUTCFullYear();
  const month = moscow.getUTCMonth();
  const startUtc = period === "month"
    ? Date.UTC(year, month, 1)
    : period === "quarter"
      ? Date.UTC(year, Math.floor(month / 3) * 3, 1)
      : Date.UTC(year, 0, 1);
  // Обратный сдвиг: московская полночь — это 21:00 предыдущих суток UTC.
  return { start: new Date(startUtc - 3 * 60 * 60_000), end: now };
}

/**
 * Разрыв, превращённый в правку.
 *
 * ⚠ ЗДЕСЬ НЕТ НИ ОДНОГО ТЕКСТА ДЛЯ МОДЕЛИ, И ЭТО СУТЬ. «Подстегнуть» промтом
 * нельзя: модель согласится и напишет то же самое. Подстёгивает только
 * изменение условий работы — нормы выпуска, темпа дописывания, потолка
 * очереди. Возвращаются именно они, числами и в границах белого списка.
 *
 * ⚠ И ОГРАНИЧИТЕЛЬ ВСЕГДА СИЛЬНЕЕ ОСНОВНОЙ МЕТРИКИ. Если проседает качество,
 * норма выпуска не поднимается, даже когда по количеству мы отстаём: иначе
 * KPI «больше страниц» выполнялся бы выпуском мусора — ровно так и набрался
 * корпус из 199 карточек с медианой 65 слов.
 */
export function kpiPressure(input: {
  verdicts: readonly KpiVerdict[];
  seoPagesPerDay: number;
}): Array<{ setting: string; value: number; because: string }> {
  const by = new Map(input.verdicts.map((verdict) => [verdict.definition.id, verdict]));
  const moves: Array<{ setting: string; value: number; because: string }> = [];

  const quality = by.get("seo.unique_share");
  const qualityHolds = !quality || quality.actual === null || quality.onTrack;

  const depth = by.get("seo.indexable_share");
  if (depth && depth.actual !== null && !depth.onTrack && qualityHolds) {
    moves.push({
      setting: "seo.pages_per_day",
      value: Math.min(input.seoPagesPerDay + 1, 8),
      because: `глубина корпуса ${depth.actual} % против цели ${depth.target} % `
        + "за период, уникальность при этом в норме",
    });
  }

  if (quality && quality.actual !== null && !quality.onTrack) {
    moves.push({
      setting: "seo.pages_per_day",
      value: Math.max(input.seoPagesPerDay - 1, 1),
      because: `уникальность ${quality.actual} % против цели ${quality.target} % — `
        + "темп снижается, пока качество не вернётся",
    });
  }

  return moves;
}
