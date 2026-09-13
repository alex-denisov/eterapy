/**
 * B740 — ОТЧЁТ ВЛАДЕЛЬЦУ. ПИШЕТСЯ ДО ТОГО, КАК ЧТО-ТО ИЗМЕНЕНО.
 *
 * Требование владельца 2026-09-12 дословно: «полная автономия, но он должен сам
 * мне писать перед тем как внедрить изменения, с комментариями о том, какие
 * проблемы нашел и как он будет их исправлять, пусть у него будет подход как у
 * эксперта, который отчитывается мне как руководителю».
 *
 * Отсюда три свойства текста, и каждое — следствие этой фразы, а не вкус:
 *
 *  1. СНАЧАЛА ПРОБЛЕМА, ПОТОМ ПРАВКА. Руководитель читает, чтобы понять
 *     состояние дел, а не чтобы утвердить список действий.
 *  2. ЧИСЛА, А НЕ ОЦЕНКИ. «Пул деградировал» — это мнение; «Gemini молчит 31 ч,
 *     последний отказ HTTP_429» — это факт, по которому можно возразить.
 *  3. ТЕКСТ СОБИРАЕТСЯ КОДОМ. Модель дописывает к нему связующий абзац, но
 *     отчёт существует и без модели: отказ пула не имеет права превратить
 *     доклад о проблемах в молчание — именно в такие минуты он и нужен.
 */

import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import { MARKETING_ORCHESTRATOR_REPORT_FEATURE } from "@/lib/marketing/model-pool";
import { describeDirective, type OrchestratorDirective } from "@/lib/marketing/orchestrator-actions";
import type { OrchestratorFinding } from "@/lib/marketing/orchestrator-diagnosis";
import type { OrchestratorState } from "@/lib/marketing/orchestrator-state";
import { humanRegistrationTargets } from "@/lib/seo/backlink-targets";
import { KPI_PERIOD_TITLES, type KpiPeriod, type KpiVerdict } from "@/lib/marketing/kpi";

const SEVERITY_MARK: Record<OrchestratorFinding["severity"], string> = {
  incident: "🔴",
  warning: "🟠",
  observation: "⚪",
};

function moscowTime(now: Date): string {
  return now.toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    dateStyle: "short",
    timeStyle: "short",
  });
}

/** Блок «как сейчас» — одни числа, без выводов. */
export function stateBlock(state: OrchestratorState): string[] {
  const lines = [
    "📊 <b>Как сейчас</b>",
    `Конвейер: спрос ${state.conveyor.demand}, готово ${state.conveyor.ready}, `
    + `у редактора ${state.conveyor.awaitingReview}/${state.conveyor.maxAwaitingReview}, `
    + `норма часа ${state.conveyor.perHour}`,
    `Пул: живых провайдеров ${state.providers.filter((p) => p.enabled && p.lastSuccessAt).length} из ${state.providers.length}`,
    `SEO: страниц за сутки ${state.seo.publishedToday}/${state.seo.dailyCap}, `
    + `за неделю ${state.seo.publishedWeek}, в очереди запросов ${state.seo.queueNew}`,
  ];
  const published = state.platforms.filter((platform) => platform.published > 0);
  if (published.length > 0) {
    lines.push(
      `Вышло за сутки: ${published.map((p) => `${p.platform} ${p.published}`).join(", ")}`,
    );
  } else {
    lines.push("Вышло за сутки: ничего");
  }
  // B741: живые источники — отдельной строкой от суточного среза. Молчащий
  // источник обязан быть виден словом «не ответил», а не отсутствием числа.
  const webmaster = state.sources.webmaster;
  lines.push(
    webmaster
      ? `Яндекс: в поиске ${webmaster.searchablePages} из ${webmaster.sitemapUrls} в карте сайта, `
        + `исключено ${webmaster.excludedPages}`
      : `Яндекс.Вебмастер: не ответил (${state.sources.webmasterError ?? "причина не названа"})`,
  );
  const gsc = state.sources.gsc;
  lines.push(
    gsc
      ? `Google за неделю: показов ${gsc.totals.impressions}, кликов ${gsc.totals.clicks}, `
        + `средняя позиция ${gsc.totals.averagePosition.toFixed(1)}, запросов ${gsc.queryCount}`
      : `Google Search Console: не ответила (${state.sources.gscError ?? "причина не названа"})`,
  );
  if (state.thinCards > 0) {
    lines.push(`Карточек без глубины: ${state.thinCards} — дописываются по расписанию`);
  }
  if (state.search.impressions !== null) {
    lines.push(
      `Поиск: показов ${state.search.impressions}, кликов ${state.search.clicks ?? 0}`
      + (state.search.averagePosition !== null
        ? `, средняя позиция ${state.search.averagePosition.toFixed(1)}`
        : ""),
    );
  }
  return lines;
}

