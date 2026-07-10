import Link from "next/link";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  MessageSquare,
  MoreHorizontal,
  RefreshCw,
  UserRound,
  Video,
  XCircle,
} from "lucide-react";
import { formatMskDayMonth, formatMskTime } from "@/lib/msk-time";
import { appUrl } from "@/lib/subdomain";

// B466 R9-4 P3 — мобильная «Сессия» (карточка брони) 1-в-1 по mockup
// practitioner-calendar-session.html: topbar → герой клиента → карточка сессии
// (дата · чипы формат/длительность/цена/статус) → join-gate T-30 → действия
// (Перенести/Отменить/Сообщение/Карточка) → AI-разбор. Данные и флаг join
// (правило T-30) приходят готовыми из page.tsx — та же логика, что и на десктопе.

// Статусы, которые в макете подсвечены зелёным (.status); прочие — нейтральный чип.
const POSITIVE = new Set(["CONFIRMED", "IN_PROGRESS", "COMPLETED"]);

export interface BookingMobileProps {
  bookingId: string;
  clientId: string;
  clientLabel: string;
  initials: string;
  sinceLabel: string;
  ordinal: number;
  startAt: string | null;
  endAt: string | null;
  durationMin: number;
  priceRub: number;
  statusLabel: string;
  status: string;
  meetingContext: string | null;
  joinable: boolean;
  upcoming: boolean;
  hasOpenRequest: boolean;
  openRequestNote: string | null;
  analysisReady: boolean;
}

