import Link from "next/link";
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Clock,
  FileText,
  Lock,
  MessageSquare,
  MoreHorizontal,
  Send,
  Target,
} from "lucide-react";
import db from "@/lib/db";
import { canJoinBooking } from "@/lib/booking-actions";
import { parseCarePlanGoals } from "@/lib/care-plan";
import { formatMskDayMonth, formatMskTime } from "@/lib/msk-time";
import { appUrl } from "@/lib/subdomain";
import { analysisState, type CardBooking } from "./card-types";
import { CardMobilePlan } from "./card-mobile-plan";
import { CardMobileMessages } from "./card-mobile-messages";

// B466 R9-4 P2 — мобильная карточка клиента 1-в-1 по mockups
// practitioner-client-overview/-sessions/-plan/-messages.html: topbar
// (назад · «Карточка клиента» · ещё) → герой клиента → quick actions →
// сегмент-табы → тело вкладки. Серверные данные (bookings) приходят из
// page.tsx; лёгкие выборки табов (план/сообщения) — внутри тел, как и в
// десктопных компонентах.

export type CardTabKey = "overview" | "sessions" | "plan" | "messages";

const TAB_ITEMS: Array<{ key: CardTabKey; label: string }> = [
  { key: "overview", label: "Обзор" },
  { key: "sessions", label: "Сессии" },
  { key: "plan", label: "План" },
  { key: "messages", label: "Сообщения" },
];

/* «4 июл» / «6 мая» — короткая дата строк прошедших сессий (макет). */
const SHORT_DAY_FMT = new Intl.DateTimeFormat("ru-RU", {
  day: "numeric",
  month: "short",
  timeZone: "Europe/Moscow",
});
function shortDay(date: Date): string {
  return SHORT_DAY_FMT.format(date).replace(/\.$/, "").replace(/\.\s/, " ");
}

function ordinalLabel(n: number): string {
  return `${n}-я`;
}