/** Блок находок. Самое дорогое первым. */
export function findingsBlock(findings: readonly OrchestratorFinding[]): string[] {
  if (findings.length === 0) return ["✅ <b>Проблем не нашёл</b> — контур работает в своих границах."];
  const lines = ["🔍 <b>Что я нашёл</b>"];
  for (const finding of findings.slice(0, 8)) {
    lines.push(`${SEVERITY_MARK[finding.severity]} <b>${finding.title}</b>`);
    lines.push(`<i>${finding.detail}</i>`);
  }
  if (findings.length > 8) lines.push(`…и ещё находок: ${findings.length - 8}`);
  return lines;
}

/**
 * Блок правок. Каждая строка — что делаю и почему.
 *
 * ⚠ «НИЧЕГО» БОЛЬШЕ НЕ ДОПУСКАЕТСЯ КАК КОНЕЦ ОТЧЁТА. Владелец 2026-09-12:
 * «агент просто написал "что меняю — ничего", так не пойдёт». Пустой список
 * правок означает не «делать нечего», а «то, что нужно сделать, лежит вне
 * моих полномочий» — и тогда отчёт обязан назвать шаг для человека
 * (`ownerActionsBlock` ниже), а не закончиться словом «ничего».
 */
export function directivesBlock(
  directives: readonly OrchestratorDirective[],
  hasOwnerActions = false,
): string[] {
  if (directives.length === 0) {
    return [
      hasOwnerActions
        ? "🛠 <b>Что меняю сам</b>\nНичего: всё, что нужно сделать, требует вашего решения — оно ниже."
        : "🛠 <b>Что меняю сам</b>\nНичего: контур работает в своих границах, менять нечего.",
    ];
  }
  const lines = ["🛠 <b>Что меняю прямо сейчас</b>"];
  for (const directive of directives) {
    lines.push(`• <b>${describeDirective(directive)}</b>`);
    lines.push(`  ${directive.rationale}`);
  }
  lines.push("<i>Все правки обратимы: прежние значения сохранены и откатываются одной командой.</i>");
  return lines;
}

/**
 * B742 — ЧТО ДОЛЖЕН СДЕЛАТЬ ВЛАДЕЛЕЦ, С ОЖИДАЕМЫМ ЭФФЕКТОМ.
 *
 * Блок появляется только тогда, когда есть шаги: пустой заголовок «что нужно
 * от вас» читается как упрёк и на третий раз перестаёт читаться вовсе.
 *
 * У каждого шага обязательно назван эффект числом — иначе это просьба, а не
 * предложение, и владелец не может сравнить её с другими своими делами.
 */
export function ownerActionsBlock(findings: readonly OrchestratorFinding[]): string[] {
  const actions = findings
    .filter((finding) => finding.ownerAction)
    .map((finding) => ({ finding, action: finding.ownerAction! }));
  if (actions.length === 0) return [];
  const lines = ["🙋 <b>Что нужно от вас</b>"];
  for (const { finding, action } of actions) {
    lines.push(`• <b>${action.what}</b>`);
    lines.push(`  Зачем: ${finding.title}`);
    lines.push(`  Что это даст: ${action.expected}`);
  }
  return lines;
}

/**
 * B743 — ОТЧЁТ ПО KPI: ПЛАН, ФАКТ, РАЗРЫВ.
 *
 * Требование владельца 2026-09-13: агенты обязаны отчитываться по метрикам, и
 * это должно подстёгивать их работать лучше.
 *
 * ⚠ МЕТРИКА БЕЗ ЗАМЕРА НАЗЫВАЕТСЯ ТАК И ЕСТЬ. Ноль и «не измерили» — разные
 * утверждения; поставь мы ноль, отчёт показывал бы провал там, где просто нет
 * числа, и владелец пошёл бы чинить работающее. Неизмеренные перечисляются
 * отдельной строкой — это не украшение, а признание долга.
 *
 * ⚠ ПЕРИОД В ОТЧЁТЕ ОДИН — МЕСЯЦ. Квартал и год объявлены и считаются теми же
 * функциями, но каждые сутки показывать три горизонта значит не показывать ни
 * одного: на суточном шаге годовая цифра не меняется вовсе. Квартал и год
 * уходят в отчёт первого числа — там они и становятся новостью.
 */
