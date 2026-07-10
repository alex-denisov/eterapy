export const dynamic = "force-dynamic";

import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Check, ChevronLeft, ExternalLink, Receipt } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { mskMonthRange } from "@/lib/practitioner-ai-quota";
import { appUrl, loginUrl } from "@/lib/subdomain";

// B466 — «Чеки · Мой налог» (mockup -receipts). Чек НПД возникает по каждой
// оплаченной клиентом сессии; платформа как агент формирует его автоматически.
// Список выводится из завершённых сессий самозанятого (основание чека).

const DAY_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/Moscow",
});

const MONTH_NAME_FMT = new Intl.DateTimeFormat("ru-RU", { month: "long", timeZone: "Europe/Moscow" });

export default async function FinanceReceiptsPage() {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { id: true, taxStatus: true },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const now = new Date();
  const month = mskMonthRange(now);
  const bookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id, status: "COMPLETED" },
    orderBy: { createdAt: "desc" },
    take: 30,
    select: {
      id: true,
      priceRub: true,
      createdAt: true,
      client: { select: { name: true } },
    },
  });
  const monthRows = bookings.filter((b) => b.createdAt >= month.start && b.createdAt < month.end);
  const monthTotal = monthRows.reduce((s, b) => s + b.priceRub, 0);
  const isSelfEmployed = practitioner.taxStatus === "SELF_EMPLOYED";

  const receiptWord = monthRows.length === 1 ? "чек" : monthRows.length > 1 && monthRows.length < 5 ? "чека" : "чеков";

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 по mockup practitioner-finance-receipts */}
      <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-finance-receipts-mobile">
        <div className="pcab-topbar">
          <Link href={appUrl("/practitioner/finance?tab=reports")} className="pcab-roundbtn" aria-label="Назад">
            <ChevronLeft width={19} height={19} aria-hidden="true" />
          </Link>
          <span className="pcab-topbar-title">Чеки · Мой налог</span>
          <span className="pcab-topbar-spacer" />
        </div>

        {!isSelfEmployed ? (
          <>
            <p className="pcab-lead">
              Чеки «Мой налог» относятся к статусу самозанятого (НПД). Ваш налоговый статус другой — чеки для клиентов
              формируются по правилам вашего режима.
            </p>
            <Link
              href={appUrl("/practitioner/finance/tax-status")}
              className="pcab-chip is-active"
              style={{ marginTop: 14, display: "inline-block", width: "fit-content" }}
            >
              Налоговый статус
            </Link>
          </>
        ) : (
          <>
            <div className="pcab-summary" data-testid="receipts-summary-mobile">
              <span className="pcab-summary-ic">
                <Receipt size={20} aria-hidden="true" />
              </span>
              <span className="pcab-summary-main">
                <span className="pcab-summary-t">
                  <span style={{ textTransform: "capitalize" }}>{MONTH_NAME_FMT.format(now)}</span> · {monthRows.length}{" "}
                  {receiptWord}
                </span>
                <span className="pcab-summary-s">на {monthTotal.toLocaleString("ru")} ₽ · НПД, самозанятый</span>
              </span>
            </div>

            <section className="pcab-section">
              <div className="pcab-section-head">
                <span className="pcab-eyebrow">Последние чеки</span>
              </div>
              <div className="pcab-list">
                {bookings.length === 0 ? (
                  <div className="pcab-rc">
                    <span className="pcab-rc-s" style={{ whiteSpace: "normal" }}>
                      Чеков пока нет — первый появится после первой оплаченной сессии.
                    </span>
                  </div>
                ) : (
                  bookings.map((b) => (
                    <div key={b.id} className="pcab-rc">
                      <span className="pcab-rc-ic">
                        <Receipt size={17} aria-hidden="true" />
                      </span>
                      <span className="pcab-rc-main">
                        <span className="pcab-rc-t">{b.client.name ?? "Клиент"}</span>
                        <span className="pcab-rc-s">
                          {DAY_FMT.format(b.createdAt)} · сессия № {b.id.slice(-6).toUpperCase()}
                        </span>
                      </span>
                      <span className="pcab-rc-right">
                        <span className="pcab-rc-amt">{b.priceRub.toLocaleString("ru")} ₽</span>
                        <span className="pcab-rc-st">
                          <Check size={11} strokeWidth={3} aria-hidden="true" />
                          сформирован
                        </span>
                      </span>
                    </div>
                  ))
                )}
              </div>
            </section>

            <div className="pcab-note" style={{ marginTop: 16 }}>
              <b>Как это работает.</b> Платформа как ваш агент формирует чек в «Мой налог» автоматически при оплате
              клиентом. Отдельно ничего пробивать не нужно — налог начисляет ФНС по данным чеков.
            </div>
            <a href="https://lknpd.nalog.ru/" target="_blank" rel="noreferrer" className="pcab-openapp">
              <ExternalLink size={16} aria-hidden="true" />
              Открыть в «Мой налог»
            </a>
          </>
        )}
      </div>

      {/* ДЕСКТОП — прежний вид (ждёт новых десктоп-макетов R9-5) */}
      <div className="mx-auto hidden w-full max-w-3xl px-4 py-8 sm:px-6 md:block" style={{ paddingBottom: 80 }} data-testid="practitioner-finance-receipts">
      <Link href={appUrl("/practitioner/finance?tab=reports")} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Финансы
      </Link>
      <p className="soft-eyebrow mt-4">Финансы практика</p>
      <h1 className="soft-h1 mt-2">Чеки · Мой налог</h1>

      {!isSelfEmployed ? (
        <section className="soft-card mt-5 p-4 sm:p-5">
          <p className="text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Чеки «Мой налог» относятся к статусу самозанятого (НПД). Ваш налоговый статус другой — чеки для клиентов
            формируются по правилам вашего режима.
          </p>
          <Link href={appUrl("/practitioner/finance/tax-status")} className="soft-chip mt-3 inline-flex">
            Налоговый статус
          </Link>
        </section>
      ) : (
        <>
          {/* Month summary */}
          <section className="soft-card mt-5 p-4 sm:p-5">
            <p className="text-xs capitalize text-[var(--soft-ink-soft)]">
              {MONTH_NAME_FMT.format(now)} · {monthRows.length} {monthRows.length === 1 ? "чек" : monthRows.length < 5 && monthRows.length > 0 ? "чека" : "чеков"}
            </p>
            <p className="mt-1 font-heading text-2xl font-bold text-[var(--soft-bordeaux)]">
              на {monthTotal.toLocaleString("ru")} ₽
            </p>
            <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">НПД, самозанятый</p>
          </section>

          {/* Receipts list */}
          <section className="mt-5">
            <p className="soft-eyebrow mb-2.5">Последние чеки</p>
            <div className="divide-y divide-[var(--soft-paper-deep)] overflow-hidden rounded-[18px] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)]">
              {bookings.length === 0 ? (
                <p className="px-4 py-5 text-sm text-[var(--soft-ink-faint)]">
                  Чеков пока нет — первый появится после первой оплаченной сессии.
                </p>
              ) : (
                bookings.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-medium">{b.client.name ?? "Клиент"}</p>
                      <p className="mt-0.5 text-xs text-[var(--soft-ink-faint)]">
                        {DAY_FMT.format(b.createdAt)} · сессия № {b.id.slice(-6).toUpperCase()}
                      </p>
                    </div>
                    <span className="shrink-0 text-right">
                      <span className="block text-sm font-semibold tabular-nums">{b.priceRub.toLocaleString("ru")} ₽</span>
                      <span className="block text-[10px] text-[var(--soft-ink-faint)]">основание чека</span>
                    </span>
                  </div>
                ))
              )}
            </div>
          </section>

          <p className="mt-4 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
            <span className="font-medium text-[var(--soft-ink-soft)]">Как это работает.</span> Платформа как ваш
            агент формирует чек в «Мой налог» автоматически при оплате клиентом. Отдельно ничего пробивать не нужно —
            налог начисляет ФНС по данным чеков.
          </p>
          <a
            href="https://lknpd.nalog.ru/"
            target="_blank"
            rel="noreferrer"
            className="soft-button soft-button-ghost mt-3 inline-flex items-center gap-1.5"
          >
            Открыть «Мой налог»
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </>
      )}
      </div>
    </>
  );
}
