"use client";

import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  DollarSign,
  KeyRound,
  MessageSquareText,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AIProvider = {
  OPENAI: "OPENAI",
  ANTHROPIC: "ANTHROPIC",
  FIREWORKS: "FIREWORKS",
  OPENROUTER: "OPENROUTER",
  GEMINI: "GEMINI",
} as const;

export type AIProvider = (typeof AIProvider)[keyof typeof AIProvider];

type ProviderRow = {
  provider: AIProvider;
  displayName: string;
  enabled: boolean;
  priority: number;
  baseUrl?: string | null;
  defaultModel?: string | null;
  timeoutMs: number;
  inputTokenCostMicros?: number | null;
  outputTokenCostMicros?: number | null;
  cloudflareGatewayEnabled?: boolean;
};

type PolicyRow = {
  feature: string;
  enabled: boolean;
  providerOrder: AIProvider[];
  tier?: string;
  title?: string;
  purpose?: string;
  fallbackNotes?: string;
  source?: "default" | "database";
  maxTokens?: number | null;
  temperature?: number | null;
  timeoutMs?: number | null;
  dailyTokenBudget?: number | null;
  perUserDailyTokenBudget?: number | null;
};

type UsageRow = {
  scopeType: string;
  scopeKey: string;
  tokens: number;
  costMicros: number;
  requestCount: number;
};

type UsageDetailRow = {
  feature: string;
  provider: string;
  model: string;
  status: string;
  requestCount: number;
  attemptCount: number;
  successCount: number;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costMicros: number;
  avgLatencyMs: number | null;
};

type CredentialRow = {
  id: string;
  provider: AIProvider;
  label: string;
  apiKeyPreview: string;
  apiKey?: string;
  enabled: boolean;
  priority: number;
  baseUrlOverride: string | null;
  modelOverride: string | null;
  consecutiveFailures: number;
  cooldownUntil: string | null;
  regionBlocked: boolean;
  lastUsedAt: string | null;
  lastSuccessAt: string | null;
  lastErrorAt: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
};

type ModelRow = {
  modelId: string;
  displayName: string | null;
  isFree: boolean;
  contextWindow: number | null;
  fetchedAt: string;
  metadata?: unknown;
};

type PromptRow = {
  id: string;
  feature: string;
  title: string;
  productKey: string | null;
  promptText: string;
  enabled: boolean;
  source: "default" | "database";
  updatedAt: string | null;
};

type InteractionAttempt = {
  provider: AIProvider;
  model: string;
  status: string;
  errorCode: string | null;
  latencyMs: number | null;
  totalTokens: number;
  estimatedCostMicros: number;
};

type InteractionRow = {
  id: string;
  feature: string;
  userId: string | null;
  userLabel: string | null;
  status: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  estimatedCostMicros: number;
  createdAt: string;
  finishedAt: string | null;
  requestId: string | null;
  messages: Array<{ role: string; content: unknown }>;
  responseText: string | null;
  responseProvider: string | null;
  responseModel: string | null;
  attempts: InteractionAttempt[];
};

type ModelsByProvider = Partial<Record<AIProvider, ModelRow[]>>;

type CloudflareGatewayState =
  | {
    configured: true;
    accountId: string;
    gatewayId: string;
    hasToken: boolean;
    openaiUrl: string;
    providerUrls?: Partial<Record<AIProvider, string | null>>;
  }
  | { configured: false };

const PROVIDERS = Object.values(AIProvider);

function toNumber(value: FormDataEntryValue | null) {
  if (!value || String(value).trim() === "") return null;
  return Number(value);
}

function formatDate(value?: string | null) {
  if (!value) return "не проверялся";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "не проверялся";
  return date.toLocaleString("ru-RU");
}

function formatTokens(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function usdFromMicros(value: number) {
  return value / 1_000_000;
}

function formatUsdMicros(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 10_000 ? 4 : 2,
  }).format(usdFromMicros(value));
}

function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "SUCCEEDED" || normalized === "OK") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  if (normalized === "FAILED" || normalized === "TIMEOUT" || normalized === "RATE_LIMITED" || normalized === "DOWN") {
    return "border-red-500/30 bg-red-500/10 text-red-700";
  }
  if (normalized === "SKIPPED" || normalized === "RUNNING") return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  return "border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]";
}

