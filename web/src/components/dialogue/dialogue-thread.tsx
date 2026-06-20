// Shared renderer for the checkin dialogue thread, in the ORIGINAL chat design
// (soft-msg rows + avatars + bubbles). Used both in the live clarifying view and
// inside the collapsed «первичный разбор» on the result, so the disclosure keeps
// exactly the same look as the live conversation (#9).

type ThreadMessage = {
  id: string;
  role: string;
  content: string;
};

export function DialogueThread({ messages }: { messages: ThreadMessage[] }) {
  const thread = messages.filter((message) => message.role !== "SYSTEM" && message.content.trim());
  return (
    <div className="soft-dialogue-history-thread">
      {thread.map((message) => {
        const isUser = message.role === "USER";
        return (
          <div
            key={message.id}
            className={`soft-msg-row ${isUser ? "soft-msg-row-user" : "soft-msg-row-assistant"}`}
          >
            {isUser ? (
              <div className="soft-msg-avatar soft-msg-avatar-user" aria-hidden="true">В</div>
            ) : (
              <div className="soft-msg-avatar" aria-hidden="true" />
            )}
            <div
              className={`soft-msg-bubble ${isUser ? "soft-msg-bubble-user" : "soft-msg-bubble-assistant"}`}
              style={{ whiteSpace: "pre-wrap" }}
            >
              {message.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
