import { Prisma, type AIProvider, type AIAttemptStatus, type AIRequestStatus } from "@prisma/client";
import db from "@/lib/db";
import { aiBudgetPeriod } from "@/lib/ai-gateway/domain";

const PERIOD_RE = /^\d{4}-\d{2}-\d{2}$/;

export interface AdminAIInteractionMessage {
  role: string;
  content: unknown;
}

export interface AdminAIInteractionAttempt {
  provider: AIProvider;
  model: string;
  status: AIAttemptStatus;
  errorCode: string | null;
  latencyMs: number | null;
  totalTokens: number;
  estimatedCostMicros: number;
}

export interface AdminAIInteractionRow {
  id: string;
  feature: string;
  userId: string | null;
  userLabel: string | null;
  status: AIRequestStatus;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostMicros: number;
  createdAt: Date;
  finishedAt: Date | null;
  requestId: string | null;
  messages: AdminAIInteractionMessage[];
  responseText: string | null;
  errorText: string | null;
  responseProvider: string | null;
  responseModel: string | null;
  attempts: AdminAIInteractionAttempt[];
}

function periodBounds(period: string, daysBack = 1) {
  const safe = PERIOD_RE.test(period) ? period : aiBudgetPeriod();
  const end = new Date(`${safe}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 1);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - Math.min(Math.max(daysBack, 1), 31));
  return { start, end };
}

function metadataObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function messagesFromMetadata(metadata: Record<string, unknown>) {
  const messages = metadata.messages;
  return Array.isArray(messages)
    ? messages.slice(0, 30).map((message) => message as AdminAIInteractionMessage)
    : [];
}

export async function listAdminAIInteractions(input: {
  period?: string;
  daysBack?: number;
  start?: Date;
  end?: Date;
  feature?: string | null;
  status?: AIRequestStatus | "all" | null;
  provider?: AIProvider | "all" | null;
  q?: string | null;
  limit?: number;
  sort?: "createdAt_desc" | "createdAt_asc" | "tokens_desc" | "cost_desc";
} = {}): Promise<AdminAIInteractionRow[]> {
  const { start, end } = input.start && input.end
    ? { start: input.start, end: new Date(input.end.getTime() + 1) }
    : periodBounds(input.period ?? aiBudgetPeriod(), input.daysBack ?? 1);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const q = input.q?.trim().toLowerCase() || null;
  const feature = input.feature?.trim() || null;
  const provider = input.provider && input.provider !== "all" ? input.provider : null;
  const status = input.status && input.status !== "all" ? input.status : null;
  const orderBy = input.sort === "createdAt_asc"
    ? { createdAt: "asc" as const }
    : input.sort === "tokens_desc"
      ? { totalTokens: "desc" as const }
      : input.sort === "cost_desc"
        ? { estimatedCostMicros: "desc" as const }
        : { createdAt: "desc" as const };

  const rows = await db.aIRequest.findMany({
    where: {
      createdAt: { gte: start, lt: end },
      ...(feature && feature !== "all" ? { feature } : {}),
      ...(status ? { status } : {}),
      ...(provider ? { attempts: { some: { provider } } } : {}),
    },
    include: {
      user: { select: { id: true, name: true, email: true } },
      attempts: { orderBy: { startedAt: "asc" } },
    },
    orderBy,
    take: limit,
  });

  return rows
    .map((row): AdminAIInteractionRow => {
      const metadata = metadataObject(row.metadata);
      const responseText = typeof metadata.responseText === "string" ? metadata.responseText : null;
      const errorText = typeof metadata.error === "string" ? metadata.error : null;
      const requestId = typeof metadata.requestId === "string" ? metadata.requestId : null;
      const responseProvider = typeof metadata.responseProvider === "string" ? metadata.responseProvider : null;
      const responseModel = typeof metadata.responseModel === "string" ? metadata.responseModel : null;
      return {
        id: row.id,
        feature: row.feature,
        userId: row.userId,
        userLabel: row.user?.email ?? row.user?.name ?? row.userId,
        status: row.status,
        promptTokens: row.promptTokens,
        completionTokens: row.completionTokens,
        totalTokens: row.totalTokens,
        estimatedCostMicros: row.estimatedCostMicros,
        createdAt: row.createdAt,
        finishedAt: row.finishedAt,
        requestId,
        messages: messagesFromMetadata(metadata),
        responseText,
        errorText,
        responseProvider,
        responseModel,
        attempts: row.attempts.map((attempt) => ({
          provider: attempt.provider,
          model: attempt.model,
          status: attempt.status,
          errorCode: attempt.errorCode,
          latencyMs: attempt.latencyMs,
          totalTokens: attempt.totalTokens,
          estimatedCostMicros: attempt.estimatedCostMicros,
        })),
      };
    })
    .filter((row) => {
      if (!q) return true;
      return [
        row.feature,
        row.userLabel,
        row.requestId,
        row.responseText,
        ...row.messages.map((message) => JSON.stringify(message.content)),
      ].some((value) => typeof value === "string" && value.toLowerCase().includes(q));
    });
}