function keyState(credential: CredentialRow) {
  if (!credential.enabled) return { label: "выключен", tone: "border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]" };
  if (credential.regionBlocked) return { label: "region error", tone: statusTone("failed") };
  const successAt = credential.lastSuccessAt ? Date.parse(credential.lastSuccessAt) : 0;
  const errorAt = credential.lastErrorAt ? Date.parse(credential.lastErrorAt) : 0;
  if (errorAt > successAt) return { label: "ошибка", tone: statusTone("failed") };
  if (successAt > 0) return { label: "активен", tone: statusTone("ok") };
  return { label: "не проверялся", tone: statusTone("unknown") };
}

function modelPricingLabel(model: ModelRow) {
  const metadata = model.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const pricing = (metadata as Record<string, unknown>).pricing;
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) return null;
  const prompt = Number((pricing as Record<string, unknown>).prompt);
  const completion = Number((pricing as Record<string, unknown>).completion);
  if (!Number.isFinite(prompt) || !Number.isFinite(completion)) return null;
  return `$${prompt}/$${completion} per token`;
}

function renderAuditContent(content: unknown) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item, index) => {
      if (item && typeof item === "object" && (item as { type?: unknown }).type === "image_url") {
        return `[image ${index + 1}: ${(item as { preview?: string }).preview ?? "attached"}]`;
      }
      return JSON.stringify(item);
    }).join("\n");
  }
  return JSON.stringify(content, null, 2);
}

async function patchAIControl(payload: unknown) {
  const response = await fetch("/api/admin/ai/control", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.message ?? body?.error ?? "AI config update failed");
  }
}

function CheckboxSwitch({ name, defaultChecked, label }: { name: string; defaultChecked?: boolean; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} aria-label={label} className="peer sr-only" />
      <span className="relative inline-flex h-5 w-10 shrink-0 rounded-full bg-[var(--soft-paper-edge)] transition-colors after:absolute after:left-1 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-[var(--soft-bordeaux)] peer-checked:after:translate-x-5" />
      <span>{label}</span>
    </label>
  );
}

function SoftBadge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4">
      <div className="flex items-center gap-2 text-[var(--soft-ink-soft)]">
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span className="text-xs uppercase tracking-[0.12em]">{label}</span>
      </div>
      <p className="mt-3 text-2xl font-semibold text-[var(--soft-ink)]">{value}</p>
      <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">{hint}</p>
    </div>
  );
}