export function kpiBlock(verdicts: readonly KpiVerdict[], period: KpiPeriod): string[] {
  if (verdicts.length === 0) return [];
  const lines = [`📊 <b>KPI за ${KPI_PERIOD_TITLES[period]}</b>`];
  for (const agent of ["seo", "smm", "orchestrator"] as const) {
    const own = verdicts.filter((verdict) => verdict.definition.agent === agent);
    if (own.length === 0) continue;
    lines.push(`<b>${AGENT_TITLES[agent]}</b>`);
    for (const verdict of own) {
      if (verdict.actual === null) continue;
      const mark = verdict.onTrack ? "🟢" : "🔴";
      lines.push(
        `${mark} ${verdict.definition.title}: <b>${verdict.actual}</b> ${verdict.definition.unit} `
        + `при цели ${verdict.target}`,
      );
    }
  }
  const blind = verdicts.filter((verdict) => verdict.actual === null);
  if (blind.length > 0) {
    lines.push(
      `<i>Без замера ${blind.length}: ${blind.map((verdict) => verdict.definition.title).join("; ")}. `
      + "В выполнение не засчитываю ни в какую сторону — ноль и «не измерили» это разное.</i>",
    );
  }
  return lines;
}

const AGENT_TITLES = {
  seo: "SEO-агент",
  smm: "SMM-агент",
  orchestrator: "Оркестратор",
} as const;

/**
 * B742 §4 — ПУЛ ПЛОЩАДОК, ГДЕ РЕГИСТРИРУЕТСЯ ТОЛЬКО ЧЕЛОВЕК.
 *
 * Владелец просил этот список прямым текстом, и он же — вторая половина
 * честного ответа про внешние ссылки: первая половина в
 * `seo/backlink-targets.ts` объясняет, почему одноразовые аккаунты ради ссылок
 * мы не заводим.
 *
 * ⚠ БЛОК ПОКАЗЫВАЕТСЯ РАЗ В НЕДЕЛЮ, А НЕ КАЖДЫЙ ПРОХОД. Список не меняется
 * сам: он про шаги, которые владелец делает один раз. Ежедневное повторение
 * превратило бы его в шум и научило бы пролистывать весь отчёт.
 */
export function backlinkPoolBlock(now: Date): string[] {
  // Понедельник по Москве — один раз в неделю, в начале рабочей недели.
  const moscow = new Date(now.getTime() + 3 * 60 * 60_000);
  if (moscow.getUTCDay() !== 1) return [];
  const targets = humanRegistrationTargets();
  if (targets.length === 0) return [];
  const lines = ["🔗 <b>Внешние ссылки: где нужна ваша регистрация</b>"];
  lines.push(
    "<i>Одноразовые аккаунты ради ссылок не завожу: это дословное определение "
    + "ссылочной схемы у обеих систем, а домен уже переживал снятие страниц с "
    + "индекса. Ниже — площадки, где ссылка законна и полезна, но регистрацию "
    + "проходит только человек.</i>",
  );
  for (const target of targets) {
    lines.push(`• <b>${target.title}</b> — ${target.url}`);
    lines.push(`  Шаг: ${target.humanStep}`);
    lines.push(`  Зачем: ${target.why}`);
  }
  return lines;
}

/**
 * B742 — ЧТО СТАЛО С ПРОШЛЫМИ ПРАВКАМИ.
 *
 * Оркестратор оценивает собственные действия, а не только контур. Владелец
 * должен видеть, работает ли то, что агент внедрял вчера, — иначе автономия
 * превращается в поток действий без обратной связи.
 */
export function selfReviewBlock(state: OrchestratorState): string[] {
  const applied = state.recentDirectives.filter((directive) => directive.status === "APPLIED");
  const failed = state.recentDirectives.filter((directive) => directive.status === "FAILED");
  if (applied.length === 0 && failed.length === 0) return [];
  const lines = ["🔁 <b>Мои прошлые правки за неделю</b>"];
  lines.push(`Применено ${applied.length}, не удалось ${failed.length}.`);
  for (const directive of applied.slice(0, 3)) {
    lines.push(`• ${directive.action} — ${directive.problem}`);
  }
  return lines;
}

/**
 * Связующий абзац от модели.
 *
 * ⚠ МОДЕЛЬ НЕ ДОБАВЛЯЕТ ФАКТОВ. Ей на вход идут уже готовые находки, и просят
 * её ровно об одном: сказать, что из этого главное и чего ждать дальше. Без
 * этого ограничения она начнёт досочинять причины — а причина, которой не было
 * в числах, читается владельцем как измеренная.
 */
/**
 * B742 — ОТВЕТ НЕ НА РУССКОМ ОТБРАСЫВАЕТСЯ, А НЕ ПОКАЗЫВАЕТСЯ ВЛАДЕЛЬЦУ.
 *
 * Владелец 2026-09-12: «первые 2 абзаца — английские и непонятно что это».
 * Промт был русским и требовал русского ответа — но промт это просьба, а не
 * гарантия: связующий абзац пишет любая живая модель пула, и часть из них на
 * русский системный текст отвечает по-английски.
 *
 * Просьбу нельзя проверить, результат — можно. Доля кириллицы в осмысленном
 * русском абзаце заведомо выше половины; ниже — это не наш текст, и он не
 * имеет права попасть в отчёт. Нарратив необязателен по построению (отчёт
 * собирается без него), поэтому цена отбрасывания равна нулю.
 */