export function PractitionerClientCardMobile({
  practitionerId,
  clientId,
  clientLabel,
  initials,
  sinceLabel,
  completedCount,
  isNew,
  bookings,
  tab,
}: {
  practitionerId: string;
  clientId: string;
  clientLabel: string;
  initials: string;
  sinceLabel: string;
  completedCount: number;
  isNew: boolean;
  bookings: CardBooking[];
  tab: CardTabKey;
}) {
  const proposeHref = appUrl(`/practitioner/calendar/propose?client=${clientId}`);
  const messagesHref = appUrl(`/practitioner/clients/${clientId}?tab=messages`);
  const sessionsWord =
    completedCount === 1 ? "сессия" : completedCount < 5 && completedCount > 0 ? "сессии" : "сессий";

  return (
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-client-card-mobile">
      {/* topbar */}
      <div className="pcab-topbar">
        <Link href={appUrl("/practitioner/clients")} className="pcab-roundbtn" aria-label="Назад">
          <ChevronLeft width={19} height={19} aria-hidden="true" />
        </Link>
        <span className="pcab-topbar-title">Карточка клиента</span>
        <details className="pcab-more">
          <summary className="pcab-roundbtn" aria-label="Ещё">
            <MoreHorizontal width={18} height={18} aria-hidden="true" />
          </summary>
          <div className="pcab-more-menu">
            <Link href={proposeHref}>
              <CalendarPlus width={15} height={15} aria-hidden="true" />
              Записать на сессию
            </Link>
            <Link href={messagesHref}>
              <MessageSquare width={15} height={15} aria-hidden="true" />
              Отправить сообщение
            </Link>
          </div>
        </details>
      </div>

      {/* client hero */}
      <div className="pcab-client">
        <div className="pcab-client-av" aria-hidden="true">{initials}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="pcab-client-name">{clientLabel}</div>
          <div className="pcab-client-meta">
            клиент с {sinceLabel} · {completedCount} {sessionsWord}
          </div>
          <div className="pcab-client-tags">
            <span className="pcab-ctag">Индивидуальная сессия</span>
            {completedCount >= 3 && <span className="pcab-ctag">постоянный клиент</span>}
            {isNew && <span className="pcab-ctag">новый</span>}
          </div>
        </div>
      </div>

      {/* quick actions: на вкладке «Сообщения» — только «Записать» (макет) */}
      <div className="pcab-qa">
        <Link href={proposeHref} className="pcab-btn pcab-btn-primary" data-testid="client-card-propose-mobile">
          <CalendarPlus width={15} height={15} aria-hidden="true" />
          {tab === "messages" ? "Записать на сессию" : "Записать"}
        </Link>
        {tab !== "messages" && (
          <Link href={messagesHref} className="pcab-btn pcab-btn-ghost" style={{ flex: 1 }}>
            <MessageSquare width={15} height={15} aria-hidden="true" />
            Сообщение
          </Link>
        )}
      </div>

      {/* segmented tabs */}
      <nav className="pcab-seg" data-testid="client-card-tabs-mobile">
        {TAB_ITEMS.map((t) => (
          <Link
            key={t.key}
            href={appUrl(`/practitioner/clients/${clientId}?tab=${t.key}`)}
            className={`pcab-seg-item${tab === t.key ? " is-active" : ""}`}
            aria-current={tab === t.key ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab === "overview" && (
        <CardMobileOverview
          practitionerId={practitionerId}
          clientId={clientId}
          bookings={bookings}
          completedCount={completedCount}
        />
      )}
      {tab === "sessions" && <CardMobileSessions bookings={bookings} />}
      {tab === "plan" && (
        <CardMobilePlan practitionerId={practitionerId} clientId={clientId} completedCount={completedCount} />
      )}
      {tab === "messages" && (
        <CardMobileMessages practitionerId={practitionerId} clientId={clientId} clientLabel={clientLabel} />
      )}
    </div>
  );
}

/* ── Обзор (mockup -client-overview): запрос+темы → статус → внимание ── */
async function CardMobileOverview({
  practitionerId,
  clientId,
  bookings,
  completedCount,
}: {
  practitionerId: string;
  clientId: string;
  bookings: CardBooking[];
  completedCount: number;
}) {
  const now = new Date();
  const [plan, lastMessage] = await Promise.all([
    db.clientCarePlan.findUnique({
      where: { practitionerId_clientId: { practitionerId, clientId } },
      select: { goals: true, aiSuggestion: true },
    }),
    db.practitionerClientMessage.findFirst({
      where: { practitionerId, clientId },
      orderBy: { sentAt: "desc" },
      select: { sentAt: true, readAt: true },
    }),
  ]);

  const lastContext = [...bookings].reverse().find((b) => b.meetingContext)?.meetingContext ?? null;
  const upcoming = bookings
    .filter((b) => ["CONFIRMED", "IN_PROGRESS"].includes(b.status) && b.slot && b.slot.endAt >= now)
    .sort((a, b) => a.slot!.startAt.getTime() - b.slot!.startAt.getTime())[0];
  const analyzed = bookings.filter((b) => analysisState(b) !== null);
  const lastAnalyzed = analyzed[analyzed.length - 1];
  const lastAnalyzedState = lastAnalyzed ? analysisState(lastAnalyzed) : null;
  const goals = parseCarePlanGoals(plan?.goals);

  const statusRows: Array<{
    key: string;
    href: string;
    icon: React.ReactNode;
    title: string;
    subtitle: string;
  }> = [
    {
      key: "next",
      href: upcoming
        ? appUrl(`/practitioner/calendar/booking/${upcoming.id}`)
        : appUrl(`/practitioner/calendar/propose?client=${clientId}`),
      icon: <CalendarPlus width={16} height={16} strokeWidth={1.8} aria-hidden="true" />,
      title: "Следующая сессия",
      subtitle: upcoming?.slot
        ? `${formatMskDayMonth(upcoming.slot.startAt)}, ${formatMskTime(upcoming.slot.startAt)} · ${ordinalLabel(completedCount + 1)}`
        : "не запланирована — предложите время",
    },
    {
      key: "analysis",
      href: lastAnalyzed
        ? appUrl(`/practitioner/sessions/${lastAnalyzed.id}`)
        : appUrl(`/practitioner/clients/${clientId}?tab=sessions`),
      icon: <FileText width={16} height={16} strokeWidth={1.8} aria-hidden="true" />,
      title: "Последний разбор",
      subtitle: lastAnalyzed?.slot
        ? `${formatMskDayMonth(lastAnalyzed.slot.startAt)} · ${
            lastAnalyzedState === "pending" ? "готовится" : "готов"
          } → раздел «Сессии»`
        : "разборов пока нет",
    },
    {
      key: "plan",
      href: appUrl(`/practitioner/clients/${clientId}?tab=plan`),
      icon: <Target width={16} height={16} strokeWidth={1.8} aria-hidden="true" />,
      title: "План сопровождения",
      subtitle:
        goals.length > 0
          ? `${goals.length} ${goals.length === 1 ? "цель" : goals.length < 5 ? "цели" : "целей"} → в разделе «План»`
          : "плана ещё нет — создать",
    },
    {
      key: "messages",
      href: appUrl(`/practitioner/clients/${clientId}?tab=messages`),
      icon: <MessageSquare width={16} height={16} strokeWidth={1.8} aria-hidden="true" />,
      title: "Сообщения",
      subtitle: lastMessage
        ? `последнее ${formatMskDayMonth(lastMessage.sentAt)} · ${lastMessage.readAt ? "прочитано" : "не прочитано"} → в разделе «Сообщения»`
        : "ещё не отправляли",
    },
  ];

  return (
    <div data-testid="client-card-overview-mobile">
      {/* О клиенте */}
      <div className="pcab-section-head" style={{ margin: "20px 0 9px" }}>
        <span className="pcab-eyebrow">О клиенте</span>
      </div>
      <div className="pcab-card r16">
        {lastContext ? (
          <p className="pcab-req">Запрос: {lastContext}</p>
        ) : (
          <p className="pcab-req" style={{ color: "var(--pc-ink-faint)" }}>
            Запрос не указан — он появится из контекста записи клиента.
          </p>
        )}
      </div>

      {/* Статус */}
      <div className="pcab-section-head" style={{ margin: "20px 0 9px" }}>
        <span className="pcab-eyebrow">Статус</span>
      </div>
      <div className="pcab-list r16">
        {statusRows.map((row) => (
          <Link key={row.key} href={row.href} className="pcab-row">
            <span className="pcab-row-ic r10">{row.icon}</span>
            <span className="pcab-row-main">
              <span className="pcab-row-t">{row.title}</span>
              <span className="pcab-row-s">{row.subtitle}</span>
            </span>
            <ChevronRight className="pcab-chev" width={17} height={17} aria-hidden="true" />
          </Link>
        ))}
      </div>

      {/* Требует внимания */}
      <div className="pcab-section-head" style={{ margin: "20px 0 9px" }}>
        <span className="pcab-eyebrow">Требует внимания</span>
      </div>
      <div className="pcab-list r16">
        {lastAnalyzedState === "ready" && lastAnalyzed && (
          <Link href={appUrl(`/practitioner/sessions/${lastAnalyzed.id}`)} className="pcab-row">
            <span className="pcab-row-ic amber" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">
                <path d="M12 2.6l1.9 5.1 5.1 1.9-5.1 1.9L12 16.6l-1.9-5.1L5 9.6l5.1-1.9z" />
              </svg>
            </span>
            <span className="pcab-row-main">
              <span className="pcab-row-t">Проверьте разбор сессии</span>
              <span className="pcab-row-s">AI-заметки готовы к проверке</span>
            </span>
            <ChevronRight className="pcab-chev" width={17} height={17} aria-hidden="true" />
          </Link>
        )}
        {plan?.aiSuggestion != null && (
          <Link href={appUrl(`/practitioner/clients/${clientId}/plan/edit`)} className="pcab-row" data-testid="client-card-ai-suggestion-mobile">
            <span className="pcab-row-ic amber" style={{ width: 34, height: 34, borderRadius: 10 }}>
              <Target width={16} height={16} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="pcab-row-main">
              <span className="pcab-row-t">AI предложил обновление плана</span>
              <span className="pcab-row-s">подтвердите или поправьте цели</span>
            </span>
            <ChevronRight className="pcab-chev" width={17} height={17} aria-hidden="true" />
          </Link>
        )}
        <Link href={appUrl(`/practitioner/clients/${clientId}?tab=messages`)} className="pcab-row">
          <span className="pcab-row-ic warm" style={{ width: 34, height: 34, borderRadius: 10 }}>
            <Send width={16} height={16} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="pcab-row-main">
            <span className="pcab-row-t">Отправить материал клиенту</span>
            <span className="pcab-row-s">по вашему усмотрению</span>
          </span>
          <ChevronRight className="pcab-chev" width={17} height={17} aria-hidden="true" />
        </Link>
      </div>
    </div>
  );
}

/* ── Сессии (mockup -client-sessions): ближайшая + прошедшие ─────────── */
function CardMobileSessions({ bookings }: { bookings: CardBooking[] }) {
  const now = new Date();
  const upcoming = bookings
    .filter((b) => ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(b.status) && b.slot && b.slot.endAt >= now)
    .sort((a, b) => a.slot!.startAt.getTime() - b.slot!.startAt.getTime());
  const past = bookings
    .filter((b) => b.status === "COMPLETED" || (b.slot && b.slot.endAt < now && b.status !== "CANCELLED"))
    .sort(
      (a, b) =>
        (b.slot?.startAt.getTime() ?? b.createdAt.getTime()) - (a.slot?.startAt.getTime() ?? a.createdAt.getTime()),
    );
  const next = upcoming[0];
  const joinable = next
    ? canJoinBooking(
        {
          status: next.status,
          slot: next.slot ? { startAt: next.slot.startAt.toISOString(), endAt: next.slot.endAt.toISOString() } : null,
        },
        now.getTime(),
      )
    : false;
  const nextDurationMin = next?.slot
    ? Math.round((next.slot.endAt.getTime() - next.slot.startAt.getTime()) / 60000)
    : null;

  return (
    <div data-testid="client-card-sessions-mobile">
      <div className="pcab-section-head" style={{ margin: "20px 0 9px" }}>
        <span className="pcab-eyebrow">Ближайшая</span>
      </div>
      {next ? (
        <Link href={appUrl(`/practitioner/calendar/booking/${next.id}`)} className="pcab-next" data-testid="client-card-next-session">
          <span className="pcab-next-ic">
            <Clock width={18} height={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="pcab-next-main">
            <span className="pcab-next-t" style={{ display: "block" }}>
              {next.slot ? `${formatMskDayMonth(next.slot.startAt)} · ${formatMskTime(next.slot.startAt)}` : "время уточняется"}
            </span>
            <span className="pcab-next-s" style={{ display: "block" }}>
              Индивидуальная{nextDurationMin ? ` · ${nextDurationMin} мин` : ""} · {ordinalLabel(past.length + 1)} сессия
            </span>
            <span className="pcab-next-note">
              <Lock width={11} height={11} aria-hidden="true" />
              {next.status === "PENDING"
                ? "ждёт вашего подтверждения"
                : joinable
                  ? "идёт T-30 окно — можно войти"
                  : "«Войти» откроется за 30 мин до начала"}
            </span>
          </span>
        </Link>
      ) : (
        <div className="pcab-next">
          <span className="pcab-next-ic">
            <Clock width={18} height={18} strokeWidth={1.8} aria-hidden="true" />
          </span>
          <span className="pcab-next-main">
            <span className="pcab-next-t" style={{ display: "block" }}>Запланированных сессий нет</span>
            <span className="pcab-next-s" style={{ display: "block" }}>предложите клиенту время — «Записать»</span>
          </span>
        </div>
      )}

      <div className="pcab-section-head" style={{ margin: "20px 0 4px" }}>
        <span className="pcab-eyebrow">Прошедшие · {past.length}</span>
      </div>
      <p className="pcab-cap" style={{ margin: "0 0 9px" }}>
        нажмите на сессию → AI-разбор: резюме · заметки · транскрипт · сообщение
      </p>
      {past.length === 0 ? (
        <div className="pcab-card r16">
          <p className="pcab-req" style={{ color: "var(--pc-ink-faint)" }}>Завершённых сессий пока нет.</p>
        </div>
      ) : (
        <div className="pcab-list r16">
          {past.map((b, idx) => {
            const state = analysisState(b);
            const when = b.slot?.startAt ?? b.createdAt;
            const durationMin = b.slot
              ? Math.round((b.slot.endAt.getTime() - b.slot.startAt.getTime()) / 60000)
              : null;
            const ordinal = past.length - idx;
            return (
              <Link
                key={b.id}
                href={appUrl(`/practitioner/sessions/${b.id}`)}
                className="pcab-row"
                data-testid="client-card-session-row-mobile"
              >
                <span className="pcab-row-date">{shortDay(when)}</span>
                <span className="pcab-row-main">
                  <span className="pcab-row-t">{ordinalLabel(ordinal)} сессия</span>
                  <span className="pcab-row-s">
                    Индивидуальная{durationMin ? ` · ${durationMin} мин` : ordinal === 1 ? " · первичная" : ""}
                  </span>
                </span>
                {state === "pending" && <span className="pcab-tag xs warn">разбор готовится</span>}
                {state === "ready" && <span className="pcab-tag xs sage">разбор</span>}
                <ChevronRight className="pcab-chev" width={17} height={17} aria-hidden="true" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
