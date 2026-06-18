import { AIProvider, AIRequestStatus, Prisma } from "@prisma/client";
import db from "@/lib/db";

const MAX_LIMIT = 1000;

export interface AIRoutingAuditFilters {
  from?: Date;
  to?: Date;
  feature?: string | null;
  provider?: AIProvider | null;
  status?: AIRequestStatus | null;
  foreignLLMUsed?: boolean | null;
  cloudflareAIGatewayUsed?: boolean | null;
  crossBorderProcessing?: boolean | null;
  limit?: number;
}

export interface AIRoutingAuditRow {
  id: string;
  requestId: string | null;
  userId: string | null;
  feature: string;
  status: AIRequestStatus;
  providerGroup: string | null;
  providerRegion: string | null;
  cloudflareAIGatewayUsed: boolean;
  foreignLLMUsed: boolean;
  crossBorderProcessing: boolean;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  billingEventId: string | null;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  attempts: Array<{
    provider: AIProvider;
    model: string;
    status: string;
    providerGroup: string | null;
    providerRegion: string | null;
    cloudflareAIGatewayUsed: boolean;
    foreignLLMUsed: boolean;
    crossBorderProcessing: boolean;
    errorCode: string | null;
    startedAt: Date;
    finishedAt: Date | null;
  }>;
}

function metadataObject(value: Prisma.JsonValue | null | undefined) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

export async function listAIRoutingAuditLogs(input: AIRoutingAuditFilters = {}) {
  const limit = Math.min(Math.max(input.limit ?? 200, 1), MAX_LIMIT);
  const where: Prisma.AIRequestWhereInput = {
    ...(input.from || input.to ? {
      createdAt: {
        ...(input.from ? { gte: input.from } : {}),
        ...(input.to ? { lt: input.to } : {}),
      },
    } : {}),
    ...(input.feature ? { feature: input.feature } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.foreignLLMUsed === null || input.foreignLLMUsed === undefined ? {} : { foreignLLMUsed: input.foreignLLMUsed }),
    ...(input.cloudflareAIGatewayUsed === null || input.cloudflareAIGatewayUsed === undefined ? {} : { cloudflareAIGatewayUsed: input.cloudflareAIGatewayUsed }),
    ...(input.crossBorderProcessing === null || input.crossBorderProcessing === undefined ? {} : { crossBorderProcessing: input.crossBorderProcessing }),
    ...(input.provider ? { attempts: { some: { provider: input.provider } } } : {}),
  };

  const [total, foreignCount, cloudflareCount, crossBorderCount, rows] = await Promise.all([
    db.aIRequest.count({ where }),
    db.aIRequest.count({ where: { ...where, foreignLLMUsed: true } }),
    db.aIRequest.count({ where: { ...where, cloudflareAIGatewayUsed: true } }),
    db.aIRequest.count({ where: { ...where, crossBorderProcessing: true } }),
    db.aIRequest.findMany({
      where,
      include: { attempts: { orderBy: { startedAt: "asc" } } },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
  ]);

  const auditRows: AIRoutingAuditRow[] = rows.map((row) => {
    const metadata = metadataObject(row.metadata);
    return {
      id: row.id,
      requestId: typeof metadata.requestId === "string" ? metadata.requestId : null,
      userId: row.userId,
      feature: row.feature,
      status: row.status,
      providerGroup: row.providerGroup,
      providerRegion: row.providerRegion,
      cloudflareAIGatewayUsed: row.cloudflareAIGatewayUsed,
      foreignLLMUsed: row.foreignLLMUsed,
      crossBorderProcessing: row.crossBorderProcessing,
      fallbackUsed: row.fallbackUsed,
      fallbackReason: row.fallbackReason,
      billingEventId: row.billingEventId,
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      attempts: row.attempts.map((attempt) => ({
        provider: attempt.provider,
        model: attempt.model,
        status: attempt.status,
        providerGroup: attempt.providerGroup,
        providerRegion: attempt.providerRegion,
        cloudflareAIGatewayUsed: attempt.cloudflareAIGatewayUsed,
        foreignLLMUsed: attempt.foreignLLMUsed,
        crossBorderProcessing: attempt.crossBorderProcessing,
        errorCode: attempt.errorCode,
        startedAt: attempt.startedAt,
        finishedAt: attempt.finishedAt,
      })),
    };
  });

  return {
    summary: {
      total,
      foreignLLMUsed: foreignCount,
      cloudflareAIGatewayUsed: cloudflareCount,
      crossBorderProcessing: crossBorderCount,
      yandexOnlyShare: total > 0 ? (total - crossBorderCount) / total : 1,
    },
    rows: auditRows,
  };
}
