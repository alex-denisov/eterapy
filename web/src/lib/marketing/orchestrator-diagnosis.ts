/**
 * B740 — ДИАГНОЗ. ЧИСТАЯ ФУНКЦИЯ ОТ СНИМКА СОСТОЯНИЯ.
 *
 * ⚠ ПОЧЕМУ ДИАГНОЗ СТАВИТ КОД, А НЕ МОДЕЛЬ. Владелец просил эксперта, который
 * отчитывается руководителю. Эксперт отличается от болтуна тем, что его вывод
 * воспроизводим: на одних и тех же числах он скажет одно и то же и завтра, и
 * через месяц. Модель на одних и тех же числах скажет по-разному — и тогда
 * «проблема исчезла» будет неотличимо от «модель про неё не вспомнила».
 *
 * Модели остаётся то, в чём она действительно лучше кода: связать находки в
 * человеческий текст (`orchestrator-report.ts`). Решение о том, ЧТО чинить,
 * она не принимает.
 *
 * ⚠ ОДНА НАХОДКА — ОДНА ПРАВКА. Находка без предложения допустима (не всё
 * чинится настройкой), правка без находки — нет: автономия означает право
 * чинить названную проблему, а не право менять что угодно.
 */

import type { OrchestratorState } from "@/lib/marketing/orchestrator-state";
import type { OrchestratorDirective } from "@/lib/marketing/orchestrator-actions";

export type FindingSeverity = "incident" | "warning" | "observation";

export interface OrchestratorFinding {
  code: string;
  severity: FindingSeverity;
  /** Что происходит — числами, без оценок. */
  title: string;
  /** Почему это важно и чем грозит, если не чинить. */
  detail: string;
  /** Правка, которой находка лечится. Может отсутствовать. */
  directive?: OrchestratorDirective;
  /**
   * B742 — ШАГ ДЛЯ ЧЕЛОВЕКА, КОГДА КОД ЧИНИТЬ НЕ МОЖЕТ.
   *
   * Требование владельца 2026-09-12: «агент просто написал "что меняю —
   * ничего", так не пойдёт, нужно чтобы были предложены и исполнены понятные и
   * измеримые шаги».
   *
   * Он прав, и прежний отчёт был честен ровно наполовину. Находка без правки
   * действительно бывает — новый ключ провайдера, вход в Дзен, регистрация на
   * площадке агент себе не выпишет. Но «нечего менять» и «менять должен ты, и
   * вот что именно» — разные утверждения, и второе владелец обязан получать
   * словами, а не догадываться.
   *
   * `expected` обязателен: шаг без ожидаемого эффекта — это просьба, а не
   * предложение. Числа берутся из снимка состояния, а не придумываются.
   */
  ownerAction?: {
    /** Что сделать. Одно действие, глаголом. */
    what: string;
    /** Что это разблокирует, числом из снимка. */
    expected: string;
  };
}

/**
 * Стабильная часть ключа правки.
 *
 * Ключ устроен как `<сутки>:<что правим>` — суточный префикс нужен, чтобы одна
 * и та же правка не применялась дважды за сутки, но для сравнения «это та же
 * правка?» он мешает. Сравнивается то, что правится.
 */
function directiveKeySuffix(key: string): string {
  const separator = key.indexOf(":");
  return separator === -1 ? key : key.slice(separator + 1);
}

/** Сколько часов молчания провайдера считаем отказом, а не паузой. */
export const PROVIDER_SILENT_HOURS = 24;
/** Сколько суток без выпуска страницы считаем остановкой SEO-агента. */
export const SEO_STALL_HOURS = 36;
/** Доля вставших материалов, выше которой площадка считается сломанной. */
export const PLATFORM_STALL_RATIO = 0.5;
/** Сколько раз причина должна повториться за сутки, чтобы считаться системной. */
export const RECURRING_CAUSE_MIN = 3;

function hoursBetween(now: Date, past: Date | null): number | null {
  if (!past) return null;
  return (now.getTime() - past.getTime()) / 3_600_000;
}

function dayKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Разбор состояния в находки.
 *
 * Порядок — от того, что останавливает производство, к тому, что его
 * ухудшает. Владелец читает сверху вниз и должен встретить самое дорогое
 * первым.
 */
