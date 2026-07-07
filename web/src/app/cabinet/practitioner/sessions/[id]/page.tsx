export const dynamic = "force-dynamic";

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { auth } from "@/lib/auth";
import db from "@/lib/db";
import { formatMskDayMonth, formatMskTime } from "@/lib/msk-time";
import { appUrl, loginUrl } from "@/lib/subdomain";
import { SoftMarkdown } from "@/components/ui/soft-markdown";
import { MessageSegment } from "./message-segment";
import { RegenerateNotesButton } from "./regenerate-notes-button";

// B466 — AI-ассистент сессии (mockups -session-ai-assistant/-notes/
// -transcript/-client-message): сегменты Резюме · Заметки · Транскрипт ·
// Сообщение; динамический счётчик «хранится ещё N дней» (owner v2 #4);
// «Сообщение» — односторонний артефакт с AI-переписыванием тона (B478).

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
  const processing = vs && !vs.summaryText && ["processing", "requested"].includes(vs.serverSttStatus);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6" style={{ paddingBottom: 80 }} data-testid="practitioner-session-analysis">
      <Link href={appUrl(`/practitioner/clients/${booking.client.id}?tab=sessions`)} className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-ink-soft)]">
        <ArrowLeft className="h-4 w-4" />
        Сессии клиента
      </Link>
      <p className="soft-eyebrow mt-4">AI-разбор сессии</p>
      <h1 className="soft-h1 mt-2">{clientLabel}</h1>

      {/* Session card */}
      <section className="soft-card mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 p-4 text-sm text-[var(--soft-ink-soft)]" data-testid="session-analysis-card">
        <span>
          {booking.slot
            ? `${formatMskDayMonth(booking.slot.startAt)} · ${formatMskTime(booking.slot.startAt)}–${formatMskTime(booking.slot.endAt)}`
            : formatMskDayMonth(booking.createdAt)}
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs" style={{ color: "var(--soft-sage-ink,#4B6146)" }}>
          <ShieldCheck className="h-3.5 w-3.5" />
          запись обработана · server-STT
        </span>
        {retentionDays !== null && (
          <span className="text-xs text-[var(--soft-ink-faint)]" data-testid="session-retention-countdown">
            хранится ещё {retentionDays} {retentionDays === 1 ? "день" : retentionDays < 5 && retentionDays > 0 ? "дня" : "дней"}, затем удаляется
          </span>
        )}
      </section>

      {/* Segments */}
      <div className="mt-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-1" data-testid="session-analysis-segments">
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

      {/* No analysis states */}
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
            <section className="soft-card mt-5 p-4 sm:p-5" data-testid="session-segment-summary">
              <SoftMarkdown content={vs.summaryText} />
              <p className="mt-4 border-t border-[var(--soft-paper-deep)] pt-3 text-xs text-[var(--soft-ink-faint)]">
                Разбор сохранён в карточке клиента. Прогресс в план сопровождения вносится только с вашим
                подтверждением.
              </p>
            </section>
          )}

          {seg === "notes" && (
            <section className="soft-card mt-5 p-4 sm:p-5" data-testid="session-segment-notes">
              {vs.practitionerNotesText ? (
                <>
                  <SoftMarkdown content={vs.practitionerNotesText} />
                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[var(--soft-paper-deep)] pt-3">
                    <RegenerateNotesButton videoSessionId={vs.id} label="Перегенерировать" />
                    <Link href={appUrl(`/practitioner/clients/${booking.client.id}/plan/edit`)} className="soft-chip">
                      В план сопровождения →
                    </Link>
                  </div>
                  <p className="mt-3 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
                    Заметки видите только вы. Клиенту они не показываются.
                  </p>
                </>
              ) : (
                <p className="text-sm text-[var(--soft-ink-faint)]">Заметки не сгенерированы.</p>
              )}
            </section>
          )}

          {seg === "transcript" && (
            <section className="soft-card mt-5 p-4 sm:p-5" data-testid="session-segment-transcript">
              {vs.transcriptText ? (
                <>
                  <p className="mb-3 text-xs text-[var(--soft-ink-faint)]">
                    Расшифровка server-STT · {vs.transcriptText.split(/\s+/).length.toLocaleString("ru")} слов ·
                    хранение по 152-ФЗ{retentionDays !== null ? ` · ещё ${retentionDays} дн` : ""}
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
  );
}
