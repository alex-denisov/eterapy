import Link from "next/link";
import { Check, ChevronLeft, Sparkles } from "lucide-react";
import { appUrl } from "@/lib/subdomain";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { MessageSegment } from "./message-segment";
import { RegenerateNotesButton } from "./regenerate-notes-button";

// B466 R9 P5 — мобильный AI-ассистент сессии (mockups -session-ai-assistant/
// -notes/-transcript/-client-message), pcab-native. Шелл 1-в-1 (карточка сессии
// + 4-сегментный переключатель); контент рендерит РЕАЛЬНЫЕ плоские данные
// (summary/notes/transcript markdown + B478 MessageSegment variant=pcab).
// ⚠ Структурированные секции макетов (ключевые темы/эмоц-фон/риск, SOAP-форматы,
// диаризация/таймкоды/поиск) требуют структурированного AI-выхода — бэклог.

type Segment = "summary" | "notes" | "transcript" | "message";
const SEGMENTS: Array<{ key: Segment; label: string }> = [
  { key: "summary", label: "Резюме" },
  { key: "notes", label: "Заметки" },
  { key: "transcript", label: "Транскрипт" },
  { key: "message", label: "Сообщение" },
];

function initials(label: string): string {
  return label.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
}

export function SessionMobile(props: {
  bookingId: string;
  clientId: string;
  clientLabel: string;
  seg: Segment;
  dateLabel: string;
  retentionDays: number | null;
  processing: boolean;
  hasVs: boolean;
  summaryText: string | null;
  notesText: string | null;
  transcriptText: string | null;
  followupDraft: string;
  vsId: string | null;
  transcriptWords: number;
}) {
  const {
    bookingId, clientId, clientLabel, seg, dateLabel, retentionDays,
    processing, hasVs, summaryText, notesText, transcriptText, followupDraft, vsId, transcriptWords,
  } = props;
  const segBase = appUrl(`/practitioner/sessions/${bookingId}`);
  const planEditHref = appUrl(`/practitioner/clients/${clientId}/plan/edit`);
  const retentionLabel =
    retentionDays !== null
      ? `хранится ещё ${retentionDays} ${retentionDays === 1 ? "день" : retentionDays > 1 && retentionDays < 5 ? "дня" : "дней"}`
      : null;

  return (
    <div className="pcab-screen md:hidden" data-pcab-top data-testid="practitioner-session-mobile">
      <div className="pcab-topbar">
        <Link href={appUrl(`/practitioner/clients/${clientId}?tab=sessions`)} className="pcab-roundbtn" aria-label="Назад к сессиям клиента">
          <ChevronLeft width={19} height={19} aria-hidden="true" />
        </Link>
        <span className="pcab-eyebrow">AI-ассистент сессии</span>
        <span className="pcab-topbar-spacer" aria-hidden="true" />
      </div>

      {/* Карточка сессии */}
      <div className="pcab-sess">
        <span className="pcab-avatar-sm">{initials(clientLabel)}</span>
        <div className="pcab-sess-body">
          <div className="pcab-sess-name">{clientLabel}</div>
          <div className="pcab-sess-meta">{dateLabel}</div>
          <div className="pcab-sess-chips">
            {hasVs && (
              <span className="pcab-mini sage">
                <Check width={11} height={11} strokeWidth={2.4} aria-hidden="true" />
                запись обработана
              </span>
            )}
            {retentionLabel && <span className="pcab-mini calm">{retentionLabel}</span>}
          </div>
        </div>
      </div>

      {/* Переключатель разделов (реюз существующего pcab-seg segmented) */}
      <div className="pcab-seg" data-testid="session-segments-mobile">
        {SEGMENTS.map((s) => (
          <Link
            key={s.key}
            href={`${segBase}?seg=${s.key}`}
            className={`pcab-seg-item${seg === s.key ? " is-active" : ""}`}
            aria-current={seg === s.key ? "page" : undefined}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {/* Контент раздела (реальные плоские данные) */}
      {seg === "summary" && (
        <SegmentCard>
          {!hasVs ? (
            <p className="pcab-msg-cap">По этой сессии нет видеозаписи — AI-разбор строится по расшифровке видеосессии.</p>
          ) : processing ? (
            <>
              <div className="pcab-sec-head"><span className="pcab-h-sec">Резюме</span><span className="pcab-ai-chip">готовится</span></div>
              <p className="pcab-msg-cap">Расшифровка обрабатывается — резюме, заметки и черновик сообщения появятся здесь автоматически.</p>
            </>
          ) : !summaryText ? (
            <>
              <p className="pcab-msg-cap">AI-разбор по этой сессии не создавался{transcriptText ? " — можно сгенерировать по транскрипту (потратит 1 разбор)" : ""}.</p>
              <div className="pcab-msg-actions">
                {transcriptText && vsId && <RegenerateNotesButton videoSessionId={vsId} label="Сделать разбор" />}
                <Link href={appUrl("/practitioner/ai-usage")} className="pcab-abtn pcab-abtn-ghost">Разборы и AI</Link>
              </div>
            </>
          ) : (
            <>
              <div className="pcab-sec-head"><span className="pcab-h-sec">Резюме</span><span className="pcab-ai-chip"><Sparkles width={11} height={11} aria-hidden="true" />AI · готово</span></div>
              <div className="pcab-md"><SoftMarkdown content={summaryText} /></div>
              <div className="pcab-saved"><Check width={13} height={13} strokeWidth={2} aria-hidden="true" />разбор сохранён в карточке клиента</div>
            </>
          )}
        </SegmentCard>
      )}

      {seg === "notes" && (
        <SegmentCard>
          {notesText ? (
            <>
              <div className="pcab-sec-head"><span className="pcab-h-sec">Заметки</span><span className="pcab-ai-chip"><Sparkles width={11} height={11} aria-hidden="true" />AI</span></div>
              <div className="pcab-md"><SoftMarkdown content={notesText} /></div>
              <div className="pcab-msg-actions">
                {vsId && <RegenerateNotesButton videoSessionId={vsId} label="Перегенерировать" />}
                <Link href={planEditHref} className="pcab-abtn pcab-abtn-ghost">В план сопровождения</Link>
              </div>
              <p className="pcab-msg-cap" style={{ marginTop: 10 }}>Заметки видите только вы. Клиенту они не показываются.</p>
            </>
          ) : (
            <p className="pcab-msg-cap">Заметки не сгенерированы.</p>
          )}
        </SegmentCard>
      )}

      {seg === "transcript" && (
        <SegmentCard>
          {transcriptText ? (
            <>
              <p className="pcab-msg-cap">Расшифровка server-STT · {transcriptWords.toLocaleString("ru")} слов · хранение по 152-ФЗ{retentionDays !== null ? ` · ещё ${retentionDays} дн` : ""}</p>
              <div className="pcab-transcript">{transcriptText}</div>
            </>
          ) : (
            <p className="pcab-msg-cap">Транскрипт недоступен для этой сессии.</p>
          )}
        </SegmentCard>
      )}

      {seg === "message" && (
        <div className="pcab-msg-wrap">
          <MessageSegment variant="pcab" clientId={clientId} clientLabel={clientLabel} bookingId={bookingId} initialDraft={followupDraft} />
        </div>
      )}
    </div>
  );
}

function SegmentCard({ children }: { children: React.ReactNode }) {
  return <div className="pcab-card r16 pcab-seg-card">{children}</div>;
}
