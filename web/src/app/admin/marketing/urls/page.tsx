export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Link2, ShieldAlert, ShieldCheck, TrendingUp } from "lucide-react";
import { auth } from "@/lib/auth";
import {
  RETIRED_URLS,
  URL_STATUS_LABELS,
  marketingUrlRegistry,
  routeMapLivePaths,
  urlStatus,
} from "@/lib/marketing/url-registry";
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

  const rows: UrlRegistryTableRow[] = registry.map((entry) => {
    const status = urlStatus(entry.path, live);
    const decision = RETIRED_URLS[entry.path];
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
        Состояние считается по карте маршрутов, а не HTTP-обходом: параметризованные
        адреса библиотеки живы по префиксу. Реальные коды ответа, цепочки редиректов и
        статус индексации приедут вместе с обходом реестра (B589, фаза 3) — до этого
        экран показывает то, что знает карта, и не выдаёт догадку за проверку.
      </p>
    </main>
  );
}