export function diagnose(state: OrchestratorState): OrchestratorFinding[] {
  const findings: OrchestratorFinding[] = [];
  const today = dayKey(state.now);

  // ── Пул моделей ───────────────────────────────────────────────────────────
  for (const provider of state.providers) {
    const silentFor = hoursBetween(state.now, provider.lastSuccessAt);
    const neverWorked = provider.lastSuccessAt === null && provider.lastErrorAt !== null;
    if (!provider.enabled) continue;
    if (neverWorked || (silentFor !== null && silentFor >= PROVIDER_SILENT_HOURS)) {
      findings.push({
        code: `pool.silent.${provider.provider}`,
        severity: "warning",
        title: neverWorked
          ? `${provider.provider}: ни одного успешного обращения, последний отказ ${provider.lastErrorCode ?? "без кода"}`
          : `${provider.provider}: молчит ${Math.round(silentFor ?? 0)} ч, последний отказ ${provider.lastErrorCode ?? "без кода"}`,
        detail:
          "Мёртвый провайдер в активном пуле стоит денег дважды: каждое обращение к нему "
          + "списывается из бюджета материала, и сам бюджет считается от размера пула. "
          + "Материал умирает от расхода, а не от качества.",
        directive: {
          key: `${today}:pool.disable.${provider.provider}`,
          target: "pool",
          action: "toggle_provider",
          payload: { provider: provider.provider, enabled: false },
          problem: `${provider.provider} не отвечает ${neverWorked ? "ни разу" : `${Math.round(silentFor ?? 0)} ч`}`,
          rationale:
            "Вывожу из активного пула. Это выключатель, а не удаление: провайдер вернётся "
            + "тем же действием, как только у него появится успешная проба — сторожевая "
            + "проба ходит к нему каждые 15 минут независимо от выключателя.",
          risk: "reversible",
        },
      });
    }
  }

  const liveProviders = state.providers.filter(
    (provider) => provider.enabled && provider.lastSuccessAt !== null,
  ).length;
  if (liveProviders <= 1) {
    findings.push({
      code: "pool.exhausted",
      severity: "incident",
      title: `Живых провайдеров в пуле: ${liveProviders}`,
      detail:
        "При одном живом провайдере редактор не получает модель, отличную от модели автора, "
        + "и линия перестаёт начинать новые материалы вовсе (`canSeparateRoles`). "
        + "Настройкой это не чинится — нужен новый ключ.",
      ownerAction: {
        what: "завести ключ ещё одного бесплатного провайдера в /admin/ai (или пополнить квоту существующего)",
        expected: `линия снова начнёт материалы: сейчас норма часа ${state.conveyor.perHour}, `
          + `в очереди спроса ${state.conveyor.demand} слотов`,
      },
    });
  }

  // ── Конвейер SMM ──────────────────────────────────────────────────────────
  if (state.conveyor.awaitingReview >= state.conveyor.maxAwaitingReview) {
    findings.push({
      code: "conveyor.drum_full",
      severity: "warning",
      title: `Очередь редактора полна: ${state.conveyor.awaitingReview} из ${state.conveyor.maxAwaitingReview}`,
      detail:
        "Написанное ждёт проверки, автор при этом не пишет. Незавершённое производство "
        + "копится там, где его дороже всего держать: за каждый такой материал уже заплачено "
        + "вызовом автора, а готовым он не стал.",
      directive: {
        key: `${today}:conveyor.widen_drum`,
        target: "conveyor",
        action: "set_setting",
        payload: {
          key: "marketing.conveyor.max_awaiting_review",
          value: Math.min(12, state.conveyor.maxAwaitingReview + 2),
        },
        problem: "очередь редактора связывает линию",
        rationale:
          "Поднимаю потолок очереди на две позиции. Это временная мера: если очередь "
          + "заполнится снова, причина не в потолке, а в том, что редактор не успевает — "
          + "и тогда чинить надо модель редактора, а не счётчик.",
        risk: "reversible",
      },
    });
  }

  if (state.conveyor.pausedUntil) {
    findings.push({
      code: "conveyor.paused",
      severity: "observation",
      title: `Линия на паузе до ${state.conveyor.pausedUntil.toISOString()}`,
      detail: state.conveyor.idleReason,
    });
  }

  // ── Площадки ──────────────────────────────────────────────────────────────
  for (const platform of state.platforms) {
    const total = platform.published + platform.stalled;
    if (total < 3) continue;
    const ratio = platform.stalled / total;
    if (ratio < PLATFORM_STALL_RATIO) continue;
    findings.push({
      code: `platform.stalling.${platform.platform}`,
      severity: platform.published === 0 ? "incident" : "warning",
      title: `${platform.platform}: вышло ${platform.published}, встало ${platform.stalled} за сутки`,
      detail: platform.topReason
        ? `Самая частая причина: ${platform.topReason}`
        : "Причина в реестре не записана — это отдельный дефект наблюдаемости.",
    });
  }

  const stalled = state.stalledIds.length;
  if (stalled >= 3) {
    findings.push({
      code: "conveyor.stalled_material",
      severity: "warning",
      title: `Материалов встало насмерть за сутки: ${stalled}`,
      detail:
        "Часть из них встала по состоянию инфраструктуры (исчерпанная квота, отказ маршрута), "
        + "а не по качеству текста. Такой материал уже оплачен и починится повторным проходом.",
      directive: {
        key: `${today}:conveyor.requeue`,
        target: "smm",
        action: "requeue_publications",
        // Возвращаем не всё: пачка в двадцать материалов, поданная разом, снова
        // выжжет квоту пула за один час и встанет ровно так же.
        payload: { ids: state.stalledIds.slice(0, 5) },
        problem: `${stalled} материалов не дошли до выпуска за сутки`,
        rationale:
          "Возвращаю в работу пять самых свежих. Ограничение на пять намеренное: вернуть все "
          + "значит повторить тот же залп, который их и положил.",
        risk: "reversible",
      },
    });
  }

  /**
   * ⚠ ПОВТОРЯЮЩАЯСЯ ПРИЧИНА — ЭТО ДЕФЕКТ ПРОМТА, А НЕ НЕВЕЗЕНИЕ.
   *
   * Один материал, не прошедший редактора, — это качество текста. Три и больше
   * с ОДНОЙ И ТОЙ ЖЕ причиной за сутки — это правило, которого в промте роли
   * нет. Перезапускать такие материалы бессмысленно: следующий круг упрётся в
   * то же самое и потратит вдвое больше обращений.
   *
   * Находка идёт БЕЗ правки. Правку здесь построить нельзя: она требует
   * обращения к модели за формулировкой правила, а диагноз обязан оставаться
   * чистой функцией — иначе он перестанет быть воспроизводимым. Директиву
   * строит проход оркестратора, увидев этот код.
   */
  const topCause = state.causes[0];
  if (topCause && topCause.count >= RECURRING_CAUSE_MIN) {
    findings.push({
      code: "smm.recurring_cause",
      severity: "warning",
      title: `Одна причина остановила ${topCause.count} материалов за сутки: ${topCause.reason}`,
      detail:
        "Повтор одной причины — это отсутствующее правило в промте роли, а не качество "
        + "отдельного текста. Перезапуск таких материалов упрётся в то же самое и потратит "
        + "вдвое больше обращений к моделям.",
    });
  }

  /**
   * ⚠ ДЗЕН МОЛЧИТ ГРОМКО, А НЕ ТИХО.
   *
   * У площадки нет API: выпуск идёт живой браузерной сессией, и вход владельца
   * стареет. Пока сессия мертва, материалы копятся в SCHEDULED и слот не жгут —
   * то есть снаружи это неотличимо от «нечего выпускать». Отдельная находка
   * делает разницу видимой.
   */
  if (state.dzen && !state.dzen.authorized) {
    const dzenPlanned = state.platforms.find((platform) => platform.platform === "dzen");
    findings.push({
      code: "platform.dzen_session",
      severity: "warning",
      title: state.dzen.reachable
        ? `Дзен: сессия не авторизована — ${state.dzen.reason ?? "причина не названа"}`
        : `Дзен: браузерный сервис недоступен — ${state.dzen.reason ?? "причина не названа"}`,
      detail:
        "У Дзена нет API, выпуск идёт браузерной сессией, и её вход стареет. Пока сессия "
        + "мертва, материалы площадки копятся в расписании и не жгут слот — то есть тишина "
        + "здесь означает не «нечего выпускать», а «некому выпустить».",
      ownerAction: state.dzen.reachable
        ? {
          what: "войти в Дзен через кнопку подключения в «Площадки и возможности» (сессия открывается по VNC)",
          expected: dzenPlanned && dzenPlanned.stalled > 0
            ? `разблокирует ${dzenPlanned.stalled} материалов, ждущих выпуска`
            : "вернёт площадке автоматический выпуск — вход нужен раз в несколько недель",
        }
        : {
          what: "проверить браузерный сервис на ноде eterapy-1 (порт 7801 по WireGuard)",
          expected: "без него у Дзена нет ни одного пути наружу",
        },
    });
  }

  /**
   * ⚠ БОНУС, КОТОРЫЙ НЕ ТРАТИТСЯ, — ЭТО РАСХОД, А НЕ ЭКОНОМИЯ.
   *
   * Владелец 2026-09-12: «Я точно не хочу ничего добавлять из своего кошелька,
   * но хочу использовать бонусы, хоть какие-то». У Google эти деньги лежат в
   * двух разных местах, и $300 пробного периода на Gemini API в AI Studio НЕ
   * распространяются — они покрывают Vertex AI, где живут те же модели.
   *
   * Пока сервисный аккаунт не заведён, голова пула ходит через AI Studio и
   * платит картой владельца там, где могла бы тратить бонус. Снаружи это
   * выглядит нормально: материалы выходят, ошибок нет. Именно поэтому находка
   * нужна — иначе про неё никто не вспомнит, а срок у пробного периода
   * девяносто суток.
   */
  if (!state.vertexConfigured) {
    findings.push({
      code: "billing.vertex_unused",
      severity: "observation",
      title: "Бонусные кредиты Google Cloud не тратятся: маршрут Vertex не поднят",
      detail:
        "Голова пула ходит через Gemini API в AI Studio — маршрут, на который бонусные $300 "
        + "пробного периода Google Cloud не распространяются. Те же модели доступны через "
        + "Vertex AI, и там эти деньги тратятся. Код маршрута готов; не хватает одного — "
        + "сервисного аккаунта, который может выпустить только владелец проекта.",
      ownerAction: {
        what: "создать сервисный аккаунт в проекте Google Cloud (роль Vertex AI User) и положить "
          + "`base64 -w0` его JSON в секрет репозитория GEMINI_VERTEX_SERVICE_ACCOUNT",
        expected: "расход головы пула переедет на бонусный баланс: при нынешнем потолке $1 в сутки "
          + "кредита хватит на 300 суток работы, и своих денег не понадобится вовсе",
      },
    });
  }

  /**
   * ⚠ ОРКЕСТРАТОР ОЦЕНИВАЕТ СОБСТВЕННЫЕ ПРАВКИ, А НЕ ТОЛЬКО КОНТУР.
   *
   * Требование владельца 2026-09-12: «агент должен самостоятельно улучшаться в
   * процессе работы, перечитывая в том числе историю своих отчётов… и
   * производить дополнительную оценку своим действиям».
   *
   * Самый дешёвый и самый полезный вид такой оценки — заметить правку, которая
   * применилась, но проблему не сняла: та же находка приходит снова. Без этого
   * оркестратор предлагал бы одно и то же каждые сутки и выглядел бы
   * работающим.
   *
   * ⚠ СРАВНИВАЮТСЯ КЛЮЧИ ПРАВОК, А НЕ ТЕКСТЫ. Первая редакция искала название
   * находки внутри `problem` применённой правки — и не находила НИКОГДА: у
   * находки заголовок с числами («Очередь редактора полна: 9 из 6»), а у
   * правки своя короткая формулировка повода. Прогон это и вскрыл. Ключ
   * правки устроен как `<сутки>:<что правим>`, суффикс стабилен между
   * заходами, и совпадение суффиксов — точный ответ на вопрос «я это уже
   * правил, и оно вернулось».
   */
  for (const directive of state.recentDirectives) {
    if (directive.status !== "APPLIED") continue;
    const suffix = directiveKeySuffix(directive.key);
    // Та же правка предлагается снова этим же проходом — значит не помогла.
    const proposedAgain = findings.some((finding) => finding.directive
      && directiveKeySuffix(finding.directive.key) === suffix);
    if (!proposedAgain) continue;
    findings.push({
      code: `self.ineffective.${suffix}`,
      severity: "observation",
      title: `Правка «${directive.action}» применена, но проблема осталась`,
      detail:
        `Повод был: ${directive.problem}. Та же правка напрашивается снова, значит причина `
        + "не в том, что правилось, и следующий круг той же правки будет потраченным "
        + "проходом. Разбираться нужно уровнем ниже.",
    });
  }

  // ── SEO-агент ─────────────────────────────────────────────────────────────
  const sinceLastPage = hoursBetween(state.now, state.seo.lastPublishedAt);
  if (state.seo.lastPublishedAt === null || (sinceLastPage ?? 0) >= SEO_STALL_HOURS) {
    findings.push({
      code: "seo.stalled",
      severity: "warning",
      title: state.seo.lastPublishedAt === null
        ? "SEO-агент не выпустил ещё ни одной страницы"
        : `Последняя страница Библиотеки вышла ${Math.round(sinceLastPage ?? 0)} ч назад`,
      detail: state.seo.queueNew === 0
        ? "Очередь запросов пуста: сбор спроса не приносит фраз. Причина в источниках, а не в авторе."
        : `В очереди ${state.seo.queueNew} запросов — значит останавливается не сбор, а выпуск.`,
    });
  }

  if (state.seo.queueNew === 0 && state.seo.queueRejected > 0) {
    findings.push({
      code: "seo.filter_too_strict",
      severity: "observation",
      title: `Отсев спроса снял всё: принято 0, отклонено ${state.seo.queueRejected}`,
      detail:
        "Либо источники отдают мусор, либо пороги частотности отрезают живой хвост. "
        + "Разница видна по причинам отклонения в очереди запросов.",
    });
  }

  if (state.seo.neverSubmitted >= 3) {
    findings.push({
      code: "seo.not_submitted",
      severity: "warning",
      title: `Опубликованных страниц без переобхода: ${state.seo.neverSubmitted}`,
      detail:
        "Страница, не поданная в переобход, ждёт планового обхода неделями. "
        + "Это не ошибка выпуска, но ровно здесь теряется его смысл.",
    });
  }

  if (state.seo.publishedToday === 0 && state.seo.queueNew > 20 && state.seo.dailyCap < 8) {
    findings.push({
      code: "seo.cap_below_demand",
      severity: "observation",
      title: `Очередь запросов ${state.seo.queueNew} при потолке ${state.seo.dailyCap} страниц в сутки`,
      detail:
        "Спрос накоплен быстрее, чем выпускается. Потолок можно поднять, но осторожно: "
        + "Библиотека, растущая рывком, читается поисковиком как ферма, независимо от качества текста.",
      directive: {
        key: `${today}:seo.raise_cap`,
        target: "seo",
        action: "set_setting",
        payload: { key: "seo.pages_per_day", value: Math.min(8, state.seo.dailyCap + 1) },
        problem: "очередь запросов растёт быстрее выпуска",
        rationale:
          "Поднимаю потолок ровно на одну страницу в сутки. Шаг в единицу, а не вдвое: "
          + "прирост корпуса должен быть ровным, иначе он сам становится сигналом.",
        risk: "reversible",
      },
    });
  }

  /**
   * ── Живые источники поиска ────────────────────────────────────────────────
   *
   * ⚠ МОЛЧАНИЕ ИСТОЧНИКА — ЭТО НАХОДКА, А НЕ ОТСУТСТВИЕ НАХОДОК. Пока
   * оркестратор судил только по суточному срезу, переставший сниматься срез
   * выглядел как «ничего не изменилось». Здесь это различимо: источник либо
   * ответил, либо назвал причину.
   */
  if (!state.sources.webmaster) {
    findings.push({
      code: "source.webmaster_silent",
      severity: "warning",
      title: `Яндекс.Вебмастер не ответил: ${state.sources.webmasterError ?? "причина не названа"}`,
      detail:
        "Без него неизвестно, сколько страниц в поиске и сколько исключено, а это "
        + "единственный источник, по которому видно индексацию. Переобход при этом "
        + "тоже не работает: он ходит тем же ключом.",
    });
  } else {
    const { searchablePages, excludedPages, sitemapUrls } = state.sources.webmaster;
    const coverage = sitemapUrls > 0 ? searchablePages / sitemapUrls : 0;
    if (sitemapUrls > 0 && coverage < 0.5) {
      findings.push({
        code: "search.coverage",
        severity: searchablePages === 0 ? "incident" : "warning",
        title: `В поиске Яндекса ${searchablePages} страниц из ${sitemapUrls} в карте сайта`,
        detail: excludedPages > searchablePages
          ? `Исключено ${excludedPages} — это НЕ «не дошёл обход», это отказ по качеству. `
            + "Переобход здесь не поможет: чинить надо содержание страниц."
          : `Исключено ${excludedPages}. Обход просто не дошёл — расходуем квоту переобхода `
            + "на недостающие адреса.",
      });
    }
    if (searchablePages > 0 && excludedPages > searchablePages * 2) {
      findings.push({
        code: "search.excluded",
        severity: "incident",
        title: `Исключено ${excludedPages} страниц против ${searchablePages} в поиске`,
        detail:
          "Хост профилируется как малоценный. Единственное, что это меняет, — глубина "
          + "страниц: тонкие карточки надо дописывать, а не подавать на переобход снова.",
        ownerAction: state.thinCards > 0
          ? {
            what: "подтвердить темп дописывания или поднять его настройкой seo.backfill_per_day",
            expected: `при нынешних двух карточках в сутки корпус закроется за `
              + `${Math.ceil(state.thinCards / 2)} дней; при трёх — за ${Math.ceil(state.thinCards / 3)}`,
          }
          : undefined,
      });
    }
  }

  if (!state.sources.gsc) {
    findings.push({
      code: "source.gsc_silent",
      severity: "warning",
      title: `Google Search Console не ответила: ${state.sources.gscError ?? "причина не названа"}`,
      detail:
        "Половина поискового контура наблюдается вслепую: показы, позиции и то, какими "
        + "запросами нас находят в Google, неизвестны.",
    });
  } else if (
    state.sources.gsc.totals.impressions === 0
    && (state.sources.webmaster?.searchablePages ?? 0) > 0
  ) {
    findings.push({
      code: "search.google_silent",
      severity: "warning",
      title: "Google: ноль показов за неделю при непустом индексе Яндекса",
      detail:
        "Страницы существуют и обходятся, но Google их не показывает. Это не про обход, "
        + "а про то, что по этим запросам мы не входим даже в конец выдачи.",
    });
  }

  /**
   * ⚠ ГЛАВНАЯ ПРИЧИНА ОТСУТСТВИЯ РОСТА, НАЗВАННАЯ ЧИСЛОМ.
   *
   * Замер корпуса 2026-09-12: 199 карточек, гейт глубины проходят 27, медиана
   * собственных слов — 65. То есть ранжировать нечего, и это не чинится ни
   * запросами, ни скоростью, ни разметкой.
   */
  if (state.thinCards > 0) {
    findings.push({
      code: "seo.thin_corpus",
      severity: state.thinCards > 100 ? "warning" : "observation",
      title: `Карточек без глубины: ${state.thinCards} — они не попадают в карту сайта`,
      detail:
        "Это и есть потолок роста: у страницы ниже рубежа в 450 собственных слов нет "
        + "шанса ранжироваться, сколько её ни подавай на переобход. Агент дописывает их "
        + "по расписанию; выпускать пачкой нельзя — корпус, выросший за ночь, читается "
        + "как ферма.",
    });
  }

  // ── Поисковая динамика ────────────────────────────────────────────────────
  if (
    state.search.impressions !== null
    && state.search.previousImpressions !== null
    && state.search.previousImpressions > 50
    && state.search.impressions < state.search.previousImpressions * 0.6
  ) {
    findings.push({
      code: "search.impressions_drop",
      severity: "incident",
      title: `Показы упали: ${state.search.previousImpressions} → ${state.search.impressions}`,
      detail:
        "Падение на 40 % и больше за сутки — это не колебание выдачи. "
        + "Проверять надо в этом порядке: доступность хоста, robots и canonical, "
        + "исключения в Вебмастере. Настройкой контура это не чинится.",
    });
  }

  // ── Доска сигналов ────────────────────────────────────────────────────────
  for (const signal of state.signals) {
    if (signal.severity !== "INCIDENT") continue;
    findings.push({
      code: `signal.${signal.key}`,
      severity: "incident",
      title: signal.title,
      detail: signal.summary,
    });
  }

  return findings;
}

/** Правки, которые из находок следуют. Порядок сохраняется. */
export function directivesFrom(findings: readonly OrchestratorFinding[]): OrchestratorDirective[] {
  return findings
    .map((finding) => finding.directive)
    .filter((directive): directive is OrchestratorDirective => Boolean(directive));
}
