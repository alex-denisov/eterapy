import "dotenv/config";
import { setTimeout as wait } from "timers/promises";
import {
  runMarketingAgentCycle,
  marketingAgentEnabled,
  resolveMarketingSignal,
  upsertMarketingSignal,
} from "@/lib/marketing/agent";
import { bootstrapFreeTierLLMProviders } from "@/lib/ai-gateway/free-tier-bootstrap";
import { runEngagementDiscovery } from "@/lib/marketing/discovery";
import {
  auditInboundSla,
  auditUnansweredInbound,
  queueInboundReplies,
} from "@/lib/marketing/inbound";
import { sweepOwnPublicationComments } from "@/lib/marketing/engagement-sweep";
import { publishScheduledMarketing } from "@/lib/marketing/publish";
import { collectDuePublicationMetrics } from "@/lib/marketing/metrics";
import { runSeoAudit } from "@/lib/marketing/seo-monitor";
import { runSeoCoverageCycle, submitUrlsForRecrawl } from "@/lib/marketing/seo-coverage";
import { harvestSearchDemand } from "@/lib/seo/demand/harvest";
import { runSeoBackfillCycle, runSeoPageCycle, seoPageUrl } from "@/lib/seo/page-agent";
import { runOrchestratorCycle, ORCHESTRATOR_CYCLE_MS } from "@/lib/marketing/orchestrator";
import { runMarketingUrlAudit } from "@/lib/marketing/url-monitor";
import { refreshMetaMarketingTokens } from "@/lib/marketing/meta-oauth";
import { generateMarketingDrafts } from "@/lib/marketing/publication-queue";
import { probeMarketingProviders } from "@/lib/marketing/provider-health";
import { auditStalledPublications } from "@/lib/marketing/publication-queue";
import {
  reconcileMarketingSignals,
  recoverFailedPublications,
} from "@/lib/marketing/registry-recovery";
import {
  captureMarketingDailySnapshot,
  marketingSnapshotDue,
} from "@/lib/marketing/daily-snapshot";
import {
  collectConveyorShortfall,
  notifyShortfall,
} from "@/lib/marketing/shortfall-notification";
import db from "@/lib/db";
import { log, serializeError } from "@/lib/logger";

const pollMs = Math.max(15_000, Number(process.env.MARKETING_AGENT_POLL_MS || 60_000));

/**
 * B718 — ТАКТ ЛИНИИ ОТДЕЛЁН ОТ ТАКТА ВОРКЕРА.
 *
 * Требование владельца 2026-08-23 дословно: «почему прогоны моделей
 * осуществляются в среднем раз в минуту? ведь посты не пишутся раз в минуту.
 * Нужно управлять этим как конвейером».
 *
 * Что было. Шаг воркера — 60 секунд, и `runMarketingAgentCycle` вызывался
 * КАЖДЫЙ шаг. Норма часа (`conveyorTact`) ограничивает только АВТОРА; очередь
 * редактора намеренно оставлена вне нормы («материал со склада стоит один
 * вызов и сразу превращается в готовое»), и берёт она до `LOOP_LIMIT` = 3
 * материалов за проход. То есть при непустом складе линия имела право на 180
 * рецензий в час.
 *
 * Так и вышло. Замер прода 2026-08-22 по часам: в 12:00 — 192 обращения и
 * 988 596 токенов за один час, дальше сутки почти в нуле. За 48 часов
 * `marketing-worker.agent` отработал 2 660 раз и выпустил 3 материала.
 *
 * Почему это чинится ШАГОМ, а не новой нормой для редактора. Незавершённое
 * производство уже ограничено сверху (`MARKETING_MAX_AWAITING_REVIEW` = 6), а
 * окна выпуска — часы, а не минуты (`publish-windows.ts`). Значит десятиминутный
 * шаг даёт до 6 разборов склада в час при потолке склада в 6 материалов — этого
 * достаточно с запасом, и он не требует второго счётчика темпа, который
 * немедленно разошёлся бы с первым.
 *
 * ⚠ ДЕШЁВЫЕ ОПЕРАЦИИ ОСТАЮТСЯ НА МИНУТНОМ ШАГЕ. Выпуск в срок, ответы на
 * входящее и сбор метрик к моделям не ходят; замедлить их значило бы обменять
 * расход, которого у них нет, на опоздание, которое видно человеку.
 */
