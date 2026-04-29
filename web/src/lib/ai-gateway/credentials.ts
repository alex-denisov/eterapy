import type { AIProviderCredential } from "@prisma/client";
import { AIProvider } from "@prisma/client";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  decryptSecret,
  encryptSecret,
  isAICredentialEncryptionConfigured,
} from "@/lib/ai-gateway/credentials-crypto";
import { log } from "@/lib/logger";

export interface DecryptedAICredential {
  id: string;
  provider: AIProvider;
  label: string;
  apiKey: string;
  baseUrlOverride: string | null;
  modelOverride: string | null;
  enabled: boolean;
  priority: number;
  consecutiveFailures: number;
  cooldownUntil: Date | null;
  regionBlocked: boolean;
}

export interface CredentialPublicView {
  id: string;
  provider: AIProvider;
  label: string;
  apiKeyPreview: string;
  baseUrlOverride: string | null;
  modelOverride: string | null;
  enabled: boolean;
  priority: number;
  consecutiveFailures: number;
  cooldownUntil: Date | null;
  regionBlocked: boolean;
  lastUsedAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCredentialInput {
  provider: AIProvider;
  label: string;
  apiKey: string;
  enabled?: boolean;
  priority?: number;
  baseUrlOverride?: string | null;
  modelOverride?: string | null;
}

export interface UpdateCredentialInput {
  label?: string;
  apiKey?: string;
  enabled?: boolean;
  priority?: number;
  baseUrlOverride?: string | null;
  modelOverride?: string | null;
  resetFailureState?: boolean;
}

function clampPriority(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 100;
  return Math.max(0, Math.min(1_000_000, Math.trunc(value)));
}

function trimOrNull(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function rowToPublicView(row: AIProviderCredential): CredentialPublicView {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    apiKeyPreview: "stored secret",
    baseUrlOverride: row.baseUrlOverride,
    modelOverride: row.modelOverride,
    enabled: row.enabled,
    priority: row.priority,
    consecutiveFailures: row.consecutiveFailures,
    cooldownUntil: row.cooldownUntil,
    regionBlocked: row.regionBlocked,
    lastUsedAt: row.lastUsedAt,
    lastSuccessAt: row.lastSuccessAt,
    lastErrorAt: row.lastErrorAt,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function rowToDecrypted(row: AIProviderCredential): DecryptedAICredential {
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    apiKey: decryptSecret(row.encryptedKey),
    baseUrlOverride: row.baseUrlOverride,
    modelOverride: row.modelOverride,
    enabled: row.enabled,
    priority: row.priority,
    consecutiveFailures: row.consecutiveFailures,
    cooldownUntil: row.cooldownUntil,
    regionBlocked: row.regionBlocked,
  };
}

export async function listCredentials(provider?: AIProvider): Promise<CredentialPublicView[]> {
  const rows = await db.aIProviderCredential.findMany({
    where: provider ? { provider } : undefined,
    orderBy: [{ provider: "asc" }, { priority: "asc" }, { label: "asc" }],
  });
  return rows.map(rowToPublicView);
}

export async function getCredential(id: string): Promise<CredentialPublicView | null> {
  const row = await db.aIProviderCredential.findUnique({ where: { id } });
  return row ? rowToPublicView(row) : null;
}

export async function createCredential(actorId: string, input: CreateCredentialInput): Promise<CredentialPublicView> {
  const label = input.label.trim();
  if (!label) throw new Error("Credential label is required");
  if (!input.apiKey?.trim()) throw new Error("Credential API key is required");

  const row = await db.aIProviderCredential.create({
    data: {
      provider: input.provider,
      label,
      encryptedKey: encryptSecret(input.apiKey.trim()),
      enabled: input.enabled ?? true,
      priority: clampPriority(input.priority),
      baseUrlOverride: trimOrNull(input.baseUrlOverride ?? null),
      modelOverride: trimOrNull(input.modelOverride ?? null),
    },
  });

  await logAudit(actorId, "AI_CREDENTIAL_CREATE", row.id, JSON.stringify({
    provider: row.provider,
    label: row.label,
    enabled: row.enabled,
    priority: row.priority,
  }));

  return rowToPublicView(row);
}

export async function updateCredential(actorId: string, id: string, input: UpdateCredentialInput): Promise<CredentialPublicView> {
  const data: Record<string, unknown> = {};
  if (typeof input.label === "string") {
    const trimmed = input.label.trim();
    if (!trimmed) throw new Error("Credential label cannot be empty");
    data.label = trimmed;
  }
  if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    data.encryptedKey = encryptSecret(input.apiKey.trim());
    data.consecutiveFailures = 0;
    data.cooldownUntil = null;
    data.regionBlocked = false;
    data.lastErrorCode = null;
    data.lastErrorMessage = null;
  }
  if (typeof input.enabled === "boolean") data.enabled = input.enabled;
  if (typeof input.priority === "number") data.priority = clampPriority(input.priority);
  if (input.baseUrlOverride !== undefined) data.baseUrlOverride = trimOrNull(input.baseUrlOverride);
  if (input.modelOverride !== undefined) data.modelOverride = trimOrNull(input.modelOverride);
  if (input.resetFailureState) {
    data.consecutiveFailures = 0;
    data.cooldownUntil = null;
    data.regionBlocked = false;
    data.lastErrorCode = null;
    data.lastErrorMessage = null;
  }

  const row = await db.aIProviderCredential.update({ where: { id }, data });

  await logAudit(actorId, "AI_CREDENTIAL_UPDATE", row.id, JSON.stringify({
    provider: row.provider,
    label: row.label,
    enabled: row.enabled,
    priority: row.priority,
    keyRotated: typeof input.apiKey === "string" && input.apiKey.trim().length > 0,
    failureStateReset: Boolean(input.resetFailureState),
  }));

  return rowToPublicView(row);
}

export async function deleteCredential(actorId: string, id: string): Promise<void> {
  const row = await db.aIProviderCredential.delete({ where: { id } });
  await logAudit(actorId, "AI_CREDENTIAL_DELETE", row.id, JSON.stringify({
    provider: row.provider,
    label: row.label,
  }));
}

interface PickCredentialInput {
  provider: AIProvider;
  excludeIds?: string[];
  now?: Date;
}

export async function listActiveCredentialsForProvider(input: { provider: AIProvider; now?: Date }): Promise<DecryptedAICredential[]> {
  const now = input.now ?? new Date();

  if (!isAICredentialEncryptionConfigured()) return [];

  const rows = await db.aIProviderCredential.findMany({
    where: {
      provider: input.provider,
      enabled: true,
      regionBlocked: false,
      OR: [{ cooldownUntil: null }, { cooldownUntil: { lt: now } }],
    },
    orderBy: [
      { priority: "asc" },
      { lastUsedAt: { sort: "asc", nulls: "first" } },
      { id: "asc" },
    ],
  });

  return rows.map(rowToDecrypted);
}

export async function pickCredentialForProvider(input: PickCredentialInput): Promise<DecryptedAICredential | null> {
  const now = input.now ?? new Date();
  const excludeIds = input.excludeIds ?? [];

  if (!isAICredentialEncryptionConfigured()) return null;

  const rows = await db.aIProviderCredential.findMany({
    where: {
      provider: input.provider,
      enabled: true,
      regionBlocked: false,
      AND: [
        excludeIds.length > 0 ? { id: { notIn: excludeIds } } : {},
        { OR: [{ cooldownUntil: null }, { cooldownUntil: { lt: now } }] },
      ],
    },
    orderBy: [
      { priority: "asc" },
      { lastUsedAt: { sort: "asc", nulls: "first" } },
      { id: "asc" },
    ],
    take: 1,
  });

  return rows[0] ? rowToDecrypted(rows[0]) : null;
}

interface MarkSuccessInput {
  credentialId: string;
  now?: Date;
}

export async function markCredentialSuccess(input: MarkSuccessInput): Promise<void> {
  const now = input.now ?? new Date();
  try {
    await db.aIProviderCredential.update({
      where: { id: input.credentialId },
      data: {
        lastUsedAt: now,
        lastSuccessAt: now,
        consecutiveFailures: 0,
        cooldownUntil: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        regionBlocked: false,
      },
    });
  } catch (err) {
    log.warn("ai-credential-success-update-failed", {
      credentialId: input.credentialId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

interface MarkFailureInput {
  credentialId: string;
  code: string;
  message?: string;
  cooldownMs?: number;
  regionBlocked?: boolean;
  now?: Date;
}

export async function markCredentialFailure(input: MarkFailureInput): Promise<void> {
  const now = input.now ?? new Date();
  const cooldownUntil = input.cooldownMs && input.cooldownMs > 0
    ? new Date(now.getTime() + input.cooldownMs)
    : undefined;

  try {
    await db.aIProviderCredential.update({
      where: { id: input.credentialId },
      data: {
        lastUsedAt: now,
        lastErrorAt: now,
        lastErrorCode: input.code,
        lastErrorMessage: input.message?.slice(0, 500) ?? null,
        consecutiveFailures: { increment: 1 },
        ...(cooldownUntil ? { cooldownUntil } : {}),
        ...(input.regionBlocked ? { regionBlocked: true } : {}),
      },
    });
  } catch (err) {
    log.warn("ai-credential-failure-update-failed", {
      credentialId: input.credentialId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
