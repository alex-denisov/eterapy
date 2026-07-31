import "dotenv/config";
import { setTimeout as wait } from "timers/promises";
import {
  runMarketingAgentCycle,
  marketingAgentEnabled,
  resolveMarketingSignal,
  upsertMarketingSignal,
} from "@/lib/marketing/agent";
import { runEngagementDiscovery } from "@/lib/marketing/discovery";
import {
  auditInboundSla,
  auditUnansweredInbound,
  pollInboundSources,
  queueInboundReplies,
} from "@/lib/marketing/inbound";
import { sweepOwnPublicationComments } from "@/lib/marketing/engagement-sweep";
import { publishScheduledMarketing } from "@/lib/marketing/publish";
import { collectDuePublicationMetrics } from "@/lib/marketing/metrics";
import { runSeoAudit } from "@/lib/marketing/seo-monitor";
import { runSeoCoverageCycle } from "@/lib/marketing/seo-coverage";
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
import { log, serializeError } from "@/lib/logger";

const pollMs = Math.max(15_000, Number(process.env.MARKETING_AGENT_POLL_MS || 60_000));
let stopping = false;
let lastDiscovery = 0;
let lastSeoAudit = 0;
let lastUrlAudit = 0;
let lastMetaRefresh = 0;
let lastPlanSync = 0;
let lastProviderProbe = 0;
let lastInboundPoll = 0;
let lastInboundAudit = 0;
let lastCommentSweep = 0;
let lastRegistryRecovery = 0;
let lastSnapshotCheck = 0;

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
  log.info("marketing-worker.started", { pollMs });
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
      await guarded("agent", runMarketingAgentCycle);
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
      // Reddit и упоминания в VK webhook'ов не присылают — их надо забирать.
      if (now - lastInboundPoll >= 10 * 60_000) {
        lastInboundPoll = now;
        await guarded("inbound-poll", () => pollInboundSources({ now: new Date(now) }));
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
        }
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