function ModelSelect({
  value,
  models,
  onChange,
  placeholder,
}: {
  value: string;
  models: ModelRow[];
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const knownIds = new Set(models.map((model) => model.modelId));
  const showCustom = value.trim().length > 0 && !knownIds.has(value.trim());
  return (
    <select
      value={showCustom ? "__custom__" : value}
      onChange={(event) => {
        const next = event.target.value;
        if (next === "__custom__") return;
        onChange(next === "__none__" ? "" : next);
      }}
      className="flex h-9 w-full rounded-md border border-[var(--soft-paper-edge)] bg-white/70 px-3 text-sm text-[var(--soft-ink)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--soft-bordeaux)]"
    >
      <option value="__none__">{placeholder ?? "Модель по умолчанию"}</option>
      {models.length === 0 && <option value="" disabled>Список моделей пуст - обновите каталог</option>}
      {models.slice(0, 250).map((model) => (
        <option key={model.modelId} value={model.modelId}>
          {model.isFree ? "Free · " : ""}
          {model.modelId}
          {model.displayName ? ` - ${model.displayName}` : ""}
          {modelPricingLabel(model) ? ` · ${modelPricingLabel(model)}` : ""}
        </option>
      ))}
      {showCustom && <option value="__custom__">{value} (текущее, нет в каталоге)</option>}
    </select>
  );
}

function CredentialRowEditor({
  credential,
  models,
  onUpdate,
  onDelete,
  onCheck,
  disabled,
  canViewSecrets,
}: {
  credential: CredentialRow;
  models: ModelRow[];
  onUpdate: (payload: Record<string, unknown>, msg: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onCheck: () => Promise<void> | void;
  disabled: boolean;
  canViewSecrets: boolean;
}) {
  const originalKey = credential.apiKey ?? "";
  const [draft, setDraft] = useState({
    label: credential.label,
    apiKey: originalKey,
    priority: credential.priority,
    modelOverride: credential.modelOverride ?? "",
    baseUrlOverride: credential.baseUrlOverride ?? "",
  });
  const state = keyState(credential);

  return (
    <div className="space-y-3 px-3 py-3" data-testid={`ai-credential-${credential.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-medium text-[var(--soft-ink)]">{credential.label}</p>
            <SoftBadge className={state.tone}>{state.label}</SoftBadge>
            {credential.consecutiveFailures > 0 && <SoftBadge className={statusTone("failed")}>{credential.consecutiveFailures} ошибок подряд</SoftBadge>}
          </div>
          <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">
            успех: {formatDate(credential.lastSuccessAt)} · ошибка: {formatDate(credential.lastErrorAt)}
            {credential.lastErrorCode ? ` · ${credential.lastErrorCode}` : ""}
          </p>
          {credential.lastErrorMessage && (
            <p className="mt-1 line-clamp-2 text-xs text-red-700">{credential.lastErrorMessage}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onCheck()} title="Проверить ключ">
            <Activity className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Проверить
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onUpdate({ enabled: !credential.enabled }, credential.enabled ? "Ключ выключен" : "Ключ включён")}
          >
            {credential.enabled ? "Выключить" : "Включить"}
          </Button>
          {(credential.regionBlocked || credential.consecutiveFailures > 0) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onUpdate({ resetFailureState: true }, "Состояние ошибок сброшено")}
            >
              Сброс
            </Button>
          )}
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onDelete()}>
            Удалить
          </Button>
        </div>
      </div>
      <div className="grid gap-2 lg:grid-cols-[1fr_1.4fr_1.2fr_1.2fr_0.7fr_auto]">
        <Input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} placeholder="Метка" />
        <Input
          value={draft.apiKey}
          onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
          placeholder={canViewSecrets ? credential.apiKeyPreview : `${credential.apiKeyPreview} - введите новый ключ`}
          type={canViewSecrets ? "text" : "password"}
          spellCheck={false}
          autoComplete="off"
          className="font-mono"
        />
        <ModelSelect
          value={draft.modelOverride}
          models={models}
          onChange={(value) => setDraft({ ...draft, modelOverride: value })}
          placeholder="Override модели"
        />
        <Input value={draft.baseUrlOverride} onChange={(event) => setDraft({ ...draft, baseUrlOverride: event.target.value })} placeholder="Base URL override" />
        <Input
          value={draft.priority}
          type="number"
          onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })}
          placeholder="Priority"
        />
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => {
            const payload: Record<string, unknown> = {
              label: draft.label,
              priority: draft.priority,
              modelOverride: draft.modelOverride || null,
              baseUrlOverride: draft.baseUrlOverride || null,
            };
            const nextKey = draft.apiKey.trim();
            if (nextKey && nextKey !== originalKey) payload.apiKey = nextKey;
            void onUpdate(payload, `Ключ ${draft.label} сохранён`);
          }}
        >
          <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Сохранить
        </Button>
      </div>
    </div>
  );
}

export function AIControlCenter({
  providers,
  policies,
  usage,
  usageDetails,
  credentials,
  models,
  prompts,
  interactions,
  encryptionConfigured,
  cloudflareGateway,
  canViewSecrets,
}: {
  providers: ProviderRow[];
  policies: PolicyRow[];
  usage: UsageRow[];
  usageDetails: UsageDetailRow[];
  credentials: CredentialRow[];
  models: ModelsByProvider;
  prompts: PromptRow[];
  interactions: InteractionRow[];
  encryptionConfigured: boolean;
  cloudflareGateway: CloudflareGatewayState;
  canViewSecrets: boolean;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<AIProvider | null>(null);
  const [checkingCredentialId, setCheckingCredentialId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const totals = useMemo(() => {
    const global = usage.find((row) => row.scopeType === "global" && row.scopeKey === "all");
    const activeKeys = credentials.filter((credential) => credential.enabled && keyState(credential).label === "активен").length;
    const failedKeys = credentials.filter((credential) => keyState(credential).label === "ошибка" || credential.regionBlocked).length;
    const llmErrors = usageDetails.filter((row) => row.status !== "SUCCEEDED" && row.status !== "RUNNING").reduce((sum, row) => sum + row.attemptCount, 0);
    return {
      tokens: global?.tokens ?? usageDetails.reduce((sum, row) => sum + row.totalTokens, 0),
      costMicros: global?.costMicros ?? usageDetails.reduce((sum, row) => sum + row.costMicros, 0),
      requests: global?.requestCount ?? usageDetails.reduce((sum, row) => sum + row.requestCount, 0),
      activeKeys,
      failedKeys,
      llmErrors,
    };
  }, [credentials, usage, usageDetails]);

  const featureErrors = useMemo(() => usageDetails
    .filter((row) => row.status !== "SUCCEEDED" && row.status !== "RUNNING")
    .reduce<Record<string, number>>((acc, row) => {
      acc[row.feature] = (acc[row.feature] ?? 0) + row.attemptCount;
      return acc;
    }, {}), [usageDetails]);

  function reportSuccess(text: string) {
    setMessage(text);
    setErrorMessage(null);
    router.refresh();
  }

  function reportError(text: string) {
    setMessage(null);
    setErrorMessage(text);
  }

  async function refreshProviderModels(provider: AIProvider) {
    setRefreshing(provider);
    setMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/admin/ai/models?provider=${provider}`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        reportError(body?.error ?? body?.message ?? `Не удалось обновить список моделей ${provider}`);
        return;
      }
      reportSuccess(`Каталог моделей ${provider} обновлён: ${body.count} (удалено ${body.removed})`);
    } catch (err) {
      reportError(err instanceof Error ? err.message : "Не удалось обновить список моделей");
    } finally {
      setRefreshing(null);
    }
  }

  async function createCredential(formData: FormData) {
    const provider = String(formData.get("provider") ?? "") as AIProvider;
    const label = String(formData.get("label") ?? "").trim();
    const apiKey = String(formData.get("apiKey") ?? "").trim();
    const baseUrlOverride = String(formData.get("baseUrlOverride") ?? "").trim() || null;
    const modelOverride = String(formData.get("modelOverride") ?? "").trim() || null;
    const priority = toNumber(formData.get("priority")) ?? undefined;
    if (!label || !apiKey) {
      reportError("Укажите метку и API-ключ");
      return;
    }
    const response = await fetch("/api/admin/ai/credentials", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, label, apiKey, priority, baseUrlOverride, modelOverride, enabled: true }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      reportError(body?.message ?? "Не удалось создать ключ");
      return;
    }
    reportSuccess(`Ключ ${label} добавлен`);
  }

  async function patchCredential(id: string, payload: Record<string, unknown>, successMessage: string) {
    const response = await fetch(`/api/admin/ai/credentials/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      reportError(body?.message ?? "Не удалось обновить ключ");
      return;
    }
    reportSuccess(successMessage);
  }

  async function checkCredentialById(id: string, label: string) {
    setCheckingCredentialId(id);
    try {
      const response = await fetch(`/api/admin/ai/credentials/${id}/check`, { method: "POST" });
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        reportError(body?.message ?? "Не удалось проверить ключ");
        return;
      }
      reportSuccess(`Проверка ${label}: ${body.health?.status ?? "unknown"}${body.health?.latencyMs ? `, ${body.health.latencyMs} ms` : ""}`);
    } finally {
      setCheckingCredentialId(null);
    }
  }

  async function deleteCredentialById(id: string, label: string) {
    if (typeof window !== "undefined" && !window.confirm(`Удалить ключ ${label}?`)) return;
    const response = await fetch(`/api/admin/ai/credentials/${id}`, { method: "DELETE" });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      reportError(body?.message ?? "Не удалось удалить ключ");
      return;
    }
    reportSuccess(`Ключ ${label} удалён`);
  }

  async function savePrompt(formData: FormData) {
    const payload = {
      feature: String(formData.get("feature") ?? ""),
      title: String(formData.get("title") ?? ""),
      productKey: String(formData.get("productKey") ?? "") || null,
      promptText: String(formData.get("promptText") ?? ""),
      enabled: formData.get("enabled") === "on",
    };
    const response = await fetch("/api/admin/ai/prompts", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      reportError(body?.message ?? "Не удалось сохранить промт");
      return;
    }
    reportSuccess(`Промт ${payload.feature} сохранён`);
  }

  function submitProvider(formData: FormData) {
    startTransition(() => {
      setMessage(null);
      void patchAIControl({
        type: "provider",
        provider: formData.get("provider"),
        enabled: formData.get("enabled") === "on",
        priority: toNumber(formData.get("priority")),
        baseUrl: String(formData.get("baseUrl") ?? ""),
        defaultModel: String(formData.get("defaultModel") ?? ""),
        timeoutMs: toNumber(formData.get("timeoutMs")),
        inputTokenCostMicros: toNumber(formData.get("inputTokenCostMicros")),
        outputTokenCostMicros: toNumber(formData.get("outputTokenCostMicros")),
        cloudflareGatewayEnabled: formData.get("cloudflareGatewayEnabled") === "on",
      }).then(() => reportSuccess("Настройки провайдера сохранены")).catch((err) => reportError(err instanceof Error ? err.message : "Не удалось сохранить провайдера"));
    });
  }

  function submitPolicy(formData: FormData) {
    startTransition(() => {
      setMessage(null);
      const providerOrder = String(formData.get("providerOrder") ?? "")
        .split(",")
        .map((item) => item.trim())
        .filter((item): item is AIProvider => PROVIDERS.includes(item as AIProvider));
      void patchAIControl({
        type: "policy",
        feature: String(formData.get("feature") ?? ""),
        enabled: formData.get("enabled") === "on",
        providerOrder,
        maxTokens: toNumber(formData.get("maxTokens")),
        temperature: toNumber(formData.get("temperature")),
        timeoutMs: toNumber(formData.get("timeoutMs")),
        dailyTokenBudget: toNumber(formData.get("dailyTokenBudget")),
        perUserDailyTokenBudget: toNumber(formData.get("perUserDailyTokenBudget")),
      }).then(() => reportSuccess("Routing policy сохранена")).catch((err) => reportError(err instanceof Error ? err.message : "Не удалось сохранить routing policy"));
    });
  }

  return (
    <div className="space-y-6" data-testid="admin-ai-control-center">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="admin-ai-ops-metrics">
        <MetricCard icon={Activity} label="requests" value={formatTokens(totals.requests)} hint={`tokens ${formatTokens(totals.tokens)} today`} />
        <MetricCard icon={DollarSign} label="usd usage" value={formatUsdMicros(totals.costMicros)} hint="расчет по provider/model cost" />
        <MetricCard icon={KeyRound} label="api keys" value={`${totals.activeKeys}/${credentials.length}`} hint={`${totals.failedKeys} ключей в ошибке`} />
        <MetricCard icon={AlertTriangle} label="llm errors" value={formatTokens(totals.llmErrors)} hint={`${Object.keys(featureErrors).length} продуктов с ошибками`} />
      </section>

      <section
        className="grid gap-3 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4 md:grid-cols-3"
        data-testid="admin-ai-v42-guardrails"
      >
        <div>
          <p className="soft-eyebrow">free layer</p>
          <p className="mt-2 text-sm font-medium">Бесплатный вход остается дешевым</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
            Диалог ясности, routing и уточнения идут через цепочку дешевых моделей с fallback между LLM.
          </p>
        </div>
        <div>
          <p className="soft-eyebrow">paid layer</p>
          <p className="mt-2 text-sm font-medium">Платные продукты получают сильный слой</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
            Разборы, ракурсы, совместимость и сессии настраиваются отдельно по цепочке провайдеров.
          </p>
        </div>
        <div>
          <p className="soft-eyebrow">audit boundary</p>
          <p className="mt-2 text-sm font-medium">Промты, диалоги и ключи контролируются здесь</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
            Суперадмин видит ключи и LLM-диалоги; секреты не пишутся в runtime logs и audit details.
          </p>
        </div>
      </section>

      {message && (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800" data-testid="ai-control-toast">
          {message}
        </div>
      )}
      {errorMessage && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-800" data-testid="ai-control-error">
          {errorMessage}
        </div>
      )}
      {!encryptionConfigured && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-800" data-testid="ai-encryption-warning">
          AI_CREDENTIAL_KEY не настроен. Ключи нельзя расшифровать или проверить до настройки 32-байтного master key в env.
        </div>
      )}

      {cloudflareGateway.configured ? (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800" data-testid="ai-cf-gateway-info">
          <div className="font-medium">Cloudflare AI Gateway настроен</div>
          <p className="mt-1 text-xs text-emerald-800/80">
            gateway <code>{cloudflareGateway.gatewayId}</code> · account <code>{cloudflareGateway.accountId.slice(0, 8)}…</code> · token {cloudflareGateway.hasToken ? "есть" : "не задан"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-xs text-sky-800" data-testid="ai-cf-gateway-missing">
          Cloudflare AI Gateway не настроен. Переключатели ниже можно оставить выключенными; прямые Base URL будут работать без доработки кода.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Провайдеры и Cloudflare Gateway</h2>
        <div className="grid gap-3 xl:grid-cols-2">
          {providers.map((provider) => (
            <form key={provider.provider} action={submitProvider} className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/65 p-4" data-testid={`ai-provider-${provider.provider}`}>
              <input type="hidden" name="provider" value={provider.provider} />
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold text-[var(--soft-ink)]">{provider.displayName}</h3>
                  <p className="text-xs text-[var(--soft-ink-soft)]">{provider.provider}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <CheckboxSwitch name="enabled" defaultChecked={provider.enabled} label="включен" />
                  <CheckboxSwitch name="cloudflareGatewayEnabled" defaultChecked={provider.cloudflareGatewayEnabled} label="CF Gateway" />
                </div>
              </div>
              {cloudflareGateway.configured && cloudflareGateway.providerUrls?.[provider.provider] && (
                <code className="mb-3 block break-all rounded-md bg-[var(--soft-surface)] px-2 py-1 text-[11px] text-[var(--soft-ink-soft)]">
                  {cloudflareGateway.providerUrls[provider.provider]}
                </code>
              )}
              <div className="grid gap-2 sm:grid-cols-2">
                <Input name="priority" type="number" defaultValue={provider.priority} placeholder="Приоритет" />
                <Input name="timeoutMs" type="number" defaultValue={provider.timeoutMs} placeholder="Таймаут, мс" />
                <Input name="defaultModel" defaultValue={provider.defaultModel ?? ""} placeholder="Модель по умолчанию" className="sm:col-span-2" />
                <Input name="baseUrl" defaultValue={provider.baseUrl ?? ""} placeholder="Base URL override для провайдера" className="sm:col-span-2" />
                <Input name="inputTokenCostMicros" type="number" defaultValue={provider.inputTokenCostMicros ?? ""} placeholder="Input micros / 1K tokens" />
                <Input name="outputTokenCostMicros" type="number" defaultValue={provider.outputTokenCostMicros ?? ""} placeholder="Output micros / 1K tokens" />
              </div>
              <Button type="submit" size="sm" className="mt-3" disabled={isPending}>
                <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Сохранить
              </Button>
            </form>
          ))}
        </div>
      </section>

      <section data-testid="admin-ai-credentials">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">API ключи</h2>
        <div className="space-y-4">
          {PROVIDERS.map((provider) => {
            const providerCredentials = credentials.filter((credential) => credential.provider === provider);
            const providerModels = models[provider] ?? [];
            const activeCredentials = providerCredentials.filter((credential) => credential.enabled);
            const lastFetchedAt = providerModels[0]?.fetchedAt ?? null;
            const refreshDisabled = refreshing === provider || isPending || (provider !== AIProvider.OPENROUTER && activeCredentials.length === 0);
            return (
              <div key={provider} className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/65 p-4" data-testid={`ai-credentials-${provider}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--soft-ink)]">{provider}</h3>
                    <p className="text-xs text-[var(--soft-ink-soft)]">
                      ключей {providerCredentials.length} · моделей {providerModels.length}
                      {lastFetchedAt ? ` · каталог ${formatDate(lastFetchedAt)}` : ""}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={refreshDisabled}
                    onClick={() => { void refreshProviderModels(provider); }}
                    data-testid={`ai-models-refresh-${provider}`}
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    {refreshing === provider ? "Обновляем..." : "Обновить модели"}
                  </Button>
                </div>
                <div className="divide-y divide-[var(--soft-paper-edge)] overflow-hidden rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)]">
                  {providerCredentials.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-[var(--soft-ink-soft)]">Ключи не настроены</p>
                  ) : providerCredentials.map((credential) => (
                    <CredentialRowEditor
                      key={credential.id}
                      credential={credential}
                      models={providerModels}
                      onUpdate={(payload, msg) => patchCredential(credential.id, payload, msg)}
                      onDelete={() => deleteCredentialById(credential.id, credential.label)}
                      onCheck={() => checkCredentialById(credential.id, credential.label)}
                      disabled={!canViewSecrets || !encryptionConfigured || isPending || checkingCredentialId === credential.id}
                      canViewSecrets={canViewSecrets}
                    />
                  ))}
                </div>
                <form
                  className="mt-3 grid gap-2 lg:grid-cols-[1fr_1.4fr_1.2fr_1.2fr_0.7fr_auto]"
                  action={(formData) => {
                    startTransition(() => { void createCredential(formData); });
                  }}
                  data-testid={`ai-credentials-${provider}-create`}
                >
                  <input type="hidden" name="provider" value={provider} />
                  <Input name="label" placeholder="Метка" required />
                  <Input name="apiKey" placeholder="API ключ" type={canViewSecrets ? "text" : "password"} required className="font-mono" />
                  <select
                    name="modelOverride"
                    defaultValue=""
                    className="flex h-9 w-full rounded-md border border-[var(--soft-paper-edge)] bg-white/70 px-3 text-sm text-[var(--soft-ink)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--soft-bordeaux)]"
                  >
                    <option value="">Модель по умолчанию</option>
                    {providerModels.slice(0, 250).map((model) => (
                      <option key={model.modelId} value={model.modelId}>
                        {model.isFree ? "Free · " : ""}{model.modelId}
                      </option>
                    ))}
                  </select>
                  <Input name="baseUrlOverride" placeholder="Base URL ключа" />
                  <Input name="priority" type="number" placeholder="Priority" />
                  <Button type="submit" size="sm" disabled={!canViewSecrets || !encryptionConfigured || isPending}>
                    <KeyRound className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Добавить
                  </Button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Цепочки маршрутизации по продуктам</h2>
          <form action={submitPolicy} className="mb-4 rounded-lg border border-[var(--soft-paper-edge)] bg-white/65 p-4" data-testid="ai-policy-form">
            <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
              <Input name="feature" placeholder="dialogue-primary-answer" required />
              <CheckboxSwitch name="enabled" defaultChecked label="активна" />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Input name="providerOrder" defaultValue="OPENROUTER,GEMINI,OPENAI,ANTHROPIC,FIREWORKS" placeholder="Порядок провайдеров" className="sm:col-span-2" />
              <Input name="maxTokens" type="number" placeholder="Max tokens" />
              <Input name="temperature" type="number" step="0.1" placeholder="Temperature" />
              <Input name="timeoutMs" type="number" placeholder="Timeout ms" />
              <Input name="dailyTokenBudget" type="number" placeholder="Daily budget feature" />
              <Input name="perUserDailyTokenBudget" type="number" placeholder="Daily budget user" />
            </div>
            <Button type="submit" size="sm" className="mt-3" disabled={isPending}>
              <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
              Сохранить цепочку
            </Button>
          </form>
          <div className="max-h-[760px] divide-y divide-[var(--soft-paper-edge)] overflow-auto rounded-lg border border-[var(--soft-paper-edge)] bg-white/65">
            {policies.map((policy) => (
              <div key={policy.feature} className="px-4 py-3" data-testid={`ai-policy-${policy.feature}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-medium text-[var(--soft-ink)]">{policy.title ?? policy.feature}</p>
                    <p className="text-xs text-[var(--soft-ink-soft)]">{policy.feature}</p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {policy.tier && <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{policy.tier}</SoftBadge>}
                    <SoftBadge className={policy.enabled ? statusTone("ok") : statusTone("skipped")}>{policy.enabled ? "on" : "off"}</SoftBadge>
                    {featureErrors[policy.feature] ? <SoftBadge className={statusTone("failed")}>{featureErrors[policy.feature]} errors</SoftBadge> : null}
                  </div>
                </div>
                <p className="mt-2 font-mono text-xs text-[var(--soft-bordeaux)]">{policy.providerOrder.join(" -> ") || "default order"}</p>
                {policy.purpose && <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">{policy.purpose}</p>}
              </div>
            ))}
          </div>
        </div>

        <div data-testid="admin-ai-prompts">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Промты продуктов</h2>
          <div className="max-h-[940px] space-y-3 overflow-auto">
            {prompts.map((prompt) => (
              <details key={prompt.feature} className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/65 p-4" open={prompt.source === "database"}>
                <summary className="cursor-pointer list-none">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-[var(--soft-ink)]">{prompt.title}</p>
                      <p className="text-xs text-[var(--soft-ink-soft)]">{prompt.feature}{prompt.productKey ? ` · ${prompt.productKey}` : ""}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <SoftBadge className={prompt.enabled ? statusTone("ok") : statusTone("skipped")}>{prompt.enabled ? "active" : "off"}</SoftBadge>
                      <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{prompt.source === "database" ? "custom" : "default"}</SoftBadge>
                    </div>
                  </div>
                </summary>
                <form
                  className="mt-3 space-y-2"
                  action={(formData) => startTransition(() => { void savePrompt(formData); })}
                >
                  <input type="hidden" name="feature" value={prompt.feature} />
                  <input type="hidden" name="title" value={prompt.title} />
                  <input type="hidden" name="productKey" value={prompt.productKey ?? ""} />
                  <textarea
                    name="promptText"
                    defaultValue={prompt.promptText}
                    className="min-h-44 w-full rounded-lg border border-[var(--soft-paper-edge)] bg-white/80 p-3 font-mono text-xs leading-relaxed text-[var(--soft-ink)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--soft-bordeaux)]"
                    spellCheck={false}
                  />
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <CheckboxSwitch name="enabled" defaultChecked={prompt.enabled} label="использовать override" />
                    <Button type="submit" size="sm" disabled={isPending || !canViewSecrets}>
                      <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                      Сохранить промт
                    </Button>
                  </div>
                </form>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section data-testid="admin-ai-usage-details">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Расход токенов и денег</h2>
        <div className="overflow-hidden rounded-lg border border-[var(--soft-paper-edge)] bg-white/65">
          <div className="overflow-auto">
            <table className="w-full min-w-[960px] text-left text-xs">
              <thead className="bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
                <tr>
                  <th className="px-3 py-2">Product / feature</th>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Model</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Req/attempts</th>
                  <th className="px-3 py-2">Tokens</th>
                  <th className="px-3 py-2">Cost</th>
                  <th className="px-3 py-2">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--soft-paper-edge)]">
                {usageDetails.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">За период пока нет LLM usage</td></tr>
                ) : usageDetails.map((row) => (
                  <tr key={`${row.feature}:${row.provider}:${row.model}:${row.status}`}>
                    <td className="px-3 py-2 font-medium text-[var(--soft-ink)]">{row.feature}</td>
                    <td className="px-3 py-2">{row.provider}</td>
                    <td className="max-w-[18rem] truncate px-3 py-2 font-mono">{row.model}</td>
                    <td className="px-3 py-2"><SoftBadge className={statusTone(row.status)}>{row.status}</SoftBadge></td>
                    <td className="px-3 py-2">{row.requestCount}/{row.attemptCount}</td>
                    <td className="px-3 py-2">{formatTokens(row.totalTokens)}</td>
                    <td className="px-3 py-2">{formatUsdMicros(row.costMicros)}</td>
                    <td className="px-3 py-2">{row.avgLatencyMs ? `${row.avgLatencyMs} ms` : "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section data-testid="admin-ai-interactions">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          Аудит пользовательских LLM-диалогов
        </h2>
        <div className="space-y-3">
          {interactions.length === 0 ? (
            <div className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/65 px-4 py-8 text-center text-sm text-[var(--soft-ink-soft)]">
              LLM-диалогов за период пока нет.
            </div>
          ) : interactions.map((interaction) => (
            <details key={interaction.id} className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/65 p-4">
              <summary className="cursor-pointer list-none">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-[var(--soft-ink)]">{interaction.feature}</p>
                    <p className="text-xs text-[var(--soft-ink-soft)]">
                      {formatDate(interaction.createdAt)} · {interaction.userLabel ?? interaction.userId ?? "anonymous"} · {interaction.responseProvider ?? "no provider"} {interaction.responseModel ?? ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    <SoftBadge className={statusTone(interaction.status)}>{interaction.status}</SoftBadge>
                    <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{formatTokens(interaction.totalTokens)} tokens</SoftBadge>
                    <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{formatUsdMicros(interaction.estimatedCostMicros)}</SoftBadge>
                  </div>
                </div>
              </summary>
              <div className="mt-4 grid gap-3 xl:grid-cols-2">
                <div className="space-y-2">
                  <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">
                    <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                    User/context to LLM
                  </p>
                  <div className="max-h-96 space-y-2 overflow-auto rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3">
                    {interaction.messages.map((item, index) => (
                      <div key={`${interaction.id}:message:${index}`} className="rounded-md bg-white/70 p-2">
                        <p className="mb-1 text-[11px] font-semibold uppercase text-[var(--soft-bordeaux)]">{item.role}</p>
                        <pre className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--soft-ink)]">{renderAuditContent(item.content)}</pre>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">LLM answer and attempts</p>
                  <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3 text-xs leading-relaxed text-[var(--soft-ink)]">
                    {interaction.responseText ?? "Нет ответа"}
                  </pre>
                  <div className="space-y-1">
                    {interaction.attempts.map((attempt, index) => (
                      <div key={`${interaction.id}:attempt:${index}`} className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--soft-surface)] px-3 py-2 text-xs">
                        <SoftBadge className={statusTone(attempt.status)}>{attempt.status}</SoftBadge>
                        <span className="font-mono">{attempt.provider}/{attempt.model}</span>
                        <span className="text-[var(--soft-ink-soft)]">{attempt.totalTokens} tokens · {formatUsdMicros(attempt.estimatedCostMicros)} · {attempt.latencyMs ? `${attempt.latencyMs} ms` : "no latency"}</span>
                        {attempt.errorCode && <span className="text-red-700">{attempt.errorCode}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
