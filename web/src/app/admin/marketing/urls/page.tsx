export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Link2, ShieldAlert, ShieldCheck, TrendingUp } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { APP_URL } from "@/lib/env";
import {
  RETIRED_URLS,
  URL_STATUS_LABELS,
  marketingUrlRegistry,
  routeMapLivePaths,
  urlStatus,
} from "@/lib/marketing/url-registry";
import { isMarketingUrlAuditEvidence, marketingPathFromUrl } from "@/lib/marketing/url-monitor";
import { AdminHero, AnalyticsSection, MetricCard, MetricGrid, formatNumber } from "../../admin-analytics-ui";
import { UrlRegistryTable, type UrlRegistryTableRow } from "./urls-table";

const SOURCE_LABELS: Record<string, string> = {
  "seo-core": "ядро",
  "seo-route": "публичный маршрут",
  library: "библиотека",
  publication: "публикации",
  manual: "вручную",
};

export default async function MarketingUrlsPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SUPERADMIN") redirect("/admin");

  const live = routeMapLivePaths();
  const registry = marketingUrlRegistry();
  const [auditSignals, publicationDestinations, attributedDestinations] = await Promise.all([
    db.marketingAutomationSignal.findMany({
      where: { kind: "URL_AUDIT" },
      select: { evidence: true },
    }).catch(() => []),
    db.externalPublication.findMany({
      where: { destinationUrl: { not: null } },
      select: { destinationUrl: true },
    }).catch(() => []),
    db.channelAttribution.groupBy({
      by: ["firstEntryPath"],
      where: {
        OR: [
          { utmSource: { not: null } },
          { source: { not: "direct" } },
        ],
      },
      _count: { _all: true },
    }).catch(() => []),
  ]);
  const origin = new URL(APP_URL).origin;
  const dynamicPaths = [
    ...publicationDestinations.flatMap(({ destinationUrl }) => {
      const path = destinationUrl ? marketingPathFromUrl(destinationUrl, origin) : null;
      return path ? [{ path, source: "publication" as const }] : [];
    }),
    ...attributedDestinations.flatMap(({ firstEntryPath }) => {
      const path = marketingPathFromUrl(firstEntryPath, origin);
      return path ? [{ path, source: "publication" as const }] : [];
    }),
  ];
  for (const candidate of dynamicPaths) {
    const existing = registry.find((entry) => entry.path === candidate.path);
    if (existing) {
      if (!existing.sources.includes(candidate.source)) existing.sources.push(candidate.source);
    } else {
      registry.push({
        path: candidate.path,
        weight: "P2",
        sources: [candidate.source],
        corePhrases: 0,
        coreDemand: 0,
      });
    }
  }
  const audits = new Map(auditSignals.flatMap(({ evidence }) =>
    isMarketingUrlAuditEvidence(evidence) ? [[evidence.path, evidence] as const] : []
  ));

  const rows: UrlRegistryTableRow[] = registry.map((entry) => {
    const status = urlStatus(entry.path, live);
    const decision = RETIRED_URLS[entry.path];
    const audit = audits.get(entry.path);
    return {
      path: entry.path,
      weight: entry.weight,
      status,
      statusLabel: URL_STATUS_LABELS[status],
      sources: entry.sources.map((source) => SOURCE_LABELS[source] ?? source).join(" · "),
      corePhrases: entry.corePhrases,
      coreDemand: entry.coreDemand,
      decision: decision
        ? decision.kind === "redirect"
          ? `→ ${decision.target} · ${decision.decidedAt}`
          : `${decision.reason} · ${decision.decidedAt}`
        : null,
      httpStatus: audit?.status ?? null,
      finalUrl: audit?.finalUrl ?? null,
      inSitemap: audit?.inSitemap ?? null,
      trafficTouches: audit?.trafficTouches ?? 0,
      checkedAt: audit?.checkedAt ?? null,
    };
  });

  // Снятые адреса тоже строки реестра: без них экран показывал бы только то,
  // что живо, — то есть ровно не то, ради чего он существует.
  for (const [path, decision] of Object.entries(RETIRED_URLS)) {
    if (rows.some((row) => row.path === path)) continue;
    rows.push({
      path,
      weight: "P3",
      status: decision.kind === "redirect" ? "redirect" : "gone",
      statusLabel: decision.kind === "redirect" ? URL_STATUS_LABELS.redirect : URL_STATUS_LABELS.gone,
      sources: "снятый адрес",
      corePhrases: 0,
      coreDemand: 0,
      decision: decision.kind === "redirect"
        ? `→ ${decision.target} · ${decision.decidedAt}`
        : `${decision.reason} · ${decision.decidedAt}`,
      httpStatus: audits.get(path)?.status ?? null,
      finalUrl: audits.get(path)?.finalUrl ?? null,
      inSitemap: audits.get(path)?.inSitemap ?? null,
      trafficTouches: audits.get(path)?.trafficTouches ?? 0,
      checkedAt: audits.get(path)?.checkedAt ?? null,
    });
  }

  const weighted = rows.filter((row) => row.weight !== "P3");
  const missing = rows.filter((row) => row.status === "missing");
  const totalDemand = rows.reduce((sum, row) => sum + row.coreDemand, 0);

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6" data-testid="admin-marketing-urls-page">
      <AdminHero eyebrow="контроль ссылок" title="Реестр URL">
        Адреса, на которые велись публикации, реклама и SEO. Вес берётся из
        семантического ядра: чем выше замеренный спрос посадочной, тем дороже
        обходится её исчезновение. Смена или удаление адреса с весом требует
        решения — редиректа или явной записи «убрали осознанно», — и это
        проверяется прогоном тестов, а не памятью того, кто правит роут.{" "}
        <Link className="font-semibold text-blue-700 hover:underline" href="/admin/marketing">
          Вернуться к поисковой аналитике
        </Link>.
      </AdminHero>

      <MetricGrid>
        <MetricCard
          label="Адресов в реестре"
          value={formatNumber(rows.length)}
          hint={`${formatNumber(weighted.length)} с весом P1/P2`}
          icon={<Link2 className="size-4" />}
        />
        <MetricCard
          label="Спрос за адресами"
          value={formatNumber(totalDemand)}
          hint="Показов в месяц по фразам ядра"
          icon={<TrendingUp className="size-4" />}
        />
        <MetricCard
          label="Снято по решению"
          value={formatNumber(Object.keys(RETIRED_URLS).length)}
          hint="Редиректы и осознанные удаления"
          icon={<ShieldCheck className="size-4" />}
        />
        <MetricCard
          label="Пропало без решения"
          value={formatNumber(missing.length)}
          hint={missing.length > 0 ? "Требует действия" : "Чисто"}
          tone={missing.length > 0 ? "warn" : "ok"}
          icon={<ShieldAlert className="size-4" />}
        />
      </MetricGrid>

      <div className="mt-6">
        <AnalyticsSection title="Адреса, вес и судьба">
          <UrlRegistryTable rows={rows} />
        </AnalyticsSection>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Карта маршрутов защищает сборку, а production-агент раз в шесть часов
        перепроверяет фактический HTTP-код, конечный адрес и sitemap. Переходы —
        число последних касаний, зафиксированных платформой; «—» означает, что
        первый живой обход ещё не завершён.
      </p>
    </main>
  );
}
