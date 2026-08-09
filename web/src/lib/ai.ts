import { AIAttemptStatus, AIProvider, AIRequestStatus } from "@prisma/client";
import db from "@/lib/db";
import {
  AIProviderError,
} from "@/lib/ai-gateway/adapters";
import {
  normalizeAIFeatureKey,
  type AIGatewayMessage,
} from "@/lib/ai-gateway/domain";
import {
  AIGatewayRoutingError,
  resolveAIRoutingPlan,
  runAIGatewayFallbackWithCredentials,
  type AICredentialAdapter,
  type AIRoutingPolicyConfig,
  type AIRoutingProviderConfig,
} from "@/lib/ai-gateway/routing";
import { getDefaultAIRoutingPolicy } from "@/lib/ai-gateway/task-policy";
import {
  enforceAIBudget,
  estimateAICostMicros,
  recordAIUsageLedger,
  resolveAIModelCostRate,
} from "@/lib/ai-gateway/usage";
import {
  listActiveCredentialsForProvider,
  markCredentialFailure,
  markCredentialSuccess,
  providerCooldownUntil,
  type DecryptedAICredential,
} from "@/lib/ai-gateway/credentials";
import { classifyCredentialFailure } from "@/lib/ai-gateway/cooldown";
import {
  applyAIPromptOverride,
  serializeAIMessagesForAdmin,
} from "@/lib/ai-gateway/prompts";
import {
  DEFAULT_PROVIDER_MODELS,
  buildAdapterForCredential,
  providerConfigToRouting,
  providerLabel,
} from "@/lib/ai-gateway/provider-runtime";
import {
  AIRoutingPolicyViolationError,
  attemptRoutingProof,
  combineRoutingProofs,
  enforceYandexOnlyRoutingProof,
} from "@/lib/ai-gateway/routing-proof";
import {
  CrossBorderPolicyError,
  assertCrossBorderProcessingAllowed,
} from "@/lib/ai-gateway/cross-border-gate";
import { log, serializeError } from "@/lib/logger";
import {
  MARKETING_FREE_PROVIDERS,
  isPublicMarketingAIFeature,
  marketingForeignLLMEnabled,
  marketingModelPreferences,
} from "@/lib/marketing/model-pool";

const DEFAULT_PROVIDER_CONFIGS: AIRoutingProviderConfig[] = [
  { provider: AIProvider.YANDEX, enabled: true, priority: 10, defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.YANDEX], timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.OPENROUTER, enabled: false, priority: 50, defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.OPENROUTER], timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.GEMINI, enabled: false, priority: 55, defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.GEMINI], timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.GROQ, enabled: false, priority: 58, defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.GROQ], timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.MISTRAL, enabled: false, priority: 59, defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.MISTRAL], timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.OPENAI, enabled: false, priority: 60, defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.OPENAI], timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.ANTHROPIC, enabled: false, priority: 70, defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.ANTHROPIC], timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.COHERE, enabled: false, priority: 75, defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.COHERE], timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.CEREBRAS, enabled: false, priority: 78, defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.CEREBRAS], timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
  { provider: AIProvider.FIREWORKS, enabled: false, priority: 80, defaultModel: DEFAULT_PROVIDER_MODELS[AIProvider.FIREWORKS], timeoutMs: 30_000, inputTokenCostMicros: null, outputTokenCostMicros: null },
];

interface AIRequestOptions {
  messages: AIGatewayMessage[];
  maxTokens?: number;
  temperature?: number;
  requestId?: string;
  feature?: string;
  userId?: string | null;
  /**
   * Restricted public-social route used only by the autonomous marketing
   * service. Internal ETerapy user data is excluded at the call site.
   */
  dataClass?: "PUBLIC_MARKETING";
  providerOrder?: AIProvider[];
}

interface AIResponse {
  text: string;
  model: string;
  provider: "openrouter" | "openai" | "anthropic" | "fireworks" | "gemini" | "groq" | "mistral" | "cerebras" | "cohere" | "yandex";
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  /**
   * B644 — почему модель перестала писать. Адаптеры возвращают это поле давно,
   * а `aiComplete` его терял, и обрыв по лимиту вывода (`MAX_TOKENS`, `length`)
   * доходил до вызывающего в виде «невалидный JSON». Разбор уходил проверять
   * ключи провайдеров там, где не хватало собственного бюджета вывода.
   *
   * Необязательное: не каждый провайдер сообщает причину остановки, и «поле не
   * пришло» — это не то же самое, что «ответ дописан».
   */
  finishReason?: string | null;
}