export function looksRussian(text: string): boolean {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length < 40) return false;
  const cyrillic = letters.filter((letter) => /[\u0400-\u04FF]/.test(letter)).length;
  return cyrillic / letters.length >= 0.6;
}

export async function narrativeFor(input: {
  findings: readonly OrchestratorFinding[];
  directives: readonly OrchestratorDirective[];
}): Promise<string | null> {
  if (input.findings.length === 0) return null;
  const facts = input.findings
    .map((finding) => `- [${finding.severity}] ${finding.title}. ${finding.detail}`)
    .join("\n");
  const plan = input.directives.map((directive) => `- ${describeDirective(directive)}`).join("\n");
  try {
    const response = await aiComplete({
      /**
       * B742 — у отчёта СВОЙ ключ возможности, а не общий с радаром тем.
       *
       * Общий ключ смешивал две разные работы в одном суточном кошельке и в
       * одной строке реестра промтов: правка промта радара молча меняла бы
       * текст доклада владельцу. Разные работы — разные ключи, то же правило,
       * по которому B628 отделил ответы от публикаций.
       */
      feature: MARKETING_ORCHESTRATOR_REPORT_FEATURE,
      dataClass: "PUBLIC_MARKETING",
      maxTokens: 500,
      temperature: 0.3,
      messages: [
        {
          role: "system",
          content: [
            "Ты — руководитель отдела маркетинга платформы ETerapy. Ты докладываешь владельцу.",
            "Тебе дают готовый список находок и готовый план правок. Твоя работа — ОДИН абзац: что из этого главное, что произойдёт, если не чинить, и чего ждать после правок.",
            "Ни одного нового факта, ни одной новой цифры: всё, что ты называешь, должно быть в списке находок.",
            "Три-четыре предложения. ТОЛЬКО ПО-РУССКИ: ответ на любом другом языке будет отброшен и не дойдёт до владельца.",
            "Без восклицаний, без «мы усердно работаем», без вводных вроде «важно отметить».",
          ].join("\n"),
        },
        { role: "user", content: `НАХОДКИ:\n${facts}\n\nПЛАН:\n${plan || "правок нет"}` },
      ],
    });
    const text = response.text.trim();
    if (text.length === 0) return null;
    if (!looksRussian(text)) {
      log.warn("orchestrator.narrative_not_russian", { model: response.model, sample: text.slice(0, 60) });
      return null;
    }
    return text.slice(0, 900);
  } catch (error) {
    // Молчание модели не имеет права стать молчанием отчёта.
    log.warn("orchestrator.narrative_failed", { error: serializeError(error) });
    return null;
  }
}

/** Полный текст отчёта. Чистая функция — проверяется прогоном, а не отправкой. */
export function buildOrchestratorReport(input: {
  /** B743: факт по метрикам за период. Пусто — блока KPI в отчёте нет. */
  kpi?: { verdicts: readonly KpiVerdict[]; period: KpiPeriod };
  state: OrchestratorState;
  findings: readonly OrchestratorFinding[];
  directives: readonly OrchestratorDirective[];
  narrative: string | null;
}): string {
  const incidents = input.findings.filter((finding) => finding.severity === "incident").length;
  const header = incidents > 0
    ? `🧭 <b>Отчёт оркестратора · ${incidents} инцидент(ов)</b>`
    : "🧭 <b>Отчёт оркестратора</b>";
  const ownerActions = ownerActionsBlock(input.findings);
  const selfReview = selfReviewBlock(input.state);
  const backlinks = backlinkPoolBlock(input.state.now);
  const kpi = input.kpi ? kpiBlock(input.kpi.verdicts, input.kpi.period) : [];
  const blocks = [
    `${header}\n<i>${moscowTime(input.state.now)} МСК</i>`,
    ...(input.narrative ? [input.narrative] : []),
    stateBlock(input.state).join("\n"),
    ...(kpi.length > 0 ? [kpi.join("\n")] : []),
    findingsBlock(input.findings).join("\n"),
    directivesBlock(input.directives, ownerActions.length > 0).join("\n"),
    ...(ownerActions.length > 0 ? [ownerActions.join("\n")] : []),
    ...(selfReview.length > 0 ? [selfReview.join("\n")] : []),
    ...(backlinks.length > 0 ? [backlinks.join("\n")] : []),
  ];
  return blocks.join("\n\n");
}
