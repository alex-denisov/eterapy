// B466 — общий тип строки брони для табов карточки клиента.
export interface CardBooking {
  id: string;
  status: string;
  createdAt: Date;
  meetingContext: string | null;
  priceRub: number;
  slot: { startAt: Date; endAt: Date } | null;
  videoSession: {
    id: string;
    summaryText: string | null;
    transcriptText: string | null;
    serverSttStatus: string;
    createdAt: Date;
  } | null;
}

/** Статус AI-разбора сессии (owner #4: два состояния — готовится/готов). */
export function analysisState(b: CardBooking): "ready" | "pending" | null {
  if (!b.videoSession) return null;
  if (b.videoSession.summaryText) return "ready";
  if (b.videoSession.serverSttStatus === "processing" || b.videoSession.serverSttStatus === "requested") return "pending";
  return null;
}
