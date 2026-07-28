export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Bell, Megaphone, PauseCircle, ShieldAlert } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { marketingNotificationsRuntimeEnabled } from "@/lib/marketing/dispatch";
import {
  MARKETING_CATEGORY_LABELS,
  MARKETING_EVENTS,
  MARKETING_FIRE_LABELS,
} from "@/lib/marketing/events";
import { MARKETING_BLOCK_LABELS } from "@/lib/marketing/gates";
import {
  SYSTEM_CATEGORY_LABELS,
  systemEventPreview,
  systemEventCatalog,
} from "@/lib/notifications/system-catalog";
import {
  AdminHero,
  AnalyticsSection,
  MetricCard,
  MetricGrid,
  formatNumber,
} from "../../admin-analytics-ui";
import { DispatchJournal, type DispatchRow } from "./dispatch-journal";
import {
  MarketingMatrixTable,
  SystemCatalogTable,
  type MatrixRow,
  type SystemRow,
} from "./event-tables";
import { MarketingNotificationsToggle } from "./notifications-toggle";

/**
 * B599 · «Кому, когда, куда и что было отправлено».
 *
 * На экране три разные вещи, и их важно не перепутать:
 *   — МАРКЕТИНГОВАЯ МАТРИЦА: что платформа имеет право отправить как рекламу.
 *     Приезжает выкаткой, здесь только показывается — редактирование рекламы
 *     через админку означало бы необратимую отправку без ревью.
 *   — СЛУЖЕБНЫЙ КАТАЛОГ: что уходит ВСЕГДА, потому что сообщает человеку факт
 *     о его деньгах, доступе или встрече. Согласия не спрашивает, отпиской от
 *     рекламы не выключается.
 *   — ЖУРНАЛ: что реально произошло по обеим линиям, включая НЕотправленное с
 *     причиной.
 *
 * Журнал сводит две таблицы (`marketing_dispatches` и `notification_dispatches`)
 * в один список. Два отдельных журнала означали бы, что на вопрос «получал ли
 * этот человек от нас что-нибудь вчера» надо смотреть в два места и помнить про
 * оба.
 */
