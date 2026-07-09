import { Check, Info, Paperclip } from "lucide-react";
import db from "@/lib/db";
import { formatMskDayMonth } from "@/lib/msk-time";
import { MessageComposer } from "./message-composer";

// B466 R9-4 P2 — вкладка «Сообщения» мобильной карточки клиента, 1-в-1 по
// docs/Design/mockups/practitioner-client-messages.html: sage-пояснение об
// одностороннем канале → composer (pcab-вариант) → «Отправленные · N» со
// статусами прочитано/отправлено.

export async function CardMobileMessages({
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
    select: { id: true, text: true, attachmentName: true, sentAt: true, readAt: true },
  });

  const firstName = clientLabel.split(" ")[0] ?? clientLabel;

  return (
    <div data-testid="client-card-messages-mobile">
      <div className="pcab-explain">
        <Info width={15} height={15} strokeWidth={1.9} aria-hidden="true" />
        <p>
          Односторонний канал: вы отправляете материалы и задания — клиент их читает. Это не переписка,
          ответ клиента — на сессии.
        </p>
      </div>

      <MessageComposer clientId={clientId} variant="pcab" />

      <div className="pcab-section-head" style={{ margin: "20px 0 9px" }}>
        <span className="pcab-eyebrow">Отправленные · {messages.length}</span>
      </div>

      {messages.length === 0 ? (
        <div className="pcab-card r16">
          <p className="pcab-req" style={{ color: "var(--pc-ink-faint)" }}>
            Вы ещё не отправляли сообщений этому клиенту.
          </p>
        </div>
      ) : (
        <div data-testid="client-card-message-history-mobile">
          {messages.map((m) => (
            <article key={m.id} className="pcab-msg">
              <div className="pcab-msg-top">
                <span className="pcab-msg-who">Вы → {firstName}</span>
                <span className="pcab-msg-when">{formatMskDayMonth(m.sentAt)}</span>
              </div>
              <div className="pcab-msg-text">{m.text}</div>
              {m.attachmentName && (
                <span className="pcab-msg-attach">
                  <Paperclip width={12} height={12} strokeWidth={2} aria-hidden="true" />
                  {m.attachmentName}
                </span>
              )}
              <div className="pcab-msg-status">
                {m.readAt ? (
                  <span className="pcab-st read">
                    <Check width={11} height={11} strokeWidth={2.4} aria-hidden="true" />
                    прочитано
                  </span>
                ) : (
                  <span className="pcab-st wait">отправлено</span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