function adaptersForCredentials(
  credentials: DecryptedAICredential[],
  providerConfig?: AIRoutingProviderConfig | null,
  options?: { requireCloudflareAIGateway?: boolean },
): AICredentialAdapter[] {
  return credentials.map((credential) => ({
    credentialId: credential.id,
    credentialLabel: credential.label,
    adapter: buildAdapterForCredential(credential, providerConfig, options),
  }));
}


async function loadProviderConfigs(): Promise<AIRoutingProviderConfig[]> {
  const rows = await db.aIProviderConfig.findMany({ orderBy: [{ priority: "asc" }, { provider: "asc" }] });
  if (rows.length === 0) return DEFAULT_PROVIDER_CONFIGS;
  return rows.map(providerConfigToRouting);
}

async function loadPolicy(feature: string): Promise<AIRoutingPolicyConfig | null> {
  const row = await db.aIRoutingPolicy.findUnique({ where: { feature } });
  if (!row) return getDefaultAIRoutingPolicy(feature);
  return {
    feature: row.feature,
    enabled: row.enabled,
    providerOrder: row.providerOrder,
    modelPreferences: row.modelPreferences,
    maxTokens: row.maxTokens,
    temperature: row.temperature,
    timeoutMs: row.timeoutMs,
    dailyTokenBudget: row.dailyTokenBudget,
    perUserDailyTokenBudget: row.perUserDailyTokenBudget,
  };
}

async function budgetSnapshot(feature: string, userId?: string | null) {
  const [featureRow, userRow] = await Promise.all([
    db.aIBudgetLedger.findUnique({
      where: { scopeType_scopeKey_period: { scopeType: "feature", scopeKey: feature, period: new Date().toISOString().slice(0, 10) } },
    }),
    userId ? db.aIBudgetLedger.findUnique({
      where: { scopeType_scopeKey_period: { scopeType: "user", scopeKey: userId, period: new Date().toISOString().slice(0, 10) } },
    }) : null,
  ]);
  return {
    featureTokensToday: featureRow?.tokens ?? 0,
    userTokensToday: userRow?.tokens ?? 0,
  };
}

function attemptStatus(attempt: { status: "succeeded" | "failed" | "skipped"; code?: string }): AIAttemptStatus {
  if (attempt.status === "succeeded") return AIAttemptStatus.SUCCEEDED;
  if (attempt.status === "skipped") return AIAttemptStatus.SKIPPED;
  if (attempt.code === "TIMEOUT") return AIAttemptStatus.TIMEOUT;
  if (attempt.code === "HTTP_429") return AIAttemptStatus.RATE_LIMITED;
  return AIAttemptStatus.FAILED;
}