export default async function MarketingNotificationsPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SUPERADMIN") redirect("/admin");

  const enabled = await marketingNotificationsRuntimeEnabled();

  const [marketing, system, sentCount, blockedCount, consented, systemSentCount] = await Promise.all([
    db.marketingDispatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { email: true, name: true } } },
    }),
    db.notificationDispatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { email: true, name: true } } },
    }),
    db.marketingDispatch.count({ where: { status: "sent" } }),
    db.marketingDispatch.count({ where: { status: "blocked" } }),
    db.user.count({ where: { marketingConsentAt: { not: null }, marketingOptOutAt: null } }),
    db.notificationDispatch.count({ where: { status: "sent" } }),
  ]);

  const marketingRows: DispatchRow[] = marketing.map((dispatch) => ({
    id: `m-${dispatch.id}`,
    kind: "Маркетинг",
    recipient: dispatch.user?.email ?? dispatch.user?.name ?? "—",
    eventKey: dispatch.eventKey,
    category:
      MARKETING_CATEGORY_LABELS[dispatch.category as keyof typeof MARKETING_CATEGORY_LABELS] ??
      dispatch.category,
    channel: dispatch.channel,
    status: dispatch.status,
    blockedBy: dispatch.blockedBy
      ? MARKETING_BLOCK_LABELS[dispatch.blockedBy as keyof typeof MARKETING_BLOCK_LABELS] ??
        dispatch.blockedBy
      : null,
    subject: dispatch.subject,
    body: dispatch.body,
    error: dispatch.error,
    createdAt: dispatch.createdAt.toISOString(),
  }));

  const systemRows: DispatchRow[] = system.map((dispatch) => ({
    id: `s-${dispatch.id}`,
    kind: dispatch.kind === "account" ? "Аккаунт" : "Служебное",
    // Для аккаунтных писем адресат — сам email: аккаунта за ним может ещё не быть.
    recipient: dispatch.user?.email ?? dispatch.recipient,
    eventKey: dispatch.event,
    category: dispatch.kind === "account" ? "Доступ к аккаунту" : "Транзакционное",
    channel: dispatch.channel.toLowerCase(),
    status: dispatch.status,
    blockedBy: null,
    subject: dispatch.subject,
    body: dispatch.body,
    error: dispatch.error,
    createdAt: dispatch.createdAt.toISOString(),
  }));

  const journalRows = [...marketingRows, ...systemRows].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0,
  );

  const matrixRows: MatrixRow[] = MARKETING_EVENTS.map((event) => ({
    key: event.key,
    category: MARKETING_CATEGORY_LABELS[event.category],
    audience: event.audience,
    fire: MARKETING_FIRE_LABELS[event.fire],
    trigger: event.trigger,
    channels: event.channels.join(" → "),
    cooldown: `раз в ${event.minDaysBetween} дн.`,
    subject: event.subject,
    body: event.body,
    rationale: event.rationale,
  }));

  const catalog = systemEventCatalog();
  const systemCatalogRows: SystemRow[] = catalog.map((row) => {
    const preview = systemEventPreview(row);
    return {
      key: row.key,
      label: row.label,
      kind: row.kind === "account" ? "Письмо аккаунта" : "Настройки кабинета",
      category: SYSTEM_CATEGORY_LABELS[row.category] ?? row.category,
      audience: row.audience,
      trigger: row.trigger,
      channels: row.channels.join(", "),
      optional: row.optional ? "Можно отключить" : "Нельзя отключить",
      subject: preview.subject,
      body: preview.body,
    };
  });

  const marketingCategoryOptions = Object.values(MARKETING_CATEGORY_LABELS).map((label) => ({
    value: label,
    label,
  }));
  const systemCategoryOptions = Array.from(
    new Set(systemCatalogRows.map((row) => row.category)),
  ).map((label) => ({ value: label, label }));

  return (
    <main className="mx-auto w-full min-w-0 max-w-7xl space-y-8 px-4 py-8 sm:px-6">
      <AdminHero
        eyebrow="поиск и маркетинг"
        title="Уведомления: что уходит и что ушло"
        actions={<MarketingNotificationsToggle enabled={enabled} />}
      >
        <p>
          {enabled
            ? "Рекламная рассылка ВКЛЮЧЕНА. Каждое сообщение — в журнале ниже вместе с текстом, который получил человек."
            : "Рекламная рассылка выключена: ни одно сообщение из матрицы наружу не уходит, в журнал пишутся попытки с причиной отказа. Служебные уведомления от этого выключателя не зависят и уходят как обычно."}
        </p>
      </AdminHero>

      <MetricGrid>
        <MetricCard
          icon={enabled ? <Megaphone className="size-4" /> : <PauseCircle className="size-4" />}
          label="Рекламная рассылка"
          value={enabled ? "Включена" : "Выключена"}
          hint="Переключается здесь; состояние хранится в БД и применяется сразу"
        />
        <MetricCard label="Рекламных отправлено" value={formatNumber(sentCount)} hint="всего за историю" />
        <MetricCard
          icon={<ShieldAlert className="size-4" />}
          label="Реклама не отправлена"
          value={formatNumber(blockedCount)}
          hint="каждая попытка — с причиной отказа"
        />
        <MetricCard
          icon={<Bell className="size-4" />}
          label="Служебных отправлено"
          value={formatNumber(systemSentCount)}
          hint="письма, Telegram и колокольчик; согласия не требуют"
        />
        <MetricCard
          label="Согласились на рекламу"
          value={formatNumber(consented)}
          hint="согласие отдельное от транзакционных уведомлений"
        />
      </MetricGrid>

      <AnalyticsSection title={`Маркетинговая матрица — ${MARKETING_EVENTS.length} событий`}>
        <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
          Что платформа имеет право отправить как рекламу. Список приезжает
          выкаткой: рекламу нельзя править между делом — она уходит наружу и
          необратима. Каждое из этих сообщений требует согласия, подчиняется
          отписке, кризисному гейту, ночному окну и общему потолку в два касания
          на неделю.
        </p>
        <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
          В текстах ниже ссылки отписки нет — её приклеивает отправитель к
          каждому сообщению, поэтому забыть её в шаблоне невозможно. Отписка
          выполняется на <code>/unsubscribe</code> нажатием кнопки, а не
          переходом по ссылке: по ссылкам из писем ходят почтовые сканеры сами.
        </p>
        <MarketingMatrixTable rows={matrixRows} categories={marketingCategoryOptions} />
      </AnalyticsSection>

      <AnalyticsSection title={`Служебные события — ${systemCatalogRows.length}`}>
        <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
          Уходят всегда: это факты о деньгах, доступе и встречах человека.
          Согласия на рекламу не спрашивают и отпиской от рекламы не
          выключаются — иначе нажатие «отписаться» в письме об акции отключило бы
          чек об оплате и напоминание о сессии.
        </p>
        <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
          «Настройки кабинета» — события с переключателем у человека («Настройки»
          → «Уведомления»). «Письмо аккаунта» — уходит мимо переключателей:
          выключить себе письмо для сброса пароля значит потерять доступ.
        </p>
        <SystemCatalogTable rows={systemCatalogRows} categories={systemCategoryOptions} />
      </AnalyticsSection>

      <AnalyticsSection title="Журнал отправок">
        <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
          Кому, когда, куда, по какому событию и что именно ушло — реклама и
          служебные в одном списке. Тело сообщения — снимок на момент отправки, а
          не пересборка сегодняшним шаблоном.
        </p>
        <p className="mb-4 text-sm text-[var(--soft-ink-soft)]">
          У писем сброса пароля и подтверждения почты тело намеренно не
          сохраняется: в нём рабочая одноразовая ссылка, а журнал читает
          суперадмин. Тема, адресат и время сохранены — этого хватает, чтобы
          ответить на вопрос «письмо уходило?».
        </p>
        <DispatchJournal rows={journalRows} />
      </AnalyticsSection>
    </main>
  );
}
