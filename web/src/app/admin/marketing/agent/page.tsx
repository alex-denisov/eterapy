export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { Bot, Cable, MessagesSquare, Rss, SearchCheck, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { marketingAgentEnabled } from "@/lib/marketing/agent";
import {
  MARKETING_AGENT_SYSTEM_PROMPT,
  MARKETING_REVIEWER_SYSTEM_PROMPT,
} from "@/lib/marketing/agent-prompt";
import { marketingConnectorStates } from "@/lib/marketing/discovery";
import {
  DZEN_FEED_TARGET_ITEMS,
  dzenFeedReadiness,
} from "@/lib/marketing/dzen-feed";
import { INBOUND_STALE_MS } from "@/lib/marketing/inbound";
import {
  ENGAGEMENT_DAILY_MINIMUM,
  ENGAGEMENT_PLATFORMS,
  engagementDailyTarget,
  engagementSessionsFor,
  engagementSlotsFor,
  moscowDateKey,
} from "@/lib/marketing/engagement-plan";
import {
  MARKETING_ACTIVE_PROVIDERS,
  MARKETING_FREE_PROVIDERS,
  MARKETING_MODEL_RELEASE_CUTOFF,
  MARKETING_REVIEWER_MODEL_PREFERENCES,
  MARKETING_WRITER_MODEL_PREFERENCES,
  marketingModelFreshness,
} from "@/lib/marketing/model-pool";
import { auditMetaBrandAccounts } from "@/lib/marketing/meta-brand-account";
import { redditOAuthConnected } from "@/lib/marketing/reddit-oauth";
import { DEFAULT_PROVIDER_MODELS } from "@/lib/ai-gateway/provider-runtime";
import { AdminCompactDataTable, type AdminCompactColumn } from "@/components/admin/compact-client-table";
import { AdminHero, AnalyticsSection, MetricCard, MetricGrid } from "../../admin-analytics-ui";
import { MarketingAgentControls } from "./agent-controls";
import { MarketingInboundTable, type InboundTableRow } from "./inbound-table";
import { MarketingPlatformSettings } from "./platform-settings";
import { listMarketingPlatformAdminConfigs } from "@/lib/marketing/platform-settings";

const dateTime = (value: Date | null) => value
  ? value.toLocaleString("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "short", timeStyle: "short" })
  : "—";

export default async function MarketingAgentPage() {
  const session = await auth();
  if (session?.user?.role !== "SUPERADMIN") redirect("/admin");

  const [
    enabled,
    proposals,
    signals,
    recent,
    modelCredentials,
    modelConfigs,
    redditConnected,
    connectors,
    platformConfigs,
    inboundCounts,
    inboundRecent,
    dzenFeed,
    metaBrandAudit,
  ] = await Promise.all([
    marketingAgentEnabled(),
    db.externalPublication.count({ where: { status: "REVIEW" } }),
    db.marketingAutomationSignal.findMany({
      where: { status: "OPEN" },
      orderBy: [{ severity: "desc" }, { lastSeenAt: "desc" }],
      take: 100,
    }),
    db.externalPublication.findMany({
      where: { agentReviewedAt: { not: null } },
      orderBy: { agentReviewedAt: "desc" },
      take: 100,
    }),
    db.aIProviderCredential.findMany({
      where: { provider: { in: [...MARKETING_FREE_PROVIDERS] } },
      select: {
        provider: true,
        label: true,
        enabled: true,
        modelOverride: true,
        cooldownUntil: true,
        regionBlocked: true,
        lastSuccessAt: true,
        lastErrorAt: true,
        lastErrorCode: true,
        lastErrorMessage: true,
      },
      orderBy: [{ provider: "asc" }, { priority: "asc" }],
    }),
    db.aIProviderConfig.findMany({
      where: { provider: { in: [...MARKETING_FREE_PROVIDERS] } },
      select: { provider: true, defaultModel: true },
    }),
    redditOAuthConnected().catch(() => false),
    marketingConnectorStates(),
    listMarketingPlatformAdminConfigs(),
    // B618: очередь входящего. Группировка по статусу — это и есть машина
    // состояний: пустой RECEIVED при живых площадках означает «нам не пишут», а
    // не «мы не читаем».
    db.marketingInboundMessage.groupBy({
      by: ["status"],
      _count: { _all: true },
    }).catch(() => [] as Array<{ status: string; _count: { _all: number } }>),
    // B662 · владелец 2026-08-05: «эту одну запись нужно как-то пометить, что я
    // ответил уже, и убрать из списка». Раздел — очередь, а не журнал: сюда
    // попадает всё незакрытое плюс последние закрытые как хвост истории.
    // Закрытое руками уходит из очереди сразу после отметки.
    db.marketingInboundMessage.findMany({
      orderBy: { receivedAt: "desc" },
      take: 60,
      select: {
        id: true,
        platform: true,
        kind: true,
        status: true,
        authorLabel: true,
        text: true,
        permalink: true,
        harmScore: true,
        receivedAt: true,
        answeredAt: true,
        reply: { select: { id: true, status: true } },
      },
    }).catch(() => []),
    dzenFeedReadiness().catch(() => null),
    // B685: живой ответ площадки на вопрос «от чьего имени уйдёт пост».
    // Отдельно от `connectors`: там состояние считается по заполненности
    // полей, а заполнены они могут быть верно по форме и неверно по сути.
    auditMetaBrandAccounts().catch(() => []),
  ]);
  // B617: у Reddit больше нет отдельного режима комментирования, который надо
  // было доуточнять состоянием OAuth — остались только свои посты и входящее.
  const effectiveConnectors = connectors;
  // B613/B626: ссылка выдачи VK user token жила прямо в кокпите. Владелец
  // 2026-07-30: это инструкция для одного человека, а не элемент интерфейса
  // суперадминки, и кнопка всё равно не работала без client_id. Инструкция
  // переехала в B610-owner-social-accounts-setup.md; поле ввода токена
  // осталось на месте, в настройках площадки VK.

  const now = new Date();
  const dayStart = new Date(`${moscowDateKey(now)}T00:00:00.000+03:00`);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60_000);
  const moscowTime = (value: Date) => value.toLocaleTimeString("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
  });

  const engagementToday = await Promise.all(ENGAGEMENT_PLATFORMS.map(async (platform) => {
    const planned = await db.externalPublication.count({
      where: {
        platform,
        // B617: discovery планирует собственные посты по найденной теме.
        contentType: "POST",
        source: "AGENT_DISCOVERY",
        status: { notIn: ["ARCHIVED"] },
        scheduledFor: { gte: dayStart, lt: new Date(dayStart.getTime() + 30 * 60 * 60_000) },
      },
    }).catch(() => 0);
    const sessions = engagementSessionsFor(platform, now);
    return {
      platform,
      mode: "заходы в ленту" as const,
      planned,
      target: engagementDailyTarget(platform, now),
      sessions: sessions.length,
      times: engagementSlotsFor(platform, now).map(moscowTime),
    };
  }));

  /**
   * B663 · владелец 2026-08-05: «План живого присутствия не показывает telegram
   * и dzen расписание».
   *
   * И не мог: раздел строился по ENGAGEMENT_PLATFORMS — трём площадкам, где
   * агент ходит по чужой ленте. У Telegram, Дзена и Instagram присутствие
   * устроено иначе: там нет чужой ленты, зато есть свой контент-план со
   * слотами. Раздел про «что сегодня будет на площадках», поэтому в нём должны
   * быть все площадки, а не только те, где механизм совпал с названием списка.
   */
  const SCHEDULED_ONLY_PLATFORMS = ["telegram", "dzen", "instagram"] as const;
  const scheduledToday = await Promise.all(SCHEDULED_ONLY_PLATFORMS.map(async (platform) => {
    const rows = await db.externalPublication.findMany({
      where: {
        platform,
        status: { notIn: ["ARCHIVED"] },
        scheduledFor: { gte: dayStart, lt: dayEnd },
      },
      orderBy: { scheduledFor: "asc" },
      select: { scheduledFor: true, status: true },
    }).catch(() => [] as Array<{ scheduledFor: Date | null; status: string }>);
    const done = rows.filter((row) => row.status === "PUBLISHED").length;
    return {
      platform,
      mode: "выпуск по контент-плану" as const,
      planned: done,
      target: rows.length,
      sessions: rows.length,
      times: rows
        .map((row) => (row.scheduledFor ? moscowTime(row.scheduledFor) : null))
        .filter((value): value is string => Boolean(value)),
    };
  }));

  const presenceToday = [...engagementToday, ...scheduledToday];

  // B626: карточки коннекторов занимали три экрана и повторяли одни и те же
  // подписи. Та же информация в компактной таблице суперадминки читается
  // строкой и фильтруется.
  const connectorColumns: AdminCompactColumn[] = [
    { key: "platform", label: "Площадка", sortable: true, filterKind: "text" },
    { key: "state", label: "Состояние", sortable: true, filterKind: "select" },
    { key: "abilities", label: "Возможности", sortable: false, filterKind: "text" },
    { key: "missing", label: "Не заданы", sortable: false, filterKind: "text" },
    { key: "note", label: "Пояснение", filterKind: "none" },
    { key: "connect", label: "Подключение", sortable: false, filterKind: "none" },
  ];
  /**
   * B685 — адресат Meta строкой коннектора.
   *
   * Строка «готово» у Threads и Instagram означала только «поля заполнены».
   * Живая проверка 2026-08-06 показала, что заполнены они были маркерами
   * ЛИЧНОГО аккаунта владельца, и панель об этом молчала. Теперь состояние
   * строки не может быть зелёным, пока площадка не назвала брендовую страницу.
   */
  const brandAuditByPlatform = new Map(
    metaBrandAudit.map((row) => [row.platform === "threads" ? "Threads" : "Instagram", row]),
  );

  const connectorRows = effectiveConnectors.map((connector) => {
    const brand = brandAuditByPlatform.get(connector.platform);
    const abilities = [
      connector.ownedPublishing ? "свои посты" : null,
      connector.discovery ? "поиск" : null,
      connector.inboundReplies ? "ответы на входящее" : null,
    ].filter(Boolean).join(" · ") || "нет";
    // B698: у Дзена нет OAuth — «подключение» поднимает окно живого браузера,
    // в котором владелец входит под своим аккаунтом Яндекса. Кнопка та же, но
    // ведёт не на обмен токена, а на окно входа.
    const oauthHref = connector.platform === "Reddit"
      ? "/api/admin/marketing/reddit/connect"
      : connector.platform === "Threads" || connector.platform === "Instagram"
        ? `/api/admin/marketing/meta/${connector.platform.toLowerCase()}/connect`
        : connector.platform === "Dzen"
          ? "/api/admin/marketing/dzen/connect"
          : null;
    return {
      id: connector.platform,
      cells: {
        platform: connector.platform,
        state: (() => {
          if (connector.missing.length) {
            return {
              kind: "status" as const,
              label: "нужна настройка",
              tone: "warn" as const,
              filterValue: "нужна настройка",
            };
          }
          // Несовпадение адресата — это НЕ «нужна настройка»: поля заполнены,
          // публикация уйдёт не туда, и один повтор ничего не исправит.
          if (brand?.status === "mismatch") {
            return {
              kind: "status" as const,
              label: `не тот аккаунт: ${brand.actualHandle ?? "неизвестно"}`,
              tone: "danger" as const,
              filterValue: "не тот аккаунт",
            };
          }
          if (brand?.status === "unknown") {
            return {
              kind: "status" as const,
              label: "адресат не проверен",
              tone: "warn" as const,
              filterValue: "адресат не проверен",
            };
          }
          return {
            kind: "status" as const,
            label: brand?.status === "ok" ? `готово · @${brand.actualHandle}` : "готово",
            tone: "ok" as const,
            filterValue: "готово",
          };
        })(),
        abilities,
        missing: connector.missing.length ? connector.missing.join(", ") : "—",
        note: {
          kind: "details" as const,
          label: "Показать",
          title: connector.platform,
          body: brand
            ? `${connector.note}\n\nАдресат публикаций: ${
              brand.status === "not_connected"
                ? "маркер не задан — площадка не подключена."
                : brand.status === "unknown"
                  ? `проверить не удалось (${brand.error ?? "нет ответа площадки"}). Пока адресат не подтверждён, публикация будет остановлена.`
                  : `площадка отвечает «${brand.actualHandle}», публиковать разрешено только от «${brand.expectedHandle}».`
            }`
            : connector.note,
          meta: abilities,
        },
        connect: oauthHref
          ? {
            kind: "actions" as const,
            actions: [{
              label: connector.platform === "Reddit" && redditConnected
                ? "Переподключить Reddit"
                : connector.platform === "Dzen"
                  ? "Открыть окно входа в Дзен"
                  : `Подключить ${connector.platform}`,
              href: oauthHref,
              // B624: без внешней цели Next префетчит ссылку и вызывает
              // эндпоинт без нажатия (класс INC-070).
              external: true,
              icon: "open" as const,
            }],
          }
          : "—",
      },
    };
  });

  const engagementColumns: AdminCompactColumn[] = [
    { key: "platform", label: "Площадка", sortable: true, filterKind: "text" },
    { key: "mode", label: "Как присутствуем", sortable: true, filterKind: "select" },
    { key: "plan", label: "План на сегодня", sortable: true, filterKind: "none", align: "right" },
    { key: "sessions", label: "Выходов", sortable: true, filterKind: "none", align: "right" },
    { key: "times", label: "Время выхода", filterKind: "none" },
  ];
  const engagementRows = presenceToday.map((row) => ({
    id: row.platform,
    cells: {
      platform: row.platform,
      mode: row.mode,
      plan: {
        kind: "status" as const,
        label: `${row.planned}/${row.target}`,
        tone: row.target === 0
          ? ("neutral" as const)
          : row.planned >= row.target ? ("ok" as const) : ("warn" as const),
        sortValue: row.planned,
      },
      sessions: { value: row.sessions, sortValue: row.sessions },
      times: row.times.join(" · ") || "—",
    },
  }));

  const configByProvider = new Map(modelConfigs.map((row) => [row.provider, row]));
  const modelColumns: AdminCompactColumn[] = [
    { key: "provider", label: "Коннектор", sortable: true, filterKind: "text" },
    { key: "model", label: "Модель", sortable: true, filterKind: "text" },
    { key: "credentials", label: "Ключи", sortable: true, filterKind: "text" },
    { key: "status", label: "Статус", sortable: true, filterKind: "select" },
    { key: "lastSuccess", label: "Последний успех", sortable: true, filterKind: "date" },
    // B626: без времени последней пробы «нужна настройка» неотличима от
    // «проверяли утром, с тех пор молчим» — именно это и увидел владелец.
    { key: "checked", label: "Проверено", sortable: true, filterKind: "date" },
    { key: "role", label: "Балансировка", filterKind: "none" },
  ];
  const modelRows = MARKETING_FREE_PROVIDERS.map((provider) => {
    const credentials = modelCredentials.filter((row) => row.provider === provider);
    const ready = credentials.filter((row) => (
      row.enabled
      && !row.regionBlocked
      && (!row.cooldownUntil || row.cooldownUntil <= new Date())
      && (!row.lastErrorAt || Boolean(row.lastSuccessAt && row.lastSuccessAt > row.lastErrorAt))
    ));
    const lastSuccess = credentials
      .map((row) => row.lastSuccessAt)
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const writerModel = MARKETING_WRITER_MODEL_PREFERENCES[provider]
      ?? credentials.find((row) => row.enabled && row.modelOverride)?.modelOverride
      ?? configByProvider.get(provider)?.defaultModel
      ?? DEFAULT_PROVIDER_MODELS[provider];
    const reviewerModel = MARKETING_REVIEWER_MODEL_PREFERENCES[provider] ?? writerModel;
    const freshness = marketingModelFreshness(writerModel);
    const admitted = (MARKETING_ACTIVE_PROVIDERS as readonly string[]).includes(provider);
    const eligible = ready.length > 0 && admitted && freshness.eligible;
    // B626 / владелец 2026-07-30: «нужна настройка» стояло и там, где ключа нет
    // вовсе, и там, где ключ есть, но апстрим ответил отказом. Это разные
    // действия владельца, поэтому и подписи разные, а причина видна прямо в
    // строке — раньше за ней надо было идти в центр управления моделями.
    const failing = credentials.find((row) => (
      row.enabled && row.lastErrorAt && (!row.lastSuccessAt || row.lastSuccessAt <= row.lastErrorAt)
    ));
    const lastChecked = credentials
      .flatMap((row) => [row.lastSuccessAt, row.lastErrorAt])
      .filter((value): value is Date => Boolean(value))
      .sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    const statusLabel = eligible
      ? "в активном пуле"
      : ready.length > 0
        ? "только мониторинг"
        : credentials.length === 0
          ? "ключ не добавлен"
          : failing
            ? `ошибка провайдера${failing.lastErrorCode ? `: ${failing.lastErrorCode}` : ""}`
            : "нужна настройка";
    return {
      id: provider,
      cells: {
        provider,
        model: {
          value: writerModel,
          subvalue: reviewerModel !== writerModel ? `reviewer: ${reviewerModel}` : `релиз: ${freshness.releaseDate ?? "не подтверждён"}`,
          filterValue: `${writerModel} ${reviewerModel}`,
        },
        credentials: {
          value: `${ready.length}/${credentials.length} готовы`,
          subvalue: credentials.map((row) => row.label).join(", ") || "ключ не добавлен",
          filterValue: `${ready.length} ${credentials.map((row) => row.label).join(" ")}`,
        },
        status: {
          kind: "status" as const,
          label: statusLabel,
          tone: eligible ? ("ok" as const) : failing && ready.length === 0 ? ("danger" as const) : ("warn" as const),
          filterValue: statusLabel,
        },
        lastSuccess: {
          value: dateTime(lastSuccess),
          sortValue: lastSuccess?.getTime() ?? 0,
        },
        checked: {
          value: dateTime(lastChecked),
          subvalue: failing?.lastErrorMessage?.slice(0, 90) ?? undefined,
          sortValue: lastChecked?.getTime() ?? 0,
        },
        role: eligible
          ? "writer + reviewer; модели разделяются, порядок ротируется"
          : admitted
            ? freshness.reason
            : provider === "OPENAI"
              ? "не используется автоматически: у прямого API нет бесплатной квоты"
              : "не используется автоматически: нет публичной бесплатной модели после cutoff",
      },
    };
  });

  const runColumns: AdminCompactColumn[] = [
    { key: "time", label: "Время", sortable: true, filterKind: "date" },
    { key: "material", label: "Материал", sortable: true, filterKind: "text" },
    { key: "writer", label: "Автор", sortable: true, filterKind: "text" },
    { key: "reviewer", label: "Редактор", sortable: true, filterKind: "text" },
    { key: "status", label: "Результат", sortable: true, filterKind: "select" },
    { key: "review", label: "Проверка", filterKind: "none" },
  ];
  const runRows = recent.map((row) => ({
    id: row.id,
    cells: {
      time: { value: dateTime(row.agentReviewedAt), sortValue: row.agentReviewedAt?.getTime() ?? 0 },
      material: {
        value: row.title,
        subvalue: `${row.platform} · ${row.contentType}`,
        filterValue: `${row.title} ${row.platform} ${row.contentType}`,
      },
      writer: `${row.agentWriterProvider ?? "—"} / ${row.agentWriterModel ?? "—"}`,
      reviewer: `${row.agentReviewerProvider ?? "—"} / ${row.agentReviewerModel ?? "—"}`,
      status: {
        kind: "status" as const,
        label: row.status,
        tone: row.status === "FAILED" ? ("danger" as const) : row.status === "REVIEW" ? ("warn" as const) : ("ok" as const),
        filterValue: row.status,
      },
      review: {
        kind: "details" as const,
        label: "Показать",
        title: `Независимая проверка: ${row.title}`,
        body: row.agentReview ? JSON.stringify(row.agentReview, null, 2) : "Нет результата",
        meta: `${row.agentReviewerProvider ?? "—"} / ${row.agentReviewerModel ?? "—"}`,
      },
    },
  }));

  const inboundByStatus = new Map(inboundCounts.map((row) => [row.status, row._count._all]));
  const inboundWaiting = (inboundByStatus.get("RECEIVED") ?? 0) + (inboundByStatus.get("DRAFTED") ?? 0);
  const inboundStaleCutoff = new Date(now.getTime() - INBOUND_STALE_MS);
  const INBOUND_RESOLVED = ["ANSWERED", "IGNORED"];
  const inboundOpen = inboundRecent.filter((row) => !INBOUND_RESOLVED.includes(row.status));
  const inboundClosedTail = inboundRecent.filter((row) => INBOUND_RESOLVED.includes(row.status)).slice(0, 10);
  const inboundRows: InboundTableRow[] = [...inboundOpen, ...inboundClosedTail].map((row) => {
    const stale = ["RECEIVED", "DRAFTED"].includes(row.status) && row.receivedAt < inboundStaleCutoff;
    const resolved = INBOUND_RESOLVED.includes(row.status);
    return {
      id: row.id,
      time: dateTime(row.receivedAt),
      timeSort: row.receivedAt.getTime(),
      platform: row.platform,
      kind: row.kind === "COMMENT" ? "комментарий" : row.kind === "MENTION" ? "упоминание" : "сообщение",
      author: row.authorLabel ?? "—",
      statusLabel: stale ? `${row.status} · >24 ч` : row.status,
      statusTone: resolved
        ? ("ok" as const)
        : row.status === "ESCALATED" || stale
          ? ("danger" as const)
          : ("warn" as const),
      statusFilter: row.status,
      resolved,
      detailsTitle: `${row.platform} · ${row.authorLabel ?? "автор не указан"}`,
      detailsBody: [
        row.text,
        "",
        row.permalink ? `Ссылка: ${row.permalink}` : "Ссылки нет",
        `Балл риска: ${row.harmScore ?? "—"}`,
        row.reply ? `Ответ: ${row.reply.status}` : "Ответ ещё не заведён",
        row.answeredAt ? `Отвечено: ${dateTime(row.answeredAt)}` : "",
      ].filter(Boolean).join("\n"),
    };
  });

  const signalColumns: AdminCompactColumn[] = [
    { key: "time", label: "Последнее событие", sortable: true, filterKind: "date" },
    { key: "severity", label: "Уровень", sortable: true, filterKind: "select" },
    { key: "kind", label: "Источник", sortable: true, filterKind: "select" },
    { key: "title", label: "Тикет / инцидент", sortable: true, filterKind: "text" },
    { key: "details", label: "Детали", filterKind: "none" },
  ];
  const signalRows = signals.map((row) => ({
    id: row.id,
    cells: {
      time: { value: dateTime(row.lastSeenAt), sortValue: row.lastSeenAt.getTime() },
      severity: {
        kind: "status" as const,
        label: row.severity,
        tone: row.severity === "INCIDENT" ? ("danger" as const) : row.severity === "WARNING" ? ("warn" as const) : ("neutral" as const),
        filterValue: row.severity,
      },
      kind: row.kind,
      title: {
        value: row.title,
        subvalue: row.suggestedTicket ? `предлагаемый тип: ${row.suggestedTicket}` : "наблюдение",
        filterValue: `${row.title} ${row.summary}`,
      },
      details: {
        kind: "details" as const,
        label: "Показать",
        title: row.title,
        body: row.summary,
        meta: `ключ ${row.key}`,
      },
    },
  }));

  return (
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6">
      <AdminHero
        eyebrow="автономный SMM и SEO"
        title="Маркетинговый агент"
        actions={<MarketingAgentControls enabled={enabled} />}
      >
        Отдельный production-сервис создаёт и проверяет контент двумя разными
        моделями, ведёт SEO-аудит, ищет уместные обсуждения и создаёт сигналы.
        Комментарии к чужим материалам всегда ждут решения в служебном Telegram.
      </AdminHero>

      <MetricGrid>
        <MetricCard label="Сервис" value={enabled ? "работает" : "остановлен"} hint="переключатель хранится в БД" tone={enabled ? "ok" : "warn"} icon={<Bot className="size-4" />} />
        <MetricCard label="На премодерации" value={proposals.toLocaleString("ru-RU")} hint="ответов и комментариев" tone={proposals ? "warn" : "ok"} icon={<ShieldCheck className="size-4" />} />
        <MetricCard label="Входящие в работе" value={inboundWaiting.toLocaleString("ru-RU")} hint={`отвечено: ${(inboundByStatus.get("ANSWERED") ?? 0).toLocaleString("ru-RU")}, человеку: ${(inboundByStatus.get("ESCALATED") ?? 0).toLocaleString("ru-RU")}`} tone={inboundWaiting ? "warn" : "ok"} icon={<MessagesSquare className="size-4" />} />
        <MetricCard label="Открытые сигналы" value={signals.length.toLocaleString("ru-RU")} hint="SEO, адаптеры и сбои" tone={signals.length ? "warn" : "ok"} icon={<SearchCheck className="size-4" />} />
        <MetricCard label="Готовые коннекторы" value={`${effectiveConnectors.filter((row) => row.ownedPublishing || row.inboundReplies).length}/${effectiveConnectors.length}`} hint="секреты не показываются" icon={<Cable className="size-4" />} />
      </MetricGrid>

      <AnalyticsSection title="Площадки и возможности">
        <AdminCompactDataTable columns={connectorColumns} rows={connectorRows} pageSize={10} minWidth="1050px" empty="Коннекторы не объявлены" />
      </AnalyticsSection>

      <AnalyticsSection title="Входящее: комментарии, упоминания, сообщения">
        <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
          Единственный разговорный канал после B617. Комментарии к нашим
          публикациям и сообщения сообщества приходят webhook&apos;ами, Reddit и
          упоминания в VK опрашиваются. Ответ пишет тот же конвейер
          writer&nbsp;→&nbsp;независимый редактор и уходит только после
          премодерации в Telegram. Сообщение с кризисной формулировкой агент не
          отвечает вовсе — оно уходит человеку со статусом ESCALATED.
        </p>
        <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
          В таблице — незакрытая очередь и хвост из десяти последних закрытых.
          Если вы ответили человеку своими руками, отметьте это кнопкой
          «Ответил вручную»: строка уйдёт из очереди и перестанет поднимать
          сторож просроченного ответа.
        </p>
        <MarketingInboundTable rows={inboundRows} />
      </AnalyticsSection>

      {dzenFeed ? (
        <AnalyticsSection title="Дзен: выпуск браузером, лента ждёт подписчиков">
          <div className="rounded-xl border border-[var(--soft-paper-edge)] bg-white p-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            <p className="flex items-center gap-2 font-semibold text-[var(--soft-ink-strong)]">
              <Rss className="size-4" />
              {dzenFeed.publishing
                ? "Выпуск идёт ЧЕРЕЗ ленту — так включил владелец"
                : "Выпуск идёт браузерной сессией владельца, лента выключена"}
            </p>
            <p className="mt-2">
              Порог у площадки — <b>10 подписчиков канала</b>, а не материалов в
              ленте. Пока их нет, лента читателю ничего не доставляет: у
              материалов, «выпущенных» ею, публичного адреса не появилось вовсе.
              Поэтому выпуск переведён на живую сессию, а лента ждёт своего часа.
            </p>
            <p className="mt-2">
              В ленте лежит материалов: <b>{dzenFeed.items}</b> (наша планка к
              подключению — {DZEN_FEED_TARGET_ITEMS}, справочно). В работе
              (черновики, премодерация, расписание): <b>{dzenFeed.pending}</b>.
              {dzenFeed.publishing
                ? null
                : " Пока выпуск идёт браузером, лента не пополняется."}
            </p>
            <p className="mt-2 break-all font-mono text-xs">{dzenFeed.feedUrl}</p>
            <p className="mt-2 text-xs text-[var(--soft-ink-faint)]">
              Тексты в ленте написаны под формат Дзена тем же конвейером, а не
              скопированы со статьи сайта: прямой перенос площадка почти не
              показывает, а дубль вредит SEO. Когда подписчиков станет десять,
              ленту можно подключить в кабинете Дзена и включить признаком
              «Выпускать ЧЕРЕЗ ленту RSS» в настройках площадки.
            </p>
          </div>
        </AnalyticsSection>
      ) : null}

      <AnalyticsSection title="План присутствия на сегодня">
        <p className="mb-3 text-xs text-[var(--soft-ink-soft)]">
          Два разных механизма в одной таблице. Где есть чужая лента (VK, Reddit,
          Threads) — заходы несколькими сессиями в день, а не ровным
          расписанием; минимум по решению владельца — {ENGAGEMENT_DAILY_MINIMUM}{" "}
          материалов в сутки на площадку, каждый уходит на премодерацию в
          Telegram. Где чужой ленты нет (Telegram, Дзен, Instagram) —
          собственный выпуск по слотам контент-плана; «план на сегодня»
          показывает, сколько из запланированных на сутки слотов уже вышло.
        </p>
        <AdminCompactDataTable columns={engagementColumns} rows={engagementRows} pageSize={10} minWidth="960px" empty="Площадки присутствия не объявлены" />
      </AnalyticsSection>

      <AnalyticsSection title="Настройки площадок">
        <p className="mb-3 text-xs text-[var(--soft-ink-soft)]">
          Изменения применяются сразу после сохранения; выкатка не нужна. Секреты
          шифруются тем же production-ключом, что и LLM-ключи, и никогда не
          возвращаются в браузер. Пошаговая инструкция по каждой площадке —
          вне кокпита, в{" "}
          <code>docs/v5-release/tasks/tickets/B610-owner-social-accounts-setup.md</code>.
        </p>
        <MarketingPlatformSettings configs={platformConfigs} />
      </AnalyticsSection>

      <AnalyticsSection title="Последние циклы writer → reviewer">
        <p className="mb-3 text-sm text-[var(--soft-ink-soft)]">
          Провайдеры, модели, токены и полные AI-взаимодействия доступны в{" "}
          <Link className="font-semibold text-blue-700 hover:underline" href="/admin/ops/ai">
            центре управления моделями
          </Link>.
        </p>
        <AdminCompactDataTable columns={runColumns} rows={runRows} pageSize={25} minWidth="1250px" empty="Агент ещё не обрабатывал материалы" />
      </AnalyticsSection>

      <AnalyticsSection title="Бесплатный пул зарубежных моделей">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-3xl text-sm text-[var(--soft-ink-soft)]">
            Агент распределяет материалы между доступными бесплатными квотами.
            Writer и reviewer всегда получают разные модели; cutoff релиза —
            {` ${MARKETING_MODEL_RELEASE_CUTOFF}`}. Данные клиентов и практиков
            ETerapy в этот контур не передаются.
          </p>
          <Link className="soft-admin-action" href="/admin/ops/ai">
            Модели, ключи и промпты
          </Link>
        </div>
        <AdminCompactDataTable columns={modelColumns} rows={modelRows} pageSize={10} minWidth="1050px" empty="Пул моделей не настроен" />
      </AnalyticsSection>

      <AnalyticsSection title="Автоматические тикеты и инциденты">
        <AdminCompactDataTable columns={signalColumns} rows={signalRows} pageSize={25} minWidth="1050px" empty="Открытых сигналов нет" />
      </AnalyticsSection>

      <AnalyticsSection title="Инструкция агента">
        <p className="mb-3 text-sm text-[var(--soft-ink-soft)]">
          Базовая инструкция версионируется вместе с кодом. Runtime-overrides для
          writer и reviewer управляются в центре AI.
        </p>
        <details className="rounded-xl border border-[var(--soft-paper-edge)] bg-white p-4">
          <summary className="cursor-pointer font-semibold text-[var(--soft-ink-strong)]">Системный промпт writer</summary>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--soft-ink-soft)]">{MARKETING_AGENT_SYSTEM_PROMPT}</pre>
        </details>
        <details className="mt-3 rounded-xl border border-[var(--soft-paper-edge)] bg-white p-4">
          <summary className="cursor-pointer font-semibold text-[var(--soft-ink-strong)]">Системный промпт reviewer</summary>
          <pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed text-[var(--soft-ink-soft)]">{MARKETING_REVIEWER_SYSTEM_PROMPT}</pre>
        </details>
      </AnalyticsSection>
    </main>
  );
}
