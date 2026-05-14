import type { Prisma } from "@prisma/client";
import { aiComplete } from "@/lib/ai";
import { log, serializeError } from "@/lib/logger";
import { detectPractitionerTextRisk, PRACTITIONER_HIGH_RISK_SCORE } from "@/lib/practitioner-antifraud";

export type TranscriptSegment = {
  speakerRole?: "client" | "practitioner" | "unknown";
  speakerLabel?: string;
  text: string;
  startedAtMs?: number;
  endedAtMs?: number;
  isFinal?: boolean;
};

export type SessionComplianceReview = {
  status: "clear" | "review" | "high_risk";
  riskScore: number;
  riskFlags: string[];
  severity: "low" | "medium" | "high";
  summary: string;
  evidenceQuotes: string[];
  moderatorRecommendation: string;
  metadata: Prisma.InputJsonObject;
};

export type SessionSummaryResult = {
  summaryText: string;
  practitionerNotesText: string;
  clientFollowupDraft: string;
  metadata: Prisma.InputJsonObject;
};

const COMPLIANCE_PATTERNS: Array<{ pattern: RegExp; flag: string; quote: string; score: number }> = [
  { pattern: /гарантирую|100%|точно произойд[её]т|обязательно случится/i, flag: "guaranteed_result", quote: "гарантия результата", score: 35 },
  { pattern: /переведите деньги|оплатите сейчас|скидка только сегодня|вне платформы/i, flag: "external_payment_signal", quote: "оплата вне платформы", score: 45 },
  { pattern: /пишите мне в телеграм|мой номер телефона|напишите лично|мой whatsapp/i, flag: "off_platform_contact", quote: "контакт вне платформы", score: 35 },
  { pattern: /умр[её]шь|умрете|проклятие|порча|сглаз|если не сделаешь/i, flag: "fear_pressure", quote: "запугивание или давление", score: 45 },
  { pattern: /ваш адрес|паспорт|снилс|инн|номер карты/i, flag: "sensitive_data_request", quote: "запрос чувствительных данных", score: 30 },
  { pattern: /не ходите к врачу|отмените лечение|юридически обязаны|инвестируйте/i, flag: "regulated_advice", quote: "медицинская, юридическая или финансовая инструкция", score: 40 },
];