export function PractitionerBookingMobile(props: BookingMobileProps) {
  const {
    bookingId,
    clientId,
    clientLabel,
    initials,
    sinceLabel,
    ordinal,
    startAt,
    endAt,
    durationMin,
    priceRub,
    statusLabel,
    status,
    meetingContext,
    joinable,
    upcoming,
    hasOpenRequest,
    openRequestNote,
    analysisReady,
  } = props;

  const start = startAt ? new Date(startAt) : null;
  const end = endAt ? new Date(endAt) : null;
  const messagesHref = appUrl(`/practitioner/clients/${clientId}?tab=messages`);
  const clientHref = appUrl(`/practitioner/clients/${clientId}`);
  const joinGateTime = start ? formatMskTime(new Date(start.getTime() - 30 * 60000)) : null;

  return (
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-booking-mobile">
      {/* topbar */}
      <div className="pcab-topbar">
        <Link href={appUrl("/practitioner/calendar")} className="pcab-roundbtn" aria-label="Назад">
          <ChevronLeft width={19} height={19} aria-hidden="true" />
        </Link>
        <span className="pcab-topbar-title">Сессия</span>
        <details className="pcab-more">
          <summary className="pcab-roundbtn" aria-label="Ещё">
            <MoreHorizontal width={18} height={18} aria-hidden="true" />
          </summary>
          <div className="pcab-more-menu">
            <Link href={messagesHref}>
              <MessageSquare width={15} height={15} aria-hidden="true" />
              Сообщение клиенту
            </Link>
            <Link href={clientHref}>
              <UserRound width={15} height={15} aria-hidden="true" />
              Карточка клиента
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
            клиент с {sinceLabel} · {ordinal}-я сессия
          </div>
          <div className="pcab-client-tags">
            <span className="pcab-ctag">Индивидуальная</span>
          </div>
        </div>
      </div>

      {/* session card */}
      <div className="pcab-sesscard" data-testid="practitioner-booking-mobile-card">
        <div className="pcab-sc-when">
          <div className="pcab-sc-when-ic" aria-hidden="true">
            <Calendar width={21} height={21} strokeWidth={1.7} />
          </div>
          <div>
            <div className="pcab-sc-date">
              {start ? `${formatMskDayMonth(start)}, ${formatMskTime(start)}` : "Время уточняется"}
            </div>
            {start && end && (
              <div className="pcab-sc-sub">
                {formatMskTime(start)} – {formatMskTime(end)}
              </div>
            )}
          </div>
        </div>
        <div className="pcab-sc-meta">
          <span className="pcab-sc-chip">Индивидуальная</span>
          <span className="pcab-sc-chip">{durationMin} мин</span>
          <span className="pcab-sc-chip">{priceRub.toLocaleString("ru")} ₽</span>
          <span className={`pcab-sc-chip${POSITIVE.has(status) ? " status" : ""}`}>{statusLabel}</span>
        </div>
        {meetingContext && <p className="pcab-sc-context">{meetingContext}</p>}
      </div>

      {/* join gate — T-30 */}
      {(upcoming || status === "IN_PROGRESS") &&
        (joinable ? (
          <a
            href={`/session/${bookingId}`}
            className="pcab-btn block pcab-btn-primary"
            style={{ marginTop: 14 }}
            data-testid="practitioner-booking-mobile-join"
          >
            <Video width={16} height={16} strokeWidth={1.9} aria-hidden="true" />
            Войти в сессию
          </a>
        ) : (
          <div style={{ marginTop: 14 }}>
            <div className="pcab-btn block" aria-disabled="true" data-testid="practitioner-booking-mobile-join-gated">
              <Lock width={16} height={16} strokeWidth={1.9} aria-hidden="true" />
              Войти в сессию
            </div>
            <div className="pcab-joinhint">
              <Clock width={13} height={13} strokeWidth={2} aria-hidden="true" />
              {joinGateTime ? `Откроется за 30 минут до начала — в ${joinGateTime}` : "Откроется за 30 минут до начала"}
            </div>
          </div>
        ))}

      {/* open change request — прячем действия, показываем статус */}
      {hasOpenRequest && openRequestNote && (
        <div className="pcab-note" data-testid="practitioner-booking-mobile-open-request">
          {openRequestNote}
        </div>
      )}

      {/* actions */}
      {upcoming && !hasOpenRequest && (
        <div className="pcab-list r16" style={{ marginTop: 16 }} data-testid="practitioner-booking-mobile-actions">
          <Link href={appUrl(`/practitioner/calendar/booking/${bookingId}/reschedule`)} className="pcab-row">
            <span className="pcab-row-ic calm" aria-hidden="true">
              <RefreshCw width={17} height={17} strokeWidth={1.8} />
            </span>
            <span className="pcab-row-main">
              <span className="pcab-row-t">Перенести</span>
              <span className="pcab-row-s">Предложить клиенту другое время</span>
            </span>
            <ChevronRight className="pcab-chev" width={18} height={18} aria-hidden="true" />
          </Link>
          <Link href={appUrl(`/practitioner/calendar/booking/${bookingId}/cancel`)} className="pcab-row">
            <span className="pcab-row-ic warm" aria-hidden="true">
              <XCircle width={17} height={17} strokeWidth={1.8} />
            </span>
            <span className="pcab-row-main">
              <span className="pcab-row-t danger">Отменить сессию</span>
              <span className="pcab-row-s">С учётом правил отмены</span>
            </span>
            <ChevronRight className="pcab-chev" width={18} height={18} aria-hidden="true" />
          </Link>
          <Link href={messagesHref} className="pcab-row">
            <span className="pcab-row-ic calm" aria-hidden="true">
              <MessageSquare width={17} height={17} strokeWidth={1.8} />
            </span>
            <span className="pcab-row-main">
              <span className="pcab-row-t">Сообщение клиенту</span>
            </span>
            <ChevronRight className="pcab-chev" width={18} height={18} aria-hidden="true" />
          </Link>
          <Link href={clientHref} className="pcab-row">
            <span className="pcab-row-ic calm" aria-hidden="true">
              <UserRound width={17} height={17} strokeWidth={1.8} />
            </span>
            <span className="pcab-row-main">
              <span className="pcab-row-t">Открыть карточку клиента</span>
            </span>
            <ChevronRight className="pcab-chev" width={18} height={18} aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* AI-разбор сессии */}
      {analysisReady ? (
        <Link
          href={appUrl(`/practitioner/sessions/${bookingId}`)}
          className="pcab-airow"
          data-testid="practitioner-booking-mobile-analysis"
        >
          <div className="pcab-airow-main">
            <div className="pcab-airow-t ready">AI-разбор сессии готов</div>
            <div className="pcab-airow-s">Резюме, заметки, транскрипт и черновик сообщения клиенту — открыть.</div>
          </div>
          <ChevronRight className="pcab-chev" width={18} height={18} aria-hidden="true" />
        </Link>
      ) : (
        <div className="pcab-airow" data-testid="practitioner-booking-mobile-analysis">
          <div className="pcab-airow-main">
            <div className="pcab-airow-t">AI-разбор этой сессии</div>
            <div className="pcab-airow-s">
              Резюме, заметки и транскрипт появятся после завершения — в рамках месячной квоты разборов.
            </div>
          </div>
        </div>
      )}
      <div className="pcab-note">
        Управлять разборами и квотой — в разделе{" "}
        <Link href={appUrl("/practitioner/ai-usage")} className="pcab-link" style={{ fontWeight: 600 }}>
          «Разборы и AI»
        </Link>
        .
      </div>
    </div>
  );
}
