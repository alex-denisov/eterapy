export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { Megaphone, PauseCircle, ShieldAlert } from "lucide-react";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { marketingNotificationsEnabled } from "@/lib/marketing/dispatch";
import {
  MARKETING_CATEGORY_LABELS,
  MARKETING_EVENTS,
} from "@/lib/marketing/events";
import { MARKETING_BLOCK_LABELS } from "@/lib/marketing/gates";
import {
  AdminHero,
  AnalyticsSection,
  MetricCard,
  MetricGrid,
  formatNumber,
} from "../../admin-analytics-ui";
import { DispatchJournal, type DispatchRow } from "./dispatch-journal";

/**
 * B599 · «Кому, когда, куда и что было отправлено».
 *
 * На экране две разные вещи, и их важно не перепутать:
 *   — МАТРИЦА: что платформа имеет право отправить. Приезжает выкаткой, здесь
 *     только показывается — редактирование рекламы через админку означало бы
 *     необратимую отправку без ревью.
 *   — ЖУРНАЛ: что реально произошло, включая НЕотправленное с причиной.
 *
 * Пока выключатель выключен, журнал заполняется только записями «заблокировано»
 * — и это правильное состояние приёмки: видно, кому бы ушло, до того как ушло.
 */
export default async function MarketingNotificationsPage() {
  const session = await auth();
  if (!session?.user?.id || session.user.role !== "SUPERADMIN") redirect("/admin");

  const enabled = marketingNotificationsEnabled();

  const [dispatches, sentCount, blockedCount, consented] = await Promise.all([
    db.marketingDispatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 500,
      include: { user: { select: { email: true, name: true } } },
    }),
    db.marketingDispatch.count({ where: { status: "sent" } }),
    db.marketingDispatch.count({ where: { status: "blocked" } }),
    db.user.count({ where: { marketingConsentAt: { not: null }, marketingOptOutAt: null } }),
  ]);

  const rows: DispatchRow[] = dispatches.map((dispatch) => ({
    id: dispatch.id,
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
    sentAt: dispatch.sentAt?.toISOString() ?? null,
  }));

  return (
    <div className="space-y-8">
      <AdminHero eyebrow="поиск и маркетинг" title="Маркетинговые уведомления">
        <p>
          {enabled
            ? "Рассылка ВКЛЮЧЕНА. Каждое сообщение — в журнале ниже вместе с текстом, который получил человек."
            : "Рассылка выключена. Ни одно сообщение из матрицы наружу не уходит; в журнал пишутся попытки с причиной отказа."}
        </p>
      </AdminHero>

      <MetricGrid>
        <MetricCard
          icon={enabled ? <Megaphone className="size-4" /> : <PauseCircle className="size-4" />}
          label="Состояние рассылки"
          value={enabled ? "Включена" : "Выключена"}
          hint="Переключается переменной MARKETING_NOTIFICATIONS через выкатку, а не из админки"
        />
        <MetricCard label="Отправлено" value={formatNumber(sentCount)} hint="всего за историю" />
        <MetricCard
          icon={<ShieldAlert className="size-4" />}
          label="Не отправлено"
          value={formatNumber(blockedCount)}
          hint="каждая попытка — с причиной отказа"
        />
        <MetricCard
          label="Согласились на рекламу"
          value={formatNumber(consented)}
          hint="согласие отдельное от транзакционных уведомлений"
        />
      </MetricGrid>

      <AnalyticsSection title="Матрица событий">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Что платформа имеет право отправить. Список приезжает выкаткой: рекламу
          нельзя править между делом — она уходит наружу и необратима.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-neutral-500">
                <th className="py-2 pr-4">Событие</th>
                <th className="py-2 pr-4">Категория</th>
                <th className="py-2 pr-4">Когда уходит</th>
                <th className="py-2 pr-4">Канал</th>
                <th className="py-2 pr-4">Не чаще</th>
                <th className="py-2">Текст</th>
              </tr>
            </thead>
            <tbody>
              {MARKETING_EVENTS.map((event) => (
                <tr key={event.key} className="border-t border-neutral-200 align-top dark:border-neutral-800">
                  <td className="py-3 pr-4 font-mono text-xs">{event.key}</td>
                  <td className="py-3 pr-4">{MARKETING_CATEGORY_LABELS[event.category]}</td>
                  <td className="py-3 pr-4 text-neutral-600 dark:text-neutral-400">{event.trigger}</td>
                  <td className="py-3 pr-4">{event.channels.join(" → ")}</td>
                  <td className="py-3 pr-4 whitespace-nowrap">раз в {event.minDaysBetween} дн.</td>
                  <td className="py-3">
                    <div className="font-medium">{event.subject}</div>
                    <pre className="mt-1 whitespace-pre-wrap font-sans text-xs text-neutral-600 dark:text-neutral-400">
                      {event.body}
                    </pre>
                    <p className="mt-2 text-xs italic text-neutral-500">{event.rationale}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AnalyticsSection>

      <AnalyticsSection title="Журнал отправок">
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
          Кому, когда, куда, по какому событию и что именно ушло. Тело письма —
          снимок на момент отправки, а не пересборка сегодняшним шаблоном.
        </p>
        <DispatchJournal rows={rows} />
      </AnalyticsSection>
    </div>
  );
}
