import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { isYandexOnlyLLMMode } from "@/lib/env";

export interface SessionSttResult {
  transcriptText: string;
  metadata: Prisma.InputJsonObject;
}

function extractTranscript(text: string) {
  const json = text.match(/\{[^]*\}/)?.[0];
  if (json) {
    try {
      const parsed = JSON.parse(json) as { transcriptText?: unknown; transcript?: unknown; text?: unknown };
      const value = parsed.transcriptText ?? parsed.transcript ?? parsed.text;
      if (typeof value === "string" && value.trim().length > 0) return value.trim();
    } catch {
      // Fall back to the provider text below.
    }
  }
  return text.trim();
}

export async function transcribeSessionAudio(input: {
  audioUrl: string;
  feature?: "session-stt";
  requestId?: string;
  userId?: string | null;
}): Promise<SessionSttResult> {
  if (isYandexOnlyLLMMode()) {
    throw new Error("Yandex SpeechKit STT requires Object Storage handoff; server STT is disabled until SpeechKit integration is configured");
  }

  const response = await aiComplete({
    feature: input.feature ?? "session-stt",
    userId: input.userId,
    requestId: input.requestId,
    maxTokens: 1200,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "You are ETerapy's server-side session STT adapter.",
          "Transcribe the provided temporary LiveKit room audio.",
          "Return only JSON with key transcriptText.",
          "Keep speaker labels when detectable; never summarize or add advice.",
        ].join(" "),
      },
      {
        role: "user",
        content: `Temporary audio URL for transcription: ${input.audioUrl}`,
      },
    ],
  });
  const transcriptText = extractTranscript(response.text);
  if (transcriptText.length < 10) throw new Error("Server STT transcript is too short");

  return {
    transcriptText,
    metadata: {
      provider: response.provider,
      model: response.model,
      tokensIn: response.tokensIn,
      tokensOut: response.tokensOut,
      latencyMs: response.latencyMs,
    },
  };
}
