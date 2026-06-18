import type { AIProviderCredential } from "@prisma/client";
import { AIProvider } from "@prisma/client";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import { AIProviderError } from "@/lib/ai-gateway/adapters";
import {
  decryptSecret,
  encryptSecret,
  isAICredentialEncryptionConfigured,
} from "@/lib/ai-gateway/credentials-crypto";
import { buildAdapterForCredential, providerConfigToRouting } from "@/lib/ai-gateway/provider-runtime";
import { getYandexAIStudioEnv } from "@/lib/env";
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

const YANDEX_ENV_CREDENTIAL_ID = "env:yandex-ai-studio";

export interface CredentialPublicView {
  id: string;
  provider: AIProvider;
  label: string;
  apiKeyPreview: string;
  apiKey?: string;
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

export interface CredentialListOptions {
  includeSecrets?: boolean;
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

function tryDecryptSecret(stored: string): string | null {
  try {
    return decryptSecret(stored);
  } catch {
    return null;
  }
}

function rowToPublicView(row: AIProviderCredential, options: CredentialListOptions = {}): CredentialPublicView {
  const secret = options.includeSecrets ? tryDecryptSecret(row.encryptedKey) : null;
  return {
    id: row.id,
    provider: row.provider,
    label: row.label,
    apiKeyPreview: secret
      ? `${secret.slice(0, 6)}…${secret.slice(-4)}`
      : "stored secret",
    ...(secret ? { apiKey: secret } : {}),
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

export async function listCredentials(provider?: AIProvider, options: CredentialListOptions = {}): Promise<CredentialPublicView[]> {
  const rows = await db.aIProviderCredential.findMany({
    where: provider ? { provider } : undefined,
    orderBy: [{ provider: "asc" }, { priority: "asc" }, { label: "asc" }],
  });
  return rows.map((row) => rowToPublicView(row, options));
}

export async function getCredential(id: string, options: CredentialListOptions = {}): Promise<CredentialPublicView | null> {
  const row = await db.aIProviderCredential.findUnique({ where: { id } });
  return row ? rowToPublicView(row, options) : null;
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

/**
 * Map a raw provider failure message to a stable, human-meaningful code so the
 * admin/ai panel can tell apart a genuinely broken/invalid key from one that is
 * valid but simply out of credits (a billing action, not a key replacement).
 */
export function classifyHealthFailureCode(message: string | undefined, fallback: string): string {
  if (!message) return fallback;
  const text = message.toLowerCase();
  // Provider-account block (e.g. Groq "organization_restricted", suspended/banned
  // accounts). The key is valid but the provider refuses it — needs a NEW key
  // from an unrestricted account, not a billing top-up.
  if (/organization_restricted|organization has been restricted|account (is )?(restricted|suspended|banned|disabled)|\brestricted\b|suspended|banned|access denied|forbidden|\b403\b/.test(text)) {
    return "PROVIDER_RESTRICTED";
  }
  if (/credit balance|insufficient|out of (credits|quota)|too low|billing|payment required|\b402\b/.test(text)) {
    return "INSUFFICIENT_CREDITS";
  }
  if (/quota|rate limit|\b429\b/.test(text)) return "QUOTA_EXCEEDED";
  if (/invalid (api key|x-api-key|token)|unauthorized|\b401\b|authentication/.test(text)) return "INVALID_KEY";
  return fallback;
}

export async function checkCredentialHealth(actorId: string, id: string): Promise<{
  credential: CredentialPublicView;
  health: {
    status: "ok" | "missing_config" | "down";
    latencyMs?: number;
    message?: string;
    model?: string;
    code?: string;
  };
}> {
  const row = await db.aIProviderCredential.findUnique({ where: { id } });
  if (!row) throw new Error("Credential not found");

  const providerConfigRow = await db.aIProviderConfig.findUnique({ where: { provider: row.provider } });
  const providerConfig = providerConfigRow ? providerConfigToRouting(providerConfigRow) : null;
  const credential = rowToDecrypted(row);
  const adapter = buildAdapterForCredential(credential, providerConfig);
  const startedAt = Date.now();

  try {
    const health = await adapter.healthcheck(credential.modelOverride ?? providerConfig?.defaultModel ?? undefined);
    if (health.status === "ok") {
      await markCredentialSuccess({ credentialId: row.id });
    } else {
      await markCredentialFailure({
        credentialId: row.id,
        code: health.status === "missing_config"
          ? "MISSING_CONFIG"
          : classifyHealthFailureCode(health.message, "HEALTHCHECK_FAILED"),
        cooldownMs: 0,
        regionBlocked: false,
        message: health.message,
      });
    }

    await logAudit(actorId, "AI_CREDENTIAL_HEALTHCHECK", row.id, JSON.stringify({
      provider: row.provider,
      label: row.label,
      status: health.status,
      latencyMs: health.latencyMs,
    }));

    return {
      credential: await getCredential(row.id, { includeSecrets: true }) ?? rowToPublicView(row, { includeSecrets: true }),
      health: {
        status: health.status,
        latencyMs: health.latencyMs,
        message: health.message,
        model: health.model,
        code: health.status === "ok"
          ? undefined
          : health.status === "missing_config"
            ? "MISSING_CONFIG"
            : classifyHealthFailureCode(health.message, "HEALTHCHECK_FAILED"),
      },
    };
  } catch (error) {
    const providerError = error instanceof AIProviderError ? error : null;
    const rawMessage = error instanceof Error ? error.message : String(error);
    await markCredentialFailure({
      credentialId: row.id,
      code: providerError?.code ?? classifyHealthFailureCode(rawMessage, "HEALTHCHECK_FAILED"),
      cooldownMs: 0,
      regionBlocked: providerError?.code === "HTTP_403",
      message: rawMessage,
    });
    await logAudit(actorId, "AI_CREDENTIAL_HEALTHCHECK", row.id, JSON.stringify({
      provider: row.provider,
      label: row.label,
      status: "down",
      latencyMs: Date.now() - startedAt,
      code: providerError?.code ?? "HEALTHCHECK_FAILED",
    }));
    return {
      credential: await getCredential(row.id, { includeSecrets: true }) ?? rowToPublicView(row, { includeSecrets: true }),
      health: {
        status: "down",
        latencyMs: Date.now() - startedAt,
        message: rawMessage,
        code: providerError?.code ?? classifyHealthFailureCode(rawMessage, "HEALTHCHECK_FAILED"),
      },
    };
  }
}

interface PickCredentialInput {
  provider: AIProvider;
  excludeIds?: string[];
  now?: Date;
}

export async function listActiveCredentialsForProvider(input: { provider: AIProvider; now?: Date }): Promise<DecryptedAICredential[]> {
  const now = input.now ?? new Date();
  const envCredential = input.provider === AIProvider.YANDEX ? yandexEnvCredential() : null;

  if (!isAICredentialEncryptionConfigured()) return envCredential ? [envCredential] : [];

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

  const credentials = rows.map(rowToDecrypted);
  return envCredential ? [...credentials, envCredential] : credentials;
}

export async function pickCredentialForProvider(input: PickCredentialInput): Promise<DecryptedAICredential | null> {
  const now = input.now ?? new Date();
  const excludeIds = input.excludeIds ?? [];
  const envCredential = input.provider === AIProvider.YANDEX && !excludeIds.includes(YANDEX_ENV_CREDENTIAL_ID)
    ? yandexEnvCredential()
    : null;

  if (!isAICredentialEncryptionConfigured()) return envCredential;

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

  return rows[0] ? rowToDecrypted(rows[0]) : envCredential;
}

function yandexEnvCredential(): DecryptedAICredential | null {
  const env = getYandexAIStudioEnv();
  if (!env.apiKey || !env.folderId) return null;
  return {
    id: YANDEX_ENV_CREDENTIAL_ID,
    provider: AIProvider.YANDEX,
    label: "Yandex AI Studio ENV",
    apiKey: env.apiKey,
    baseUrlOverride: env.baseURL,
    modelOverride: null,
    enabled: true,
    priority: 1_000_000,
    consecutiveFailures: 0,
    cooldownUntil: null,
    regionBlocked: false,
  };
}

interface MarkSuccessInput {
  credentialId: string;
  now?: Date;
}

export async function markCredentialSuccess(input: MarkSuccessInput): Promise<void> {
  if (input.credentialId === YANDEX_ENV_CREDENTIAL_ID) return;
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
  if (input.credentialId === YANDEX_ENV_CREDENTIAL_ID) return;
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
