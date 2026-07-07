import { Paperclip } from "lucide-react";
import db from "@/lib/db";
import { formatMskDayMonth, formatMskTime } from "@/lib/msk-time";
import { MessageComposer } from "./message-composer";

// B478 — «Сообщения» (practitioner side; mockup -client-messages): история
// отправленных артефактов со статусом «прочитано» + composer внизу.
// Односторонний канал: клиент читает, отвечает на следующей сессии.

export async function CardMessages({
  practitionerId,
  clientId,
  clientLabel,
}: {
  practitionerId: string;
  clientId: string;
  clientLabel: string;
}) {
  const messages = await db.practitionerClientMessage.findMany({
    where: { practitionerId, clientId },
    orderBy: { sentAt: "desc" },
    take: 50,
    select: {
      id: true,
      text: true,
      attachmentName: true,
      sentAt: true,
      readAt: true,
    },
  });

  return (
    <div className="mt-5 flex flex-col gap-4" data-testid="client-card-messages">
      <p className="text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        Односторонний канал: {clientLabel} получит уведомление и прочитает сообщение в своём кабинете. Ответ — на
        следующей сессии, переписки здесь нет.
      </p>

      {/* История отправленного */}
      {messages.length === 0 ? (
        <p className="soft-card p-4 text-sm text-[var(--soft-ink-faint)]">
          Вы ещё не отправляли сообщений этому клиенту.
        </p>
      ) : (
        <div className="flex flex-col gap-2.5" data-testid="client-card-message-history">
          {messages.map((m) => (
            <article key={m.id} className="soft-card p-3.5">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>
              {m.attachmentName && (
                <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--soft-ink-soft)]">
                  <Paperclip className="h-3.5 w-3.5" />
                  {m.attachmentName}
                </p>
              )}
              <p className="mt-2 border-t border-[var(--soft-paper-deep)] pt-2 text-[11px] text-[var(--soft-ink-faint)]">
                {formatMskDayMonth(m.sentAt)} в {formatMskTime(m.sentAt)}
                {m.readAt ? " · прочитано клиентом" : " · не прочитано"}
              </p>
            </article>
          ))}
        </div>
      )}

      {/* Composer */}
      <MessageComposer clientId={clientId} />
    </div>
  );
}
