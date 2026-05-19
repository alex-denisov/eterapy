export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAIControlCenterData } from "@/lib/ai-gateway/admin-config";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { AIControlCenter, type AIProvider } from "./ai-control-center";

type RawProvider = {
  provider: AIProvider;
  displayName: string;
  enabled: boolean;
  priority: number;
  baseUrl?: string | null;
  defaultModel?: string | null;
  timeoutMs: number;
  inputTokenCostMicros?: number | null;
  outputTokenCostMicros?: number | null;
};

type RawPolicy = {
  feature: string;
  enabled: boolean;
  providerOrder: AIProvider[];
  maxTokens?: number | null;
  temperature?: number | null;
  timeoutMs?: number | null;
  dailyTokenBudget?: number | null;
  perUserDailyTokenBudget?: number | null;
};

type RawCredential = {
  id: string;
  provider: AIProvider;
  label: string;
  apiKeyPreview: string;
  enabled: boolean;
  priority: number;
  baseUrlOverride: string | null;
  modelOverride: string | null;
  consecutiveFailures: number;
  cooldownUntil: Date | null;
  regionBlocked: boolean;
  lastUsedAt: Date | null;
  lastSuccessAt: Date | null;
  lastErrorAt: Date | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

type RawModel = {
  modelId: string;
  displayName?: string | null;
  isFree: boolean;
  contextWindow?: number | null;
  fetchedAt: Date;
};

export default async function AdminAIPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("ai.configure")) redirect("/admin");

  const data = await getAIControlCenterData();
  const rawProviders = data.providers as RawProvider[];
  const rawPolicies = data.policies as RawPolicy[];
  const rawCredentials = data.credentials as RawCredential[];
  const rawModels = data.models as Record<string, RawModel[]>;

  const providers = rawProviders.map((provider) => ({
    provider: provider.provider,
    displayName: provider.displayName,
    enabled: provider.enabled,
    priority: provider.priority,
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    timeoutMs: provider.timeoutMs,
    inputTokenCostMicros: provider.inputTokenCostMicros,
    outputTokenCostMicros: provider.outputTokenCostMicros,
  }));
  const policies = rawPolicies.map((policy) => ({
    feature: policy.feature,
    enabled: policy.enabled,
    providerOrder: policy.providerOrder,
    maxTokens: policy.maxTokens,
    temperature: policy.temperature,
    timeoutMs: policy.timeoutMs,
    dailyTokenBudget: policy.dailyTokenBudget,
    perUserDailyTokenBudget: policy.perUserDailyTokenBudget,
  }));
  const credentials = rawCredentials.map((credential) => ({
    id: credential.id,
    provider: credential.provider,
    label: credential.label,
    apiKeyPreview: credential.apiKeyPreview,
    enabled: credential.enabled,
    priority: credential.priority,
    baseUrlOverride: credential.baseUrlOverride,
    modelOverride: credential.modelOverride,
    consecutiveFailures: credential.consecutiveFailures,
    cooldownUntil: credential.cooldownUntil ? credential.cooldownUntil.toISOString() : null,
    regionBlocked: credential.regionBlocked,
    lastUsedAt: credential.lastUsedAt ? credential.lastUsedAt.toISOString() : null,
    lastSuccessAt: credential.lastSuccessAt ? credential.lastSuccessAt.toISOString() : null,
    lastErrorAt: credential.lastErrorAt ? credential.lastErrorAt.toISOString() : null,
    lastErrorCode: credential.lastErrorCode,
    lastErrorMessage: credential.lastErrorMessage,
  }));

  const models = Object.fromEntries(
    Object.entries(rawModels).map(([provider, list]) => [
      provider,
      list.map((model) => ({
        modelId: model.modelId,
        displayName: model.displayName ?? null,
        isFree: model.isFree,
        contextWindow: model.contextWindow ?? null,
        fetchedAt: model.fetchedAt.toISOString(),
      })),
    ]),
  );

  return (
    <PageContainer maxWidth="6xl">
      <div className="mb-6 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="soft-eyebrow">llm routing · cost control</p>
          <h1 className="soft-h1 mt-2">AI-центр управления</h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--soft-ink-soft)]">
            Маршрутизация free, paid, sensitive, speech и compliance-задач по тарифным слоям.
            Бесплатный вход удерживаем дешёвым, платные отчёты и риск-сценарии ведём через доверенные модели.
          </p>
        </div>
        <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-3 py-2 text-xs text-[var(--soft-ink-soft)]">
          Активных политик:{" "}
          <span className="font-medium text-[var(--soft-bordeaux)]">
            {policies.filter((policy) => policy.enabled).length}
          </span>
        </div>
      </div>
      <AIControlCenter
        providers={providers}
        policies={policies}
        usage={data.usage}
        credentials={credentials}
        models={models}
        encryptionConfigured={data.encryptionConfigured}
        cloudflareGateway={data.cloudflareGateway}
      />
    </PageContainer>
  );
}
