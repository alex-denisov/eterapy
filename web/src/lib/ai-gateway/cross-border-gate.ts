import { AIProvider, ForeignProviderRegistryStatus, ManagementSpecialOrderStatus } from "@prisma/client";
import db from "@/lib/db";
import { logAudit } from "@/lib/audit";
import {
  crossBorderProcessingEnabled,
  getLLMProviderMode,
  legalCrossBorderReady,
  managementSpecialOrderId,
} from "@/lib/env";
import { getUserPermissions } from "@/lib/moderator-permissions";

export const LEGAL_CROSS_BORDER_PERMISSION = "legal.cross_border.manage" as const;

export const FOREIGN_AI_PROVIDERS = [
  AIProvider.OPENAI,
  AIProvider.ANTHROPIC,
  AIProvider.FIREWORKS,
  AIProvider.OPENROUTER,
  AIProvider.GEMINI,
  AIProvider.GROQ,
  AIProvider.MISTRAL,
  AIProvider.CEREBRAS,
  AIProvider.COHERE,
] as const;

export type CrossBorderPolicyErrorCode =
  | "CROSS_BORDER_FLAGS_DISABLED"
  | "NO_ACTIVE_SPECIAL_ORDER"
  | "FOREIGN_PROVIDER_REGISTRY_INACTIVE"
  | "LEGAL_CROSS_BORDER_FORBIDDEN";

export class CrossBorderPolicyError extends Error {
  code: CrossBorderPolicyErrorCode;

  constructor(code: CrossBorderPolicyErrorCode, message: string) {
    super(message);
    this.name = "CrossBorderPolicyError";
    this.code = code;
  }
}

export function isForeignAIProvider(provider: AIProvider) {
  return (FOREIGN_AI_PROVIDERS as readonly AIProvider[]).includes(provider);
}

export function foreignProvidersIn(providers: AIProvider[]) {
  return Array.from(new Set(providers.filter(isForeignAIProvider)));
}

export function buildActiveSpecialOrderWhere(params: {
  providers: AIProvider[];
  scenario?: string | null;
  now?: Date;
}) {
  const now = params.now ?? new Date();
  const configuredOrderId = managementSpecialOrderId();
  return {
    ...(configuredOrderId ? { id: configuredOrderId } : {}),
    status: ManagementSpecialOrderStatus.ACTIVE,
    validFrom: { lte: now },
    validTo: { gt: now },
    allowedProviders: { hasEvery: params.providers },
    ...(params.scenario
      ? {
        OR: [
          { allowedScenarios: { isEmpty: true } },
          { allowedScenarios: { has: params.scenario } },
        ],
      }
      : {}),
  };
}

async function assertForeignProviderRegistryActive(providers: AIProvider[]) {
  const rows = await db.foreignProviderRegistry.findMany({
    where: {
      providerNameInternal: { in: providers },
      status: ForeignProviderRegistryStatus.ACTIVE,
    },
    select: { providerNameInternal: true },
  });
  const activeProviders = new Set(rows.map((row) => row.providerNameInternal));
  const inactive = providers.filter((provider) => !activeProviders.has(provider));
  if (inactive.length > 0) {
    throw new CrossBorderPolicyError(
      "FOREIGN_PROVIDER_REGISTRY_INACTIVE",
      `Foreign AI provider registry is inactive for RU: ${inactive.join(", ")}`,
    );
  }
}

export async function assertCrossBorderProcessingAllowed(params: {
  providers: AIProvider[];
  scenario?: string | null;
}) {
  const foreignProviders = foreignProvidersIn(params.providers);
  if (foreignProviders.length === 0) return;

  if (
    getLLMProviderMode() !== "LEGACY"
    || process.env.FOREIGN_LLM_ENABLED !== "true"
    || !crossBorderProcessingEnabled()
    || !legalCrossBorderReady()
  ) {
    throw new CrossBorderPolicyError(
      "CROSS_BORDER_FLAGS_DISABLED",
      "Cross-border AI processing is disabled for the RU contour",
    );
  }

  await assertForeignProviderRegistryActive(foreignProviders);

  const order = await db.managementSpecialOrder.findFirst({
    where: buildActiveSpecialOrderWhere({
      providers: foreignProviders,
      scenario: params.scenario,
    }),
    select: { id: true },
  });

  if (!order) {
    throw new CrossBorderPolicyError(
      "NO_ACTIVE_SPECIAL_ORDER",
      "No active management special order allows this cross-border AI scenario",
    );
  }
}

export async function requireLegalCrossBorderManager(actorId: string) {
  const actor = await db.user.findUnique({
    where: { id: actorId },
    select: { id: true, role: true },
  });
  if (!actor || actor.role !== "SUPERADMIN") {
    throw new CrossBorderPolicyError(
      "LEGAL_CROSS_BORDER_FORBIDDEN",
      "Only legal superadmins may manage cross-border AI processing",
    );
  }

  const permissions = await getUserPermissions(actor.id, actor.role);
  if (!permissions.includes(LEGAL_CROSS_BORDER_PERMISSION)) {
    throw new CrossBorderPolicyError(
      "LEGAL_CROSS_BORDER_FORBIDDEN",
      "Missing legal cross-border management permission",
    );
  }
}

export async function assertForeignProviderAdminChangeAllowed(
  actorId: string,
  input: { provider: AIProvider; enabled: boolean },
) {
  if (!input.enabled || !isForeignAIProvider(input.provider)) return;

  try {
    await requireLegalCrossBorderManager(actorId);
    await assertCrossBorderProcessingAllowed({
      providers: [input.provider],
      scenario: "admin-ai-provider-enable",
    });
  } catch (err) {
    if (err instanceof CrossBorderPolicyError) {
      await logAudit(actorId, "CROSS_BORDER_PROVIDER_ENABLE_DENIED", input.provider, JSON.stringify({
        provider: input.provider,
        code: err.code,
      })).catch(() => undefined);
    }
    throw err;
  }
}