export async function aiComplete(options: AIRequestOptions): Promise<AIResponse> {
  const { messages, maxTokens = 2000, temperature = 0.7, requestId, userId } = options;
  const feature = normalizeAIFeatureKey(options.feature ?? "legacy.ai-complete");
  const publicMarketingRequest = (
    options.dataClass === "PUBLIC_MARKETING"
    && isPublicMarketingAIFeature(feature)
    && !userId
    && marketingForeignLLMEnabled()
  );
  if ((options.dataClass || options.providerOrder) && !publicMarketingRequest) {
    throw new AIRoutingPolicyViolationError(
      "Public marketing routing overrides are restricted to SMM writer/reviewer calls without internal ETerapy user data",
      "PUBLIC_MARKETING_ROUTE_FORBIDDEN",
    );
  }
  if (
    options.providerOrder?.some(
      (provider) => !(MARKETING_FREE_PROVIDERS as readonly AIProvider[]).includes(provider),
    )
  ) {
    throw new AIRoutingPolicyViolationError(
      "The SMM agent may use only providers from the free marketing pool",
      "MARKETING_PAID_PROVIDER_BLOCKED",
    );
  }
  const startedAt = new Date();
  const [storedProviderConfigs, storedPolicy] = await Promise.all([
    loadProviderConfigs(),
    loadPolicy(feature),
  ]);
  const providerConfigs = publicMarketingRequest
    ? MARKETING_FREE_PROVIDERS.map((provider) => ({
      ...(storedProviderConfigs.find((config) => config.provider === provider)
        ?? DEFAULT_PROVIDER_CONFIGS.find((config) => config.provider === provider)!),
      enabled: true,
    }))
    : storedProviderConfigs;
  const policy = publicMarketingRequest
    ? {
      ...storedPolicy,
      feature,
      enabled: storedPolicy?.enabled ?? true,
      providerOrder: options.providerOrder ?? [...MARKETING_FREE_PROVIDERS],
      modelPreferences: {
        ...(
          storedPolicy?.modelPreferences
          && typeof storedPolicy.modelPreferences === "object"
          && !Array.isArray(storedPolicy.modelPreferences)
            ? storedPolicy.modelPreferences
            : {}
        ),
        // Autonomous public marketing has a rolling freshness contract. An
        // old admin/database preference must not silently pin the worker to a
        // retired model after the approved pool advances.
        ...marketingModelPreferences(feature),
      },
    }
    : storedPolicy;
  const providerConfigByName = new Map(providerConfigs.map((config) => [config.provider, config]));
  const plan = resolveAIRoutingPlan({
    feature,
    providerConfigs,
    policy,
    allowForeignInYandexOnlyMode: publicMarketingRequest,
    // B687: список, названный вызывающим, — это ограничение. Единственный, кто
    // его называет, — SMM-агент, и называет он ровно одного провайдера за
    // проход: перебор ведёт он сам, чтобы отличить редактора от автора по
    // модели. Достроенный план отнимал у него именно эту возможность.
    restrictToProviderOrder: Boolean(options.providerOrder?.length),
  });
  const requestPlan = {
    ...plan,
    attempts: plan.attempts.map((attempt) => ({
      ...attempt,
      maxTokens: attempt.maxTokens ?? maxTokens,
      temperature: attempt.temperature ?? temperature,
    })),
  };
  if (!publicMarketingRequest) {
    enforceYandexOnlyRoutingProof({ plan: requestPlan, providerConfigsByName: providerConfigByName });
  }
  await assertCrossBorderProcessingAllowed({
    providers: requestPlan.attempts.map((attempt) => attempt.provider),
    scenario: feature,
    dataClass: publicMarketingRequest ? "PUBLIC_MARKETING" : null,
  });
  enforceAIBudget({
    requestedTokens: maxTokens,
    policy,
    snapshot: await budgetSnapshot(feature, userId),
  });
  const runtimeMessages = await applyAIPromptOverride(feature, messages);
  const adminMessages = serializeAIMessagesForAdmin(runtimeMessages);

  const aiRequest = await db.aIRequest.create({
    data: {
      feature,
      userId: userId ?? null,
      status: AIRequestStatus.RUNNING,
      metadata: {
        ...(requestId ? { requestId } : {}),
        ...(publicMarketingRequest ? {
          dataClass: "PUBLIC_MARKETING",
          egress: "CLOUDFLARE_AI_GATEWAY",
        } : {}),
        messages: adminMessages,
      },
      startedAt,
    },
  });

  try {
    const { response, attempts } = await runAIGatewayFallbackWithCredentials({
      plan: requestPlan,
      request: {
        requestId,
        messages: runtimeMessages,
      },
      resolveAdapters: async (provider) => {
        const providerConfig = providerConfigByName.get(provider) ?? null;
        return adaptersForCredentials(
          await listActiveCredentialsForProvider({ provider }),
          providerConfig,
          { requireCloudflareAIGateway: publicMarketingRequest },
        );
      },
      // B694: пустой список — это либо остывание после квоты, либо отсутствие
      // ключа. Спрашиваем только когда список пуст, поэтому лишнего запроса к
      // базе на успешном пути нет.
      resolveCooldown: async (provider) => providerCooldownUntil({ provider }),
    });
    const providerConfig = providerConfigs.find((config) => config.provider === response.provider);
    const costRate = await resolveAIModelCostRate({
      provider: response.provider,
      model: response.model,
      fallback: {
        inputTokenCostMicros: providerConfig?.inputTokenCostMicros,
        outputTokenCostMicros: providerConfig?.outputTokenCostMicros,
      },
    });
    const estimatedCostMicros = estimateAICostMicros({
      promptTokens: response.promptTokens,
      completionTokens: response.completionTokens,
    }, costRate);
    const attemptProofs = attempts.map((attempt) => ({
      attempt,
      proof: attemptRoutingProof({
        attempt,
        providerConfig: providerConfigByName.get(attempt.provider) ?? null,
        requireCloudflareAIGateway: publicMarketingRequest,
      }),
    }));
    const requestProof = combineRoutingProofs(attemptProofs.map(({ proof }) => proof));
    const fallbackUsed = attempts.some((attempt) => attempt.status !== "succeeded") || attempts.length > 1;
    const fallbackReason = attempts.find((attempt) => attempt.status !== "succeeded")?.code ?? null;

    await Promise.all([
      ...attemptProofs.map(({ attempt, proof }) => db.aIAttempt.create({
        data: {
          aiRequestId: aiRequest.id,
          provider: attempt.provider,
          model: attempt.model ?? "unknown",
          status: attemptStatus(attempt),
          providerGroup: proof.providerGroup,
          providerRegion: proof.providerRegion,
          cloudflareAIGatewayUsed: proof.cloudflareAIGatewayUsed,
          foreignLLMUsed: proof.foreignLLMUsed,
          crossBorderProcessing: proof.crossBorderProcessing,
          latencyMs: attempt.status === "succeeded" ? response.latencyMs : null,
          promptTokens: attempt.status === "succeeded" ? response.promptTokens : 0,
          completionTokens: attempt.status === "succeeded" ? response.completionTokens : 0,
          totalTokens: attempt.status === "succeeded" ? response.totalTokens : 0,
          estimatedCostMicros: attempt.status === "succeeded" ? estimatedCostMicros : 0,
          errorCode: attempt.code ?? null,
          finishedAt: new Date(),
        },
      })),
      db.aIRequest.update({
        where: { id: aiRequest.id },
        data: {
          status: AIRequestStatus.SUCCEEDED,
          providerGroup: requestProof.providerGroup,
          providerRegion: requestProof.providerRegion,
          cloudflareAIGatewayUsed: requestProof.cloudflareAIGatewayUsed,
          foreignLLMUsed: requestProof.foreignLLMUsed,
          crossBorderProcessing: requestProof.crossBorderProcessing,
          fallbackUsed,
          fallbackReason,
          promptTokens: response.promptTokens,
          completionTokens: response.completionTokens,
          totalTokens: response.totalTokens,
          estimatedCostMicros,
          metadata: {
            ...(requestId ? { requestId } : {}),
            ...(publicMarketingRequest ? {
              dataClass: "PUBLIC_MARKETING",
              egress: "CLOUDFLARE_AI_GATEWAY",
            } : {}),
            messages: adminMessages,
            responseText: response.text.slice(0, 30_000),
            responseProvider: response.provider,
            responseModel: response.model,
            attempts: attempts.map((attempt) => ({
              provider: attempt.provider,
              model: attempt.model ?? null,
              status: attempt.status,
              code: attempt.code ?? null,
              credentialId: attempt.credentialId ?? null,
              credentialLabel: attempt.credentialLabel ?? null,
            })),
          },
          finishedAt: new Date(),
        },
      }),
      recordAIUsageLedger({
        feature,
        userId,
        tokens: response.totalTokens,
        costMicros: estimatedCostMicros,
      }),
      ...attempts.flatMap((attempt) => {
        if (!attempt.credentialId) return [];
        if (attempt.status === "succeeded") {
          return [markCredentialSuccess({ credentialId: attempt.credentialId })];
        }
        if (attempt.status === "failed") {
          const classification = classifyCredentialFailure(attempt.code, {
            providerMessage: attempt.providerMessage,
          });
          return [markCredentialFailure({
            credentialId: attempt.credentialId,
            code: attempt.code ?? "PROVIDER_ERROR",
            cooldownMs: classification.cooldownMs,
            regionBlocked: classification.regionBlocked,
          })];
        }
        return [];
      }),
    ]);

    log.info("ai-gateway-request-succeeded", {
      requestId,
      feature,
      provider: response.provider,
      model: response.model,
      tokensIn: response.promptTokens,
      tokensOut: response.completionTokens,
      latencyMs: response.latencyMs,
      finishReason: response.finishReason ?? null,
    });

    return {
      text: response.text,
      model: response.model,
      provider: providerLabel(response.provider),
      tokensIn: response.promptTokens,
      tokensOut: response.completionTokens,
      latencyMs: response.latencyMs,
      finishReason: response.finishReason ?? null,
    };
  } catch (err) {
    const failedAttempts = err instanceof AIGatewayRoutingError ? err.attempts ?? [] : [];
    const failedAttemptProofs = failedAttempts.map((attempt) => ({
      attempt,
      proof: attemptRoutingProof({
        attempt,
        providerConfig: providerConfigByName.get(attempt.provider) ?? null,
        requireCloudflareAIGateway: publicMarketingRequest,
      }),
    }));
    const failedRequestProof = combineRoutingProofs(failedAttemptProofs.map(({ proof }) => proof));
    await db.aIRequest.update({
      where: { id: aiRequest.id },
      data: {
        status: AIRequestStatus.FAILED,
        providerGroup: failedRequestProof.providerGroup,
        providerRegion: failedRequestProof.providerRegion,
        cloudflareAIGatewayUsed: failedRequestProof.cloudflareAIGatewayUsed,
        foreignLLMUsed: failedRequestProof.foreignLLMUsed,
        crossBorderProcessing: failedRequestProof.crossBorderProcessing,
        fallbackUsed: failedAttempts.some((attempt) => attempt.status !== "succeeded") || failedAttempts.length > 1,
        fallbackReason: failedAttempts.find((attempt) => attempt.status !== "succeeded")?.code ?? null,
        metadata: {
          ...(requestId ? { requestId } : {}),
          ...(publicMarketingRequest ? {
            dataClass: "PUBLIC_MARKETING",
            egress: "CLOUDFLARE_AI_GATEWAY",
          } : {}),
          messages: adminMessages,
          error: err instanceof Error ? err.message : String(err),
          attempts: failedAttempts.map((attempt) => ({
            provider: attempt.provider,
            model: attempt.model ?? null,
            status: attempt.status,
            code: attempt.code ?? null,
            credentialId: attempt.credentialId ?? null,
            credentialLabel: attempt.credentialLabel ?? null,
          })),
        },
        finishedAt: new Date(),
      },
    }).catch(() => undefined);
    await Promise.all([
      ...failedAttemptProofs.map(({ attempt, proof }) => db.aIAttempt.create({
        data: {
          aiRequestId: aiRequest.id,
          provider: attempt.provider,
          model: attempt.model ?? "unknown",
          status: attemptStatus(attempt),
          providerGroup: proof.providerGroup,
          providerRegion: proof.providerRegion,
          cloudflareAIGatewayUsed: proof.cloudflareAIGatewayUsed,
          foreignLLMUsed: proof.foreignLLMUsed,
          crossBorderProcessing: proof.crossBorderProcessing,
          errorCode: attempt.code ?? null,
          finishedAt: new Date(),
        },
      })),
      ...failedAttempts.flatMap((attempt) => {
        if (!attempt.credentialId || attempt.status !== "failed") return [];
        const classification = classifyCredentialFailure(attempt.code, {
          providerMessage: attempt.providerMessage,
        });
        return [markCredentialFailure({
          credentialId: attempt.credentialId,
          code: attempt.code ?? "PROVIDER_ERROR",
          cooldownMs: classification.cooldownMs,
          regionBlocked: classification.regionBlocked,
        })];
      }),
    ]).catch((recordErr) => {
      log.warn("ai-gateway-failed-attempt-recording-failed", {
        requestId,
        feature,
        error: serializeError(recordErr),
      });
    });

    log.error("ai-gateway-request-failed", {
      requestId,
      feature,
      error: serializeError(err),
    });

    if (err instanceof AIProviderError) {
      throw new Error(`AI provider unavailable: ${err.code}`);
    }
    if (err instanceof AIRoutingPolicyViolationError) {
      throw err;
    }
    if (err instanceof CrossBorderPolicyError) {
      throw err;
    }
    throw err;
  }
}