function normalizeText(text: string) {
  return text.replace(/\r/g, "").replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function normalizeSegment(segment: TranscriptSegment) {
  const speaker = segment.speakerLabel?.trim()
    || (segment.speakerRole === "practitioner" ? "Практик" : segment.speakerRole === "client" ? "Клиент" : "Участник");
  const time = typeof segment.startedAtMs === "number" ? `[${Math.max(0, Math.round(segment.startedAtMs / 1000))}s] ` : "";
  return `${time}${speaker}: ${segment.text.trim()}`;
}

export function buildSessionTranscript(input: {
  text?: string | null;
  segments?: TranscriptSegment[];
}) {
  const segmentLines = input.segments
    ?.filter((segment) => segment.text.trim().length > 0)
    .map(normalizeSegment) ?? [];
  const text = segmentLines.length > 0 ? segmentLines.join("\n") : input.text ?? "";
  return normalizeText(text).slice(0, 60_000);
}

function quoteMatches(transcript: string, flags: string[]) {
  const quotes = new Set<string>();
  for (const item of COMPLIANCE_PATTERNS) {
    if (!flags.includes(item.flag)) continue;
    const match = transcript.match(item.pattern)?.[0];
    quotes.add(match ? match.slice(0, 160) : item.quote);
  }
  return [...quotes].slice(0, 6);
}

function parseJsonObject(text: string) {
  const raw = text.match(/\{[^]*\}/)?.[0];
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

export async function reviewSessionCompliance(input: {
  transcriptText: string;
  userId?: string | null;
  requestId?: string;
}): Promise<SessionComplianceReview> {
  const transcriptText = normalizeText(input.transcriptText);
  const deterministic = detectPractitionerTextRisk(transcriptText);
  const heuristicFlags = new Set(deterministic.riskFlags);
  let heuristicScore = deterministic.riskScore;
  for (const item of COMPLIANCE_PATTERNS) {
    if (!item.pattern.test(transcriptText)) continue;
    heuristicFlags.add(item.flag);
    heuristicScore += item.score;
  }

  let aiMetadata: Prisma.InputJsonObject | null = null;
  let aiSummary = "";
  let aiRecommendation = "";
  let aiQuotes: string[] = [];
  let aiScore = 0;
  let aiFlags: string[] = [];

  if (transcriptText.length >= 120) {
    try {
      const response = await aiComplete({
        feature: "session-compliance",
        userId: input.userId,
        requestId: input.requestId,
        maxTokens: 700,
        temperature: 0,
        messages: [
          {
            role: "system",
            content: [
              "You are ETerapy's practitioner compliance reviewer.",
              "Return only JSON with keys riskScore, riskFlags, severity, summary, evidenceQuotes, moderatorRecommendation.",
              "Do not make a final sanction decision. Human moderator decides.",
            ].join(" "),
          },
          {
            role: "user",
            content: [
              "Review this session transcript for guarantees, pressure, regulated advice, off-platform payment/contact, abuse, crisis mishandling, and sensitive data requests.",
              transcriptText.slice(0, 12_000),
            ].join("\n\n"),
          },
        ],
      });
      const parsed = parseJsonObject(response.text);
      aiScore = Number(parsed?.riskScore ?? 0);
      aiFlags = Array.isArray(parsed?.riskFlags) ? parsed.riskFlags.map(String).slice(0, 10) : [];
      aiSummary = typeof parsed?.summary === "string" ? parsed.summary : "";
      aiRecommendation = typeof parsed?.moderatorRecommendation === "string" ? parsed.moderatorRecommendation : "";
      aiQuotes = Array.isArray(parsed?.evidenceQuotes) ? parsed.evidenceQuotes.map(String).slice(0, 6) : [];
      aiMetadata = {
        source: "ai",
        provider: response.provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        latencyMs: response.latencyMs,
      };
    } catch (error) {
      log.warn("session-compliance-ai-failed", {
        requestId: input.requestId,
        error: serializeError(error),
      });
      aiMetadata = { source: "heuristic", fallbackReason: "ai_error" };
    }
  }

  const riskFlags = [...new Set([...heuristicFlags, ...aiFlags])];
  const riskScore = Math.min(100, Math.max(heuristicScore, aiScore));
  const severity = riskScore >= 80 ? "high" : riskScore >= 45 ? "medium" : "low";
  const status = riskScore >= 80 ? "high_risk" : riskScore >= PRACTITIONER_HIGH_RISK_SCORE || riskFlags.length > 0 ? "review" : "clear";
  const evidenceQuotes = [...new Set([...quoteMatches(transcriptText, riskFlags), ...aiQuotes])].slice(0, 6);

  return {
    status,
    riskScore,
    riskFlags,
    severity,
    summary: aiSummary || (riskFlags.length > 0 ? "Обнаружены сигналы, требующие проверки модератором." : "Нарушений по автоматической проверке не найдено."),
    evidenceQuotes,
    moderatorRecommendation: aiRecommendation || (status === "clear" ? "Автоматических действий не требуется." : "Передайте в ручную проверку; не применять санкции автоматически."),
    metadata: {
      reviewedAt: new Date().toISOString(),
      transcriptLength: transcriptText.length,
      heuristicScore,
      ai: aiMetadata ?? { source: "not_run", reason: "short_transcript" },
    },
  };
}

export async function generateSessionSummary(input: {
  transcriptText: string;
  userId: string;
  requestId?: string;
}): Promise<SessionSummaryResult> {
  const fallbackSummary = [
    "## Краткое резюме",
    "Сессия завершена. Транскрипт сохранен, но AI-сводка временно недоступна.",
    "",
    "## Дальнейшие шаги",
    "- Вернитесь к ключевому запросу клиента.",
    "- Отметьте договоренности вручную.",
  ].join("\n");

  try {
    const response = await aiComplete({
      feature: "session-summary",
      userId: input.userId,
      requestId: input.requestId,
      maxTokens: 1800,
      temperature: 0.25,
      messages: [
        {
          role: "system",
          content: [
            "Write a Russian ETerapy post-session package for a practitioner.",
            "Return only JSON with keys practitionerNotesText, clientFollowupDraft, summaryText.",
            "No diagnoses, no guarantees, no regulated medical/legal/financial advice. Client follow-up must be gentle and non-categorical.",
          ].join(" "),
        },
        { role: "user", content: input.transcriptText.slice(0, 14_000) },
      ],
    });
    const parsed = parseJsonObject(response.text);
    const summaryText = typeof parsed?.summaryText === "string" ? parsed.summaryText.trim() : "";
    const practitionerNotesText = typeof parsed?.practitionerNotesText === "string" ? parsed.practitionerNotesText.trim() : "";
    const clientFollowupDraft = typeof parsed?.clientFollowupDraft === "string" ? parsed.clientFollowupDraft.trim() : "";
    if (!summaryText || !practitionerNotesText || !clientFollowupDraft) {
      throw new Error("Incomplete session summary JSON");
    }
    return {
      summaryText,
      practitionerNotesText,
      clientFollowupDraft,
      metadata: {
        source: "ai",
        provider: response.provider,
        model: response.model,
        tokensIn: response.tokensIn,
        tokensOut: response.tokensOut,
        latencyMs: response.latencyMs,
      },
    };
  } catch (error) {
    log.warn("session-summary-fallback", {
      requestId: input.requestId,
      error: serializeError(error),
    });
    return {
      summaryText: fallbackSummary,
      practitionerNotesText: fallbackSummary,
      clientFollowupDraft: "Спасибо за встречу. Ниже можно вручную добавить мягкое резюме и следующий шаг.",
      metadata: { source: "heuristic", fallbackReason: "ai_error" },
    };
  }
}
