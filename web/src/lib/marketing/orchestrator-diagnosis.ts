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