const agentCycleMs = Math.max(
  pollMs,
  Number(process.env.MARKETING_AGENT_CYCLE_MS || 10 * 60_000),
);
let lastAgentCycle = 0;
let stopping = false;
let lastDiscovery = 0;
let lastSeoAudit = 0;
let lastUrlAudit = 0;
let lastMetaRefresh = 0;
let lastPlanSync = 0;
let lastProviderProbe = 0;
let lastInboundAudit = 0;
let lastCommentSweep = 0;
let lastRegistryRecovery = 0;
let lastSnapshotCheck = 0;
/**
 * B740 — у SEO-агента и оркестратора СВОЙ такт, и он не шестичасовой «как у
 * всех остальных» по совпадению.
 *
 * Владелец просил «каждый день, как минимум несколько раз в день». Шесть часов
 * дают четыре захода в сутки при суточном потолке в четыре страницы: заход и
 * страница сходятся один к одному, и агенту не приходится ни копить очередь,
 * ни простаивать. Сбор спроса идёт тем же тактом, но ПЕРЕД выпуском — иначе
 * первый заход суток выбирал бы из вчерашней выдачи.
 */
let lastSeoDemand = 0;
let lastSeoPage = 0;
let lastOrchestrator = 0;
let lastSeoBackfill = 0;
const seoCycleMs = Math.max(
  60 * 60_000,
  Number(process.env.SEO_AGENT_CYCLE_MS || 6 * 60 * 60_000),
);
/** Дописывание идёт вдвое реже выпуска: два захода в сутки при потолке в две карточки. */
const seoBackfillCycleMs = Math.max(seoCycleMs, 12 * 60 * 60_000);

process.once("SIGINT", () => { stopping = true; });
process.once("SIGTERM", () => { stopping = true; });

async function guarded(name: string, run: () => Promise<unknown>) {
  try {
    const result = await run();
    await resolveMarketingSignal(`worker:${name}`).catch(() => undefined);
    log.info(`marketing-worker.${name}`, { result });
  } catch (error) {
    log.error(`marketing-worker.${name}_failed`, { error: serializeError(error) });
    await upsertMarketingSignal({
      key: `worker:${name}`,
      kind: "SERVICE",
      severity: "INCIDENT",
      title: `Сбой marketing-agent: ${name}`,
      summary: error instanceof Error ? error.message : String(error),
    }).catch(() => undefined);
  }
}

