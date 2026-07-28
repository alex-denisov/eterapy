export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Check, FileText, Lock, Mic, ShieldCheck, Sparkles } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { formatMskDayMonth, formatMskTime } from "@/lib/msk-time";
import { sessionFormatLabel } from "@/lib/session-formats";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { MessageSegment } from "./message-segment";
import { RegenerateNotesButton } from "./regenerate-notes-button";
import { SessionMobile } from "./session-mobile";

// B466 — AI-ассистент сессии (mockups -session-ai-assistant/-notes/
// -transcript/-client-message): сегменты Резюме · Заметки · Транскрипт ·
// Сообщение; динамический счётчик «хранится ещё N дней» (owner v2 #4);
// «Сообщение» — односторонний артефакт с AI-переписыванием тона (B478).
// R9-5 desktop -session-v2: герой сессии (аватар · N-я встреча · формат) +
// 2-колоночная раскладка с боковой панелью «Действия» + 152-ФЗ.

type Segment = "summary" | "notes" | "transcript" | "message";
const SEGMENTS: Array<{ key: Segment; label: string }> = [
  { key: "summary", label: "Резюме" },
  { key: "notes", label: "Заметки" },
  { key: "transcript", label: "Транскрипт" },
  { key: "message", label: "Сообщение" },
];

function daysLeft(expiresAt: Date | null): number | null {
  if (!expiresAt) return null;
  return Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000)));
}

function retentionWord(days: number): string {
  return days === 1 ? "день" : days < 5 && days > 0 ? "дня" : "дней";
}

/** Небольшой AI-бейдж «AI · готово» / «Заметки · SOAP» и т.п. */
function AiChip({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
      style={{ background: "#F6E7DD", color: "var(--soft-bordeaux)" }}
    >
      {icon ?? <Sparkles className="h-3 w-3" />}
      {label}
    </span>
  );
}

/** Боковая панель «Действия» (для сегментов Резюме/Заметки). */
function SidePanel({
  clientId,
  bookingId,
  vsId,
  canRegenerate,
}: {
  clientId: string;
  bookingId: string;
  vsId: string | null;
  canRegenerate: boolean;
}) {
  return (
    <aside className="soft-card h-fit p-4" data-testid="session-side-actions">
      <p className="soft-eyebrow mb-3">Действия</p>
      <div className="flex flex-col gap-2">
        <Link
          href={appUrl(`/practitioner/clients/${clientId}/plan/edit`)}
          className="soft-button soft-button-primary inline-flex items-center justify-center gap-1.5"
        >
          <FileText className="h-4 w-4" />
          В план сопровождения
        </Link>
        <Link
          href={appUrl(`/practitioner/sessions/${bookingId}?seg=message`)}
          className="soft-button soft-button-ghost justify-center"
        >
          Написать клиенту
        </Link>
        {vsId && canRegenerate && <RegenerateNotesButton videoSessionId={vsId} label="Перегенерировать" />}
      </div>
      <p className="mt-3 border-t border-[var(--soft-paper-deep)] pt-3 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        Расшифровка и резюме хранятся по 152-ФЗ и доступны только вам. Клиент их не видит.
      </p>
    </aside>
  );
}

export default async function PractitionerSessionAnalysisPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ seg?: string }>;
}) {
  const session = await auth();
  if (!session) redirect(loginUrl());
  if (session.user?.role !== "PRACTITIONER") redirect("/cabinet");

  const { id: bookingId } = await params;
  const { seg: rawSeg } = await searchParams;
  const seg: Segment = (SEGMENTS.some((s) => s.key === rawSeg) ? rawSeg : "summary") as Segment;

  const practitioner = await db.practitioner.findUnique({
    where: { userId: session.user!.id! },
    select: { id: true },
  });
  if (!practitioner) redirect(appUrl("/practitioner"));

  const booking = await db.booking.findUnique({
    where: { id: bookingId },
    include: {
      client: { select: { id: true, name: true, email: true } },
      slot: true,
      videoSession: true,
    },
  });
  if (!booking || booking.practitionerId !== practitioner.id) notFound();

  const vs = booking.videoSession;
  const clientLabel = booking.client.name ?? booking.client.email ?? "Клиент";
  const retentionDays = daysLeft(vs?.summaryExpiresAt ?? vs?.transcriptExpiresAt ?? null);
  const processing = vs && !vs.summaryText && ["queued", "processing", "requested"].includes(vs.serverSttStatus);
  const processingFailed = vs?.serverSttStatus === "failed" || vs?.serverSttStatus === "audio_expired";
  const recordingProcessed = vs?.serverSttStatus === "completed";
  const dateLabel = booking.slot
    ? `${formatMskDayMonth(booking.slot.startAt)} · ${formatMskTime(booking.slot.startAt)}–${formatMskTime(booking.slot.endAt)}`
    : formatMskDayMonth(booking.createdAt);

  // Метаданные героя карточки (как в календарной карточке брони): «N-я встреча»,
  // формат сессии, длительность, инициалы для аватара.
  const clientBookings = await db.booking.findMany({
    where: { practitionerId: practitioner.id, clientId: booking.clientId },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  const ordinal = Math.max(1, clientBookings.findIndex((b) => b.id === booking.id) + 1);
  const initials =
    clientLabel
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]?.toUpperCase() ?? "")
      .join("") || "К";
  const formatLabel = sessionFormatLabel(booking.format);
  const durationMin = booking.slot
    ? Math.max(1, Math.round((booking.slot.endAt.getTime() - booking.slot.startAt.getTime()) / 60000))
    : null;
  const headMeta = [dateLabel, formatLabel, durationMin ? `${durationMin} мин` : null].filter(Boolean).join(" · ");
  const canRegenerate = Boolean(vs?.transcriptText);

  return (
    <>
      {/* МОБАЙЛ — 1-в-1 mockups practitioner-session-* (pcab-native, реальные данные) */}
      <SessionMobile
        bookingId={booking.id}
        clientId={booking.client.id}
        clientLabel={clientLabel}
        seg={seg}
        dateLabel={dateLabel}
        retentionDays={retentionDays}
        processing={!!processing}
        processingFailed={processingFailed}
        recordingProcessed={recordingProcessed}
        hasVs={!!vs}
        summaryText={vs?.summaryText ?? null}
        notesText={vs?.practitionerNotesText ?? null}
        transcriptText={vs?.transcriptText ?? null}
        followupDraft={vs?.clientFollowupDraft ?? ""}
        vsId={vs?.id ?? null}
        transcriptWords={vs?.transcriptText ? vs.transcriptText.split(/\s+/).length : 0}
      />

      {/* ДЕСКТОП — -session-v2: герой + 2-колоночная раскладка с боковой панелью */}
      <div
        className="mx-auto hidden w-full max-w-4xl px-4 py-8 sm:px-6 md:block"
        style={{ paddingBottom: 80 }}
        data-testid="practitioner-session-analysis"
      >
        <Link
          href={appUrl(`/practitioner/clients/${booking.client.id}?tab=sessions`)}
          className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]"
        >
          <ArrowLeft className="h-4 w-4" />
          {clientLabel} · сессии
        </Link>
        <p className="soft-eyebrow mt-4">AI-ассистент сессии</p>

        {/* Session head — аватар · N-я встреча · формат · чипы */}
        <section
          className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-3"
          data-testid="session-analysis-card"
        >
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
            style={{ background: "linear-gradient(135deg,var(--soft-terracotta,#C2724B),var(--soft-bordeaux,#6E2B2B))" }}
            aria-hidden="true"
          >
            {initials}
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-semibold leading-tight text-foreground">
              {clientLabel} · {ordinal}-я встреча
            </h1>
            <p className="mt-0.5 text-sm text-[var(--soft-ink-soft)]">{headMeta}</p>
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {recordingProcessed && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "var(--soft-sage,#E4EADF)", color: "var(--soft-sage-ink,#4B6146)" }}
              >
                <ShieldCheck className="h-3 w-3" />
                запись обработана
              </span>
            )}
            {retentionDays !== null && (
              <span
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "var(--soft-paper-deep)", color: "var(--soft-ink-soft)" }}
                data-testid="session-retention-countdown"
              >
                хранение {retentionDays} {retentionWord(retentionDays)}
              </span>
            )}
          </div>
        </section>

        {/* Segments */}
        <div
          className="mt-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1"
          data-testid="session-analysis-segments"
        >
          {SEGMENTS.map((s) => (
            <Link
              key={s.key}
              href={appUrl(`/practitioner/sessions/${booking.id}?seg=${s.key}`)}
              className={`whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium transition-colors ${
                seg === s.key ? "soft-select-pill" : "text-[var(--soft-ink-soft)] hover:text-foreground"
              }`}
              aria-current={seg === s.key ? "page" : undefined}
            >
              {s.label}
            </Link>
          ))}
        </div>

        {/* States: нет записи / готовится / разбор не создавался */}
        {!vs ? (
          <section className="soft-card mt-5 p-5">
            <p className="text-sm text-[var(--soft-ink-soft)]">
              По этой сессии нет видеозаписи — AI-разбор строится по расшифровке видеосессии.
            </p>
          </section>
        ) : processing ? (
          <section className="soft-card mt-5 p-5" data-testid="session-analysis-pending">
            <p className="text-sm font-medium" style={{ color: "var(--soft-amber-ink,#6E5114)" }}>Разбор готовится</p>
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
              Расшифровка обрабатывается — резюме, заметки и черновик сообщения появятся здесь автоматически.
            </p>
          </section>
        ) : processingFailed ? (
          <section className="soft-card mt-5 border border-red-200 p-5" data-testid="session-analysis-failed">
            <p className="text-sm font-medium text-red-700">Не удалось подготовить AI-разбор</p>
            <p className="mt-1 text-sm text-[var(--soft-ink-soft)]">
              Автоматические повторы исчерпаны. Исходная аудиозапись будет удалена по сроку хранения;
              обратитесь в поддержку, указав эту сессию.
            </p>
          </section>
        ) : !vs.summaryText && seg !== "transcript" && seg !== "message" ? (
          <section className="soft-card mt-5 p-5" data-testid="session-analysis-missing">
            <p className="text-sm text-[var(--soft-ink-soft)]">
              AI-разбор по этой сессии не создавался{vs.transcriptText ? " — его можно сгенерировать по транскрипту (потратит 1 разбор из квоты)" : ""}.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {vs.transcriptText && <RegenerateNotesButton videoSessionId={vs.id} label="Сделать разбор" />}
              <Link href={appUrl("/practitioner/ai-usage")} className="soft-chip">Разборы и AI</Link>
            </div>
          </section>
        ) : (
          <>
            {seg === "summary" && vs.summaryText && (
              <div
                className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]"
                data-testid="session-segment-summary"
              >
                <section className="soft-card p-4 sm:p-5">
                  <AiChip label="AI · готово" />
                  <div className="mt-3">
                    <SoftMarkdown content={vs.summaryText} />
                  </div>
                  <p className="mt-4 inline-flex items-center gap-1.5 border-t border-[var(--soft-paper-deep)] pt-3 text-xs text-[var(--soft-ink-faint)]">
                    <Check className="h-3.5 w-3.5" style={{ color: "var(--soft-sage-ink,#4B6146)" }} />
                    Сохранено · виден только вам
                  </p>
                </section>
                <SidePanel
                  clientId={booking.client.id}
                  bookingId={booking.id}
                  vsId={vs.id}
                  canRegenerate={canRegenerate}
                />
              </div>
            )}

            {seg === "notes" && (
              <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_280px]" data-testid="session-segment-notes">
                <section className="soft-card p-4 sm:p-5">
                  {vs.practitionerNotesText ? (
                    <>
                      <AiChip label="Заметки" />
                      <div className="mt-3">
                        <SoftMarkdown content={vs.practitionerNotesText} />
                      </div>
                      <p className="mt-4 inline-flex items-center gap-1.5 border-t border-[var(--soft-paper-deep)] pt-3 text-xs text-[var(--soft-ink-faint)]">
                        <Lock className="h-3.5 w-3.5" />
                        Заметки видите только вы. Клиенту они не показываются.
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-[var(--soft-ink-faint)]">Заметки не сгенерированы.</p>
                  )}
                </section>
                <SidePanel
                  clientId={booking.client.id}
                  bookingId={booking.id}
                  vsId={vs.id}
                  canRegenerate={canRegenerate}
                />
              </div>
            )}

            {seg === "transcript" && (
              <section className="soft-card mt-5 p-4 sm:p-5" data-testid="session-segment-transcript">
                {vs.transcriptText ? (
                  <>
                    <AiChip label="Транскрипт · server-STT" icon={<Mic className="h-3 w-3" />} />
                    <p className="mb-3 mt-3 text-xs text-[var(--soft-ink-faint)]">
                      {vs.transcriptText.split(/\s+/).length.toLocaleString("ru")} слов · хранение по 152-ФЗ
                      {retentionDays !== null ? ` · ещё ${retentionDays} дн` : ""}
                    </p>
                    <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap rounded-[12px] bg-[var(--soft-paper-deep)]/40 p-3.5 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                      {vs.transcriptText}
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-[var(--soft-ink-faint)]">Транскрипт недоступен для этой сессии.</p>
                )}
              </section>
            )}

            {seg === "message" && (
              <MessageSegment
                clientId={booking.client.id}
                clientLabel={clientLabel}
                bookingId={booking.id}
                initialDraft={vs.clientFollowupDraft ?? ""}
              />
            )}
          </>
        )}
      </div>
    </>
  );
}
