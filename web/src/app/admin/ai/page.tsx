export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { getAIControlCenterData } from "@/lib/ai-gateway/admin-config";
import { getUserPermissions } from "@/lib/moderator-permissions";
import { PageContainer } from "@/components/ui/page-container";
import { AIControlCenter } from "./ai-control-center";

export default async function AdminAIPage() {
  const session = await auth();
  const role = session?.user?.role ?? "";
  if (!session?.user?.id || !["ADMIN", "SUPERADMIN"].includes(role)) redirect("/admin");

  const permissions = await getUserPermissions(session.user.id, role);
  if (!permissions.includes("ai.configure")) redirect("/admin");

  const data = await getAIControlCenterData();
  const providers = data.providers.map((provider) => ({
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
  const policies = data.policies.map((policy) => ({
    feature: policy.feature,
    enabled: policy.enabled,
    providerOrder: policy.providerOrder,
    maxTokens: policy.maxTokens,
    temperature: policy.temperature,
    timeoutMs: policy.timeoutMs,
    dailyTokenBudget: policy.dailyTokenBudget,
    perUserDailyTokenBudget: policy.perUserDailyTokenBudget,
  }));
  const credentials = data.credentials.map((credential) => ({
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
    Object.entries(data.models).map(([provider, list]) => [
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
      <div className="mb-6">
        <h1 className="font-heading text-2xl font-bold">AI Control Center</h1>
        <p className="mt-1 text-sm text-muted-foreground">Провайдеры, ключи, модели, fallback routing, token budgets и usage-контроль v5</p>
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