async function main() {
  log.info("marketing-worker.started", { pollMs, agentCycleMs });
  // B703 — коннекторы на бесплатных тарифах поднимаются из оверлея `.env` до
  // первого прохода агента, а не рукой в панели. Заход стоит семь upsert'ов и
  // делается ОДИН раз при старте: ключи меняются выкаткой, а выкатка
  // перезапускает воркер. Ставить это в цикл значило бы каждую минуту
  // переписывать секреты ради события, которое случается раз в месяц.
  await guarded("free-tier-llm-bootstrap", bootstrapFreeTierLLMProviders);
  while (!stopping) {
    if (await marketingAgentEnabled()) {
      const now = Date.now();
      if (now - lastPlanSync >= 6 * 60 * 60_000) {
        lastPlanSync = now;
        await guarded("plan", () => generateMarketingDrafts({ now: new Date(now) }));
        await guarded("registry-audit", () => auditStalledPublications({ now: new Date(now) }));
      }
      // B630 — обход комментариев под собственными публикациями каждые 15
      // минут. Это не дубль webhook'а, а страховка: у Meta обратный вызов не
      // подтверждается вовсе (B631), у VK он зависит от настройки в сообществе.
      // Обход не зависит ни от того, ни от другого, и держит обещание срока —
      // ответ в течение часа.
      if (now - lastCommentSweep >= 15 * 60_000) {
        lastCommentSweep = now;
        await guarded("comment-sweep", () => sweepOwnPublicationComments({ now: new Date(now) }));
        // Сразу после обхода — постановка ответов в очередь и проверка срока:
        // так найденный комментарий попадает в тот же проход writer → редактор.
        await guarded("inbound-sla", () => auditInboundSla({ now: new Date(now) }));
      }
      // B618: входящее — единственный разговорный канал после B617, и человек
      // на другой стороне ждёт ответа минутами, а не часами. Очередь ответов
      // пополняется каждый тик, до генерации: так ответ попадает в тот же
      // проход writer → редактор, а не в следующий.
      await guarded("inbound-queue", () => queueInboundReplies({ now: new Date() }));
      // B718: единственная операция цикла, которая ходит к моделям, — и
      // единственная, у которой свой шаг.
      if (now - lastAgentCycle >= agentCycleMs) {
        lastAgentCycle = now;
        await guarded("agent", runMarketingAgentCycle);
      }
      // Approved comments are dispatched independently of the owned-post
      // autopublish flag. Owned posts still obey MARKETING_AUTOPUBLISH.
      await guarded("publish", () => publishScheduledMarketing());
      await guarded("metrics", () => collectDuePublicationMetrics());
      if (now - lastMetaRefresh >= 6 * 60 * 60_000) {
        lastMetaRefresh = now;
        await guarded("meta-tokens", () => refreshMetaMarketingTokens(new Date(now)));
      }
      // The engagement plan books replies on human-paced slots a couple of
      // hours ahead, so discovery has to top the queue up several times an
      // hour — not once every four hours.
      if (now - lastDiscovery >= 35 * 60_000) {
        lastDiscovery = now;
        await guarded("discovery", () => runEngagementDiscovery({ now: new Date(now) }));
      }
      // Сторож зависших входящих: INC-094 показал, что строка без исполнителя
      // живёт вечно и молча, поэтому у очереди есть собственный контроль.
      if (now - lastInboundAudit >= 60 * 60_000) {
        lastInboundAudit = now;
        await guarded("inbound-watchdog", () => auditUnansweredInbound({ now: new Date(now) }));
      }
      // B626: восстановление реестра и гигиена сигналов. Раз в час — этого
      // достаточно, чтобы технический отказ вернулся в работу задолго до слота,
      // и мало, чтобы сама сверка стала фоновым шумом.
      if (now - lastRegistryRecovery >= 60 * 60_000) {
        lastRegistryRecovery = now;
        await guarded("registry-recovery", () => recoverFailedPublications({ now: new Date(now) }));
        await guarded("signal-reconcile", () => reconcileMarketingSignals({ now: new Date(now) }));
      }
      // B635: расписание обхода задаёт САМА проба — она выровнена по сетке
      // четверти часа (`providerProbeDue`). Воркер только заглядывает чаще,
      // чем шаг: тик раз в 15 минут поверх шага в 15 минут даёт худший случай
      // почти в полчаса и ту самую разнобойную колонку «проверено», на которую
      // указал владелец 2026-07-31.
      if (now - lastProviderProbe >= 5 * 60_000) {
        lastProviderProbe = now;
        await guarded("provider-health", () => probeMarketingProviders({ now: new Date(now) }));
      }
      if (now - lastSeoAudit >= 6 * 60 * 60_000) {
        lastSeoAudit = now;
        await guarded("seo", runSeoAudit);
        // Coverage runs on the same cadence: the recrawl quota resets daily and
        // spending it in four batches is friendlier than one burst.
        await guarded("seo-coverage", () => runSeoCoverageCycle({
          now: new Date(now),
          maxSubmissions: 40,
        }));
      }
      // B626: суточный срез поисковой аналитики. Проверка «нужен ли срез» —
      // это запрос по уникальному ключу дня, а не таймер в памяти: перезапуск
      // воркера не должен ни пропускать сутки, ни снимать срез повторно.
      if (now - lastSnapshotCheck >= 30 * 60_000) {
        lastSnapshotCheck = now;
        if (await marketingSnapshotDue(new Date(now)).catch(() => false)) {
          await guarded("daily-snapshot", () => captureMarketingDailySnapshot({ now: new Date(now) }));
          // B713 §5: на том же суточном такте владелец узнаёт, чего конвейеру
          // не хватило. Замер 17.08: 198 смертей материалов за две недели дали
          // ноль сообщений в канал, и молчащий конвейер выглядел как
          // работающий. Сводка идёт ПОСЛЕ снимка и своим `guarded`: её отказ не
          // имеет права утянуть за собой суточный срез.
          await guarded("shortfall-notice", async () => {
            await notifyShortfall(await collectConveyorShortfall(new Date(now)));
          });
        }
      }
      /**
       * B740 — SEO-АГЕНТ. Сбор спроса и выпуск страницы идут одним блоком и в
       * этом порядке: страница пишется по фразе, снятой только что, а не по
       * той, что лежала в очереди со вчера.
       *
       * ⚠ ВЫПУСК СТОИТ ПОСЛЕ СБОРА, НО НЕ ЗАВИСИТ ОТ ЕГО УСПЕХА. Оба источника
       * спроса внешние и оба умеют молчать: у Wordstat кончается квота, Google
       * Trends отвечает 429 без предупреждения. Очередь фраз переживает такое
       * молчание — ради этого она и заведена таблицей, а не переменной.
       */
      if (now - lastSeoDemand >= seoCycleMs) {
        lastSeoDemand = now;
        await guarded("seo-demand", () => harvestSearchDemand({ now: new Date(now) }));
      }
      if (now - lastSeoPage >= seoCycleMs) {
        lastSeoPage = now;
        await guarded("seo-page", async () => {
          const result = await runSeoPageCycle({ now: new Date(now) });
          // Адресная подача на переобход — сразу за выпуском. Для страницы,
          // вышедшей минуту назад, это разница между «в поиске завтра» и «в
          // поиске через неделю».
          if (result.published) {
            const submitted = await submitUrlsForRecrawl([seoPageUrl(result.published)]);
            if (submitted.length > 0) {
              await db.seoLibraryPage.update({
                where: { slug: result.published },
                data: { submittedAt: new Date(now) },
              }).catch(() => undefined);
            }
          }
          return result;
        });
      }
      /**
       * B741 — ДОПИСЫВАНИЕ ТОНКИХ КАРТОЧЕК.
       *
       * Свой такт и свой потолок: у корпуса 172 карточки по медиане в 65
       * собственных слов, и это главная причина отсутствия роста — ранжировать
       * нечего. Но оживить их пачкой нельзя: корпус, выросший за ночь, — это
       * ровно тот сигнал, за который его и сняли с индекса 2026-08-17.
       *
       * Шаг вдвое реже выпуска новых страниц: дописанная карточка меняет адрес,
       * который УЖЕ в индексе, и цена ошибки здесь выше, чем у нового адреса.
       */
      if (now - lastSeoBackfill >= seoBackfillCycleMs) {
        lastSeoBackfill = now;
        await guarded("seo-backfill", async () => {
          const result = await runSeoBackfillCycle({ now: new Date(now) });
          if (result.backfilled) {
            const submitted = await submitUrlsForRecrawl([seoPageUrl(result.backfilled)]);
            if (submitted.length > 0) {
              await db.seoLibraryPage.updateMany({
                where: { slug: result.backfilled, kind: "BACKFILL" },
                data: { submittedAt: new Date(now) },
              }).catch(() => undefined);
            }
          }
          return result;
        });
      }
      /**
       * B740 — ОРКЕСТРАТОР. Ходит последним в проходе намеренно: он судит о
       * состоянии контура, и судить он должен по тому, что этот проход уже
       * сделал, а не по тому, что было до него.
       */
      if (now - lastOrchestrator >= ORCHESTRATOR_CYCLE_MS) {
        lastOrchestrator = now;
        await guarded("orchestrator", () => runOrchestratorCycle({ now: new Date(now) }));
      }
      if (now - lastUrlAudit >= 6 * 60 * 60_000) {
        lastUrlAudit = now;
        await guarded("urls", runMarketingUrlAudit);
      }
    }
    await wait(pollMs);
  }
  log.info("marketing-worker.stopped", {});
}

main().catch((error) => {
  log.error("marketing-worker.crashed", { error: serializeError(error) });
  process.exitCode = 1;
});
