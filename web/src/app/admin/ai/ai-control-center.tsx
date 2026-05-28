"use client";

import type { ReactNode } from "react";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  DollarSign,
  GripVertical,
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
  GROQ: "GROQ",
  MISTRAL: "MISTRAL",
  CEREBRAS: "CEREBRAS",
  COHERE: "COHERE",
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
  modelPreferences?: Partial<Record<AIProvider, string>> | null;
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
  inputTokenCostMicros: number | null;
  outputTokenCostMicros: number | null;
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
  errorText: string | null;
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

const DIRECT_PROVIDER_BASE_URLS: Record<AIProvider, string> = {
  [AIProvider.OPENAI]: "https://api.openai.com/v1",
  [AIProvider.ANTHROPIC]: "https://api.anthropic.com/v1",
  [AIProvider.FIREWORKS]: "https://api.fireworks.ai/inference/v1",
  [AIProvider.OPENROUTER]: "https://openrouter.ai/api/v1",
  [AIProvider.GEMINI]: "https://generativelanguage.googleapis.com/v1beta",
  [AIProvider.GROQ]: "https://api.groq.com/openai/v1",
  [AIProvider.MISTRAL]: "https://api.mistral.ai/v1",
  [AIProvider.CEREBRAS]: "https://api.cerebras.ai/v1",
  [AIProvider.COHERE]: "https://api.cohere.ai/compatibility/v1",
};

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

function formatUsdAmount(value: number) {
  const abs = Math.abs(value);
  const fractionDigits = abs > 0 && abs < 1 ? 4 : 2;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(value);
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

function numberFromUnknown(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function modelCatalogPricing(model: ModelRow) {
  if (model.inputTokenCostMicros != null || model.outputTokenCostMicros != null) {
    return {
      source: "model",
      inputUsdPerMillion: (model.inputTokenCostMicros ?? 0) / 1000,
      outputUsdPerMillion: (model.outputTokenCostMicros ?? 0) / 1000,
    };
  }
  const metadata = model.metadata;
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const pricing = (metadata as Record<string, unknown>).pricing;
  if (!pricing || typeof pricing !== "object" || Array.isArray(pricing)) return null;
  const prompt = numberFromUnknown((pricing as Record<string, unknown>).prompt);
  const completion = numberFromUnknown((pricing as Record<string, unknown>).completion);
  if (prompt == null || completion == null) return null;
  return {
    source: "catalog",
    inputUsdPerMillion: prompt * 1_000_000,
    outputUsdPerMillion: completion * 1_000_000,
  };
}

function providerDefaultPricing(provider?: ProviderRow) {
  const input = numberFromUnknown(provider?.inputTokenCostMicros);
  const output = numberFromUnknown(provider?.outputTokenCostMicros);
  if (input == null && output == null) return null;
  return {
    source: "provider default",
    inputUsdPerMillion: (input ?? 0) / 1000,
    outputUsdPerMillion: (output ?? 0) / 1000,
  };
}

function modelPricing(model: ModelRow, provider?: ProviderRow) {
  return modelCatalogPricing(model) ?? providerDefaultPricing(provider);
}

function modelPricingLabel(model: ModelRow, provider?: ProviderRow) {
  const pricing = modelPricing(model, provider);
  if (!pricing) return null;
  return `${pricing.source}: ${formatUsdAmount(pricing.inputUsdPerMillion)} in / ${formatUsdAmount(pricing.outputUsdPerMillion)} out за 1M токенов`;
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
  provider,
  onChange,
  placeholder,
}: {
  value: string;
  models: ModelRow[];
  provider?: ProviderRow;
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
      {models.slice(0, 250).map((model) => {
        const pricingLabel = modelPricingLabel(model, provider);
        return (
          <option key={model.modelId} value={model.modelId}>
            {model.isFree ? "Free · " : ""}
            {model.modelId}
            {model.displayName ? ` - ${model.displayName}` : ""}
            {pricingLabel ? ` · ${pricingLabel}` : ""}
          </option>
        );
      })}
      {showCustom && <option value="__custom__">{value} (текущее, нет в каталоге)</option>}
    </select>
  );
}

function ModelPricingEditorRow({
  model,
  provider,
  onSavePricing,
}: {
  model: ModelRow;
  provider: ProviderRow;
  onSavePricing?: (modelId: string, inputTokenCostMicros: number | null, outputTokenCostMicros: number | null) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState({
    input: model.inputTokenCostMicros ?? "",
    output: model.outputTokenCostMicros ?? "",
  });
  const pricing = modelPricing(model, provider);
  return (
    <tr>
      <td className="max-w-[18rem] truncate py-1.5 pr-3 font-mono text-[var(--soft-ink)]">
        {model.isFree ? "Free · " : ""}{model.modelId}
      </td>
      <td className="py-1.5 pr-3 text-[var(--soft-ink-soft)]">
        {model.contextWindow ? formatTokens(model.contextWindow) : "-"}
      </td>
      <td className="py-1.5 pr-3 text-[var(--soft-ink-soft)]">
        {pricing?.source ?? "не задана"}
      </td>
      <td className="py-1.5 pr-3 text-[var(--soft-ink)]">
        {pricing
          ? `${formatUsdAmount(pricing.inputUsdPerMillion)} / ${formatUsdAmount(pricing.outputUsdPerMillion)}`
          : "стоимость не задана"}
      </td>
      <td className="py-1.5 pr-3">
        <div className="grid min-w-[10rem] grid-cols-2 gap-1">
          <Input value={draft.input} type="number" placeholder="input" onChange={(event) => setDraft({ ...draft, input: event.target.value === "" ? "" : Number(event.target.value) })} />
          <Input value={draft.output} type="number" placeholder="output" onChange={(event) => setDraft({ ...draft, output: event.target.value === "" ? "" : Number(event.target.value) })} />
        </div>
      </td>
      <td className="py-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={!onSavePricing}
          onClick={() => onSavePricing?.(
            model.modelId,
            draft.input === "" ? null : Number(draft.input),
            draft.output === "" ? null : Number(draft.output),
          )}
        >
          Save
        </Button>
      </td>
    </tr>
  );
}

function ModelPricingPreview({
  provider,
  models,
  onSavePricing,
}: {
  provider: ProviderRow;
  models: ModelRow[];
  onSavePricing?: (modelId: string, inputTokenCostMicros: number | null, outputTokenCostMicros: number | null) => Promise<void> | void;
}) {
  const rows = models;
  return (
    <div className="mb-3 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3" data-testid={`ai-model-pricing-${provider.provider}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Стоимость моделей</p>
          <p className="mt-0.5 text-[11px] text-[var(--soft-ink-soft)]">
            Каталог провайдера имеет приоритет; если цена не пришла, используется ставка провайдера.
          </p>
        </div>
        <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">
          USD за 1M токенов
        </SoftBadge>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-[var(--soft-ink-soft)]">Каталог моделей пуст. Обновите модели после добавления активного ключа.</p>
      ) : (
        <div className="max-h-[360px] overflow-auto">
          <table className="w-full min-w-[820px] text-left text-[11px]">
            <thead className="text-[var(--soft-ink-soft)]">
              <tr>
                <th className="py-1 pr-3 font-medium">Model</th>
                <th className="py-1 pr-3 font-medium">Context</th>
                <th className="py-1 pr-3 font-medium">Price source</th>
                <th className="py-1 font-medium">Input / output</th>
                <th className="py-1 pr-3 font-medium">Micros / 1K</th>
                <th className="py-1 font-medium">Save</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--soft-paper-edge)]">
              {rows.map((model) => (
                <ModelPricingEditorRow key={model.modelId} model={model} provider={provider} onSavePricing={onSavePricing} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ProviderTableRow({
  provider,
  models,
  cloudflareGateway,
  disabled,
  onSave,
  onRefreshModels,
  refreshing,
}: {
  provider: ProviderRow;
  models: ModelRow[];
  cloudflareGateway: CloudflareGatewayState;
  disabled: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void> | void;
  onRefreshModels: () => Promise<void> | void;
  refreshing: boolean;
}) {
  const cfUrl = cloudflareGateway.configured ? cloudflareGateway.providerUrls?.[provider.provider] ?? null : null;
  const directUrl = DIRECT_PROVIDER_BASE_URLS[provider.provider];
  const [draft, setDraft] = useState({
    enabled: provider.enabled,
    cloudflareGatewayEnabled: provider.cloudflareGatewayEnabled ?? false,
    priority: provider.priority,
    timeoutMs: provider.timeoutMs,
    defaultModel: provider.defaultModel ?? "",
    baseUrl: provider.baseUrl ?? directUrl,
    inputTokenCostMicros: provider.inputTokenCostMicros ?? "",
    outputTokenCostMicros: provider.outputTokenCostMicros ?? "",
  });

  function toggleCloudflare(enabled: boolean) {
    setDraft((current) => ({
      ...current,
      cloudflareGatewayEnabled: enabled,
      baseUrl: enabled && cfUrl ? cfUrl : directUrl,
    }));
  }

  return (
    <tr data-testid={`ai-provider-${provider.provider}`}>
      <td className="px-3 py-3 align-top">
        <div className="font-semibold text-[var(--soft-ink)]">{provider.displayName}</div>
        <div className="mt-1 font-mono text-[11px] text-[var(--soft-ink-soft)]">{provider.provider}</div>
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
            <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
            включен
          </label>
          <label className="flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]" title={cfUrl ? "Переключит Base URL на Cloudflare Gateway" : "Cloudflare Gateway для этого провайдера не поддержан или не настроен"}>
            <input
              type="checkbox"
              checked={draft.cloudflareGatewayEnabled}
              disabled={!cfUrl}
              onChange={(event) => toggleCloudflare(event.target.checked)}
            />
            CF Gateway
          </label>
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <Input value={draft.priority} type="number" onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })} aria-label={`${provider.provider} priority`} />
      </td>
      <td className="px-3 py-3 align-top">
        <Input value={draft.timeoutMs} type="number" onChange={(event) => setDraft({ ...draft, timeoutMs: Number(event.target.value) })} aria-label={`${provider.provider} timeout`} />
      </td>
      <td className="px-3 py-3 align-top">
        <ModelSelect
          value={draft.defaultModel}
          models={models}
          provider={provider}
          onChange={(value) => setDraft({ ...draft, defaultModel: value })}
          placeholder="Модель по умолчанию"
        />
      </td>
      <td className="px-3 py-3 align-top">
        <Input
          value={draft.baseUrl}
          onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
          className="min-w-[22rem] font-mono text-xs"
          aria-label={`${provider.provider} base URL`}
        />
        {cfUrl && <div className="mt-1 text-[11px] text-[var(--soft-ink-soft)]">CF: {cfUrl}</div>}
      </td>
      <td className="px-3 py-3 align-top">
        <div className="grid min-w-[12rem] grid-cols-2 gap-2">
          <Input value={draft.inputTokenCostMicros} type="number" onChange={(event) => setDraft({ ...draft, inputTokenCostMicros: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="input" aria-label={`${provider.provider} input cost`} />
          <Input value={draft.outputTokenCostMicros} type="number" onChange={(event) => setDraft({ ...draft, outputTokenCostMicros: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="output" aria-label={`${provider.provider} output cost`} />
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex flex-col gap-2">
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() => onSave({
              type: "provider",
              provider: provider.provider,
              enabled: draft.enabled,
              priority: draft.priority,
              baseUrl: draft.baseUrl,
              defaultModel: draft.defaultModel,
              timeoutMs: draft.timeoutMs,
              inputTokenCostMicros: draft.inputTokenCostMicros === "" ? null : Number(draft.inputTokenCostMicros),
              outputTokenCostMicros: draft.outputTokenCostMicros === "" ? null : Number(draft.outputTokenCostMicros),
              cloudflareGatewayEnabled: draft.cloudflareGatewayEnabled,
            })}
          >
            <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Сохранить
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={disabled || refreshing} onClick={() => onRefreshModels()}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            {refreshing ? "..." : "Модели"}
          </Button>
        </div>
      </td>
    </tr>
  );
}

function CredentialTableRow({
  credential,
  models,
  provider,
  onUpdate,
  onDelete,
  onCheck,
  disabled,
  canViewSecrets,
}: {
  credential: CredentialRow;
  models: ModelRow[];
  provider: ProviderRow;
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
    enabled: credential.enabled,
    priority: credential.priority,
    modelOverride: credential.modelOverride ?? "",
    baseUrlOverride: credential.baseUrlOverride ?? "",
  });
  const state = keyState(credential);

  return (
    <tr data-testid={`ai-credential-${credential.id}`}>
      <td className="px-3 py-3 align-top">
        <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{credential.provider}</SoftBadge>
      </td>
      <td className="px-3 py-3 align-top"><Input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} /></td>
      <td className="px-3 py-3 align-top">
        <Input
          value={draft.apiKey}
          onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
          placeholder={canViewSecrets ? credential.apiKeyPreview : `${credential.apiKeyPreview} - новый ключ`}
          type={canViewSecrets ? "text" : "password"}
          spellCheck={false}
          autoComplete="off"
          className="min-w-[16rem] font-mono text-xs"
        />
      </td>
      <td className="px-3 py-3 align-top">
        <SoftBadge className={state.tone}>{state.label}</SoftBadge>
        {credential.lastErrorCode && <div className="mt-1 text-xs text-red-700">{credential.lastErrorCode}</div>}
        {credential.lastErrorMessage && <div className="mt-1 max-w-[16rem] truncate text-xs text-red-700">{credential.lastErrorMessage}</div>}
      </td>
      <td className="px-3 py-3 align-top">
        <label className="flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
          enabled
        </label>
      </td>
      <td className="px-3 py-3 align-top"><Input value={draft.priority} type="number" onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })} /></td>
      <td className="px-3 py-3 align-top">
        <ModelSelect value={draft.modelOverride} models={models} provider={provider} onChange={(value) => setDraft({ ...draft, modelOverride: value })} placeholder="Override модели" />
      </td>
      <td className="px-3 py-3 align-top">
        <Input value={draft.baseUrlOverride} onChange={(event) => setDraft({ ...draft, baseUrlOverride: event.target.value })} placeholder="Base URL ключа" className="min-w-[18rem] font-mono text-xs" />
      </td>
      <td className="px-3 py-3 align-top text-xs text-[var(--soft-ink-soft)]">
        <div>успех: {formatDate(credential.lastSuccessAt)}</div>
        <div>ошибка: {formatDate(credential.lastErrorAt)}</div>
        {credential.consecutiveFailures > 0 && <div className="text-red-700">{credential.consecutiveFailures} подряд</div>}
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex flex-col gap-2">
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onCheck()}>
            <Activity className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Check
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() => {
              const payload: Record<string, unknown> = {
                label: draft.label,
                enabled: draft.enabled,
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
            Save
          </Button>
          {(credential.regionBlocked || credential.consecutiveFailures > 0) && (
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onUpdate({ resetFailureState: true }, "Состояние ошибок сброшено")}>Сброс</Button>
          )}
          <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => onDelete()}>Удалить</Button>
        </div>
      </td>
    </tr>
  );
}

function PolicyTableRow({
  policy,
  providers,
  models,
  disabled,
  onSave,
}: {
  policy: PolicyRow;
  providers: ProviderRow[];
  models: ModelsByProvider;
  disabled: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState({
    enabled: policy.enabled,
    providerOrder: policy.providerOrder.length ? policy.providerOrder : PROVIDERS,
    modelPreferences: { ...(policy.modelPreferences ?? {}) } as Partial<Record<AIProvider, string>>,
    maxTokens: policy.maxTokens ?? "",
    temperature: policy.temperature ?? "",
    timeoutMs: policy.timeoutMs ?? "",
    dailyTokenBudget: policy.dailyTokenBudget ?? "",
    perUserDailyTokenBudget: policy.perUserDailyTokenBudget ?? "",
  });
  const [draggedProvider, setDraggedProvider] = useState<AIProvider | null>(null);
  const providerConfigById = useMemo(() => new Map(providers.map((provider) => [provider.provider, provider])), [providers]);

  function moveProvider(provider: AIProvider, direction: -1 | 1) {
    const index = draft.providerOrder.indexOf(provider);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= draft.providerOrder.length) return;
    const next = [...draft.providerOrder];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    setDraft({ ...draft, providerOrder: next });
  }

  function dropOn(target: AIProvider) {
    if (!draggedProvider || draggedProvider === target) return;
    const without = draft.providerOrder.filter((provider) => provider !== draggedProvider);
    const targetIndex = without.indexOf(target);
    const next = [...without.slice(0, targetIndex), draggedProvider, ...without.slice(targetIndex)];
    setDraft({ ...draft, providerOrder: next });
    setDraggedProvider(null);
  }

  function updateModel(provider: AIProvider, value: string) {
    setDraft({
      ...draft,
      modelPreferences: {
        ...draft.modelPreferences,
        [provider]: value || undefined,
      },
    });
  }

  return (
    <tr data-testid={`ai-policy-${policy.feature}`}>
      <td className="px-3 py-3 align-top">
        <div className="font-medium text-[var(--soft-ink)]">{policy.title ?? policy.feature}</div>
        <div className="mt-1 font-mono text-[11px] text-[var(--soft-ink-soft)]">{policy.feature}</div>
        {policy.purpose && <div className="mt-1 max-w-[20rem] text-xs text-[var(--soft-ink-soft)]">{policy.purpose}</div>}
      </td>
      <td className="px-3 py-3 align-top">
        <label className="flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
          active
        </label>
        {policy.tier && <SoftBadge className="mt-2 border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{policy.tier}</SoftBadge>}
      </td>
      <td className="px-3 py-3 align-top">
        <div className="flex min-w-[22rem] flex-wrap gap-1.5">
          {draft.providerOrder.map((provider, index) => (
            <span
              key={provider}
              draggable
              onDragStart={() => setDraggedProvider(provider)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(provider)}
              className="inline-flex items-center gap-1 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-2 py-1 text-[11px] text-[var(--soft-ink)]"
              title="Перетащите, чтобы изменить порядок"
            >
              <GripVertical className="h-3 w-3 text-[var(--soft-ink-soft)]" aria-hidden="true" />
              {provider}
              <button type="button" onClick={() => moveProvider(provider, -1)} disabled={index === 0} aria-label={`Поднять ${provider}`}><ArrowUp className="h-3 w-3" /></button>
              <button type="button" onClick={() => moveProvider(provider, 1)} disabled={index === draft.providerOrder.length - 1} aria-label={`Опустить ${provider}`}><ArrowDown className="h-3 w-3" /></button>
            </span>
          ))}
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <div className="grid min-w-[26rem] gap-2">
          {draft.providerOrder.map((provider) => (
            <label key={`${policy.feature}:${provider}:model`} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
              <span>{provider}</span>
              <ModelSelect
                value={draft.modelPreferences[provider] ?? ""}
                models={models[provider] ?? []}
                provider={providerConfigById.get(provider)}
                onChange={(value) => updateModel(provider, value)}
                placeholder="модель провайдера"
              />
            </label>
          ))}
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <div className="grid min-w-[16rem] grid-cols-2 gap-2">
          <Input value={draft.maxTokens} type="number" onChange={(event) => setDraft({ ...draft, maxTokens: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="max" />
          <Input value={draft.temperature} type="number" step="0.1" onChange={(event) => setDraft({ ...draft, temperature: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="temp" />
          <Input value={draft.timeoutMs} type="number" onChange={(event) => setDraft({ ...draft, timeoutMs: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="timeout" />
          <Input value={draft.dailyTokenBudget} type="number" onChange={(event) => setDraft({ ...draft, dailyTokenBudget: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="feature/day" />
          <Input value={draft.perUserDailyTokenBudget} type="number" onChange={(event) => setDraft({ ...draft, perUserDailyTokenBudget: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="user/day" />
        </div>
      </td>
      <td className="px-3 py-3 align-top">
        <Button
          type="button"
          size="sm"
          disabled={disabled}
          onClick={() => {
            const modelPreferences = Object.fromEntries(
              Object.entries(draft.modelPreferences).filter(([, value]) => typeof value === "string" && value.trim()),
            );
            void onSave({
              type: "policy",
              feature: policy.feature,
              enabled: draft.enabled,
              providerOrder: draft.providerOrder,
              modelPreferences,
              maxTokens: draft.maxTokens === "" ? null : Number(draft.maxTokens),
              temperature: draft.temperature === "" ? null : Number(draft.temperature),
              timeoutMs: draft.timeoutMs === "" ? null : Number(draft.timeoutMs),
              dailyTokenBudget: draft.dailyTokenBudget === "" ? null : Number(draft.dailyTokenBudget),
              perUserDailyTokenBudget: draft.perUserDailyTokenBudget === "" ? null : Number(draft.perUserDailyTokenBudget),
            });
          }}
        >
          <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
          Сохранить
        </Button>
      </td>
    </tr>
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
  const [interactionQuery, setInteractionQuery] = useState("");
  const [interactionStatus, setInteractionStatus] = useState("all");
  const [interactionProvider, setInteractionProvider] = useState("all");
  const [interactionSort, setInteractionSort] = useState<"createdAt_desc" | "createdAt_asc" | "tokens_desc" | "cost_desc">("createdAt_desc");
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

  const filteredInteractions = useMemo(() => {
    const query = interactionQuery.trim().toLowerCase();
    const sorted = [...interactions]
      .filter((interaction) => interactionStatus === "all" || interaction.status === interactionStatus)
      .filter((interaction) => interactionProvider === "all" || interaction.attempts.some((attempt) => attempt.provider === interactionProvider) || interaction.responseProvider?.toUpperCase() === interactionProvider)
      .filter((interaction) => {
        if (!query) return true;
        return [
          interaction.feature,
          interaction.userLabel,
          interaction.requestId,
          interaction.responseText,
          interaction.errorText,
          interaction.responseProvider,
          interaction.responseModel,
          ...interaction.messages.map((message) => JSON.stringify(message.content)),
        ].some((value) => typeof value === "string" && value.toLowerCase().includes(query));
      });

    sorted.sort((a, b) => {
      if (interactionSort === "createdAt_asc") return Date.parse(a.createdAt) - Date.parse(b.createdAt);
      if (interactionSort === "tokens_desc") return b.totalTokens - a.totalTokens;
      if (interactionSort === "cost_desc") return b.estimatedCostMicros - a.estimatedCostMicros;
      return Date.parse(b.createdAt) - Date.parse(a.createdAt);
    });
    return sorted;
  }, [interactionProvider, interactionQuery, interactionSort, interactionStatus, interactions]);

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

  async function resetPrompt(feature: string) {
    const response = await fetch(`/api/admin/ai/prompts?feature=${encodeURIComponent(feature)}`, {
      method: "DELETE",
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      reportError(body?.message ?? "Не удалось сбросить промт");
      return;
    }
    reportSuccess(`Промт ${feature} сброшен к рекомендуемому default`);
  }

  async function saveModelPricing(provider: AIProvider, modelId: string, inputTokenCostMicros: number | null, outputTokenCostMicros: number | null) {
    const response = await fetch("/api/admin/ai/models", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ provider, modelId, inputTokenCostMicros, outputTokenCostMicros }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => null);
      reportError(body?.message ?? "Не удалось сохранить цену модели");
      return;
    }
    reportSuccess(`Цена модели ${modelId} сохранена`);
  }

  function saveAIControlPayload(payload: Record<string, unknown>, success: string) {
    startTransition(() => {
      setMessage(null);
      void patchAIControl(payload)
        .then(() => reportSuccess(success))
        .catch((err) => reportError(err instanceof Error ? err.message : "Не удалось сохранить AI config"));
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
        <div className="overflow-hidden rounded-lg border border-[var(--soft-paper-edge)] bg-white/65">
          <div className="overflow-auto">
            <table className="w-full min-w-[1280px] text-left text-xs">
              <thead className="bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
                <tr>
                  <th className="px-3 py-2">Провайдер</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Timeout</th>
                  <th className="px-3 py-2">Default model</th>
                  <th className="px-3 py-2">Base URL</th>
                  <th className="px-3 py-2">Default price micros/1K</th>
                  <th className="px-3 py-2">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--soft-paper-edge)]">
                {providers.map((provider) => (
                  <ProviderTableRow
                    key={provider.provider}
                    provider={provider}
                    models={models[provider.provider] ?? []}
                    cloudflareGateway={cloudflareGateway}
                    disabled={isPending}
                    refreshing={refreshing === provider.provider}
                    onRefreshModels={() => refreshProviderModels(provider.provider)}
                    onSave={(payload) => saveAIControlPayload(payload, "Настройки провайдера сохранены")}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section data-testid="admin-ai-credentials">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">API ключи</h2>
        <div className="overflow-hidden rounded-lg border border-[var(--soft-paper-edge)] bg-white/65">
          <div className="overflow-auto">
            <table className="w-full min-w-[1500px] text-left text-xs">
              <thead className="bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
                <tr>
                  <th className="px-3 py-2">Provider</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">API key</th>
                  <th className="px-3 py-2">Health</th>
                  <th className="px-3 py-2">Enabled</th>
                  <th className="px-3 py-2">Priority</th>
                  <th className="px-3 py-2">Model override</th>
                  <th className="px-3 py-2">Base URL override</th>
                  <th className="px-3 py-2">Мониторинг</th>
                  <th className="px-3 py-2">Действия</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--soft-paper-edge)]">
                {credentials.length === 0 ? (
                  <tr><td colSpan={10} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">Ключи не настроены</td></tr>
                ) : credentials.map((credential) => {
                  const providerConfig = providers.find((row) => row.provider === credential.provider) ?? {
                    provider: credential.provider,
                    displayName: credential.provider,
                    enabled: false,
                    priority: 100,
                    timeoutMs: 30_000,
                  };
                  return (
                    <CredentialTableRow
                      key={credential.id}
                      credential={credential}
                      models={models[credential.provider] ?? []}
                      provider={providerConfig}
                      onUpdate={(payload, msg) => patchCredential(credential.id, payload, msg)}
                      onDelete={() => deleteCredentialById(credential.id, credential.label)}
                      onCheck={() => checkCredentialById(credential.id, credential.label)}
                      disabled={!canViewSecrets || !encryptionConfigured || isPending || checkingCredentialId === credential.id}
                      canViewSecrets={canViewSecrets}
                    />
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-2">
          {PROVIDERS.map((provider) => {
            const providerModels = models[provider] ?? [];
            const providerConfig = providers.find((row) => row.provider === provider) ?? {
              provider,
              displayName: provider,
              enabled: false,
              priority: 100,
              timeoutMs: 30_000,
            };
            return (
              <div key={provider} className="rounded-lg border border-[var(--soft-paper-edge)] bg-white/65 p-4" data-testid={`ai-credentials-${provider}-create`}>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--soft-ink)]">{provider}</h3>
                    <p className="text-xs text-[var(--soft-ink-soft)]">моделей {providerModels.length}{providerModels[0]?.fetchedAt ? ` · каталог ${formatDate(providerModels[0].fetchedAt)}` : ""}</p>
                  </div>
                  <Button type="button" size="sm" variant="outline" disabled={refreshing === provider || isPending || (provider !== AIProvider.OPENROUTER && credentials.filter((item) => item.provider === provider && item.enabled).length === 0)} onClick={() => { void refreshProviderModels(provider); }}>
                    <RefreshCw className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    {refreshing === provider ? "Обновляем..." : "Обновить модели"}
                  </Button>
                </div>
                <ModelPricingPreview
                  provider={providerConfig}
                  models={providerModels}
                  onSavePricing={(modelId, input, output) => saveModelPricing(provider, modelId, input, output)}
                />
                <form
                  className="grid gap-2 lg:grid-cols-[1fr_1.4fr_1.2fr_1.2fr_0.7fr_auto]"
                  action={(formData) => {
                    startTransition(() => { void createCredential(formData); });
                  }}
                >
                  <input type="hidden" name="provider" value={provider} />
                  <Input name="label" placeholder="Метка" required />
                  <Input name="apiKey" placeholder="API ключ" type={canViewSecrets ? "text" : "password"} required className="font-mono" />
                  <select name="modelOverride" defaultValue="" className="flex h-9 w-full rounded-md border border-[var(--soft-paper-edge)] bg-white/70 px-3 text-sm text-[var(--soft-ink)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--soft-bordeaux)]">
                    <option value="">Модель по умолчанию</option>
                    {providerModels.slice(0, 250).map((model) => {
                      const pricingLabel = modelPricingLabel(model, providerConfig);
                      return <option key={model.modelId} value={model.modelId}>{model.isFree ? "Free · " : ""}{model.modelId}{pricingLabel ? ` · ${pricingLabel}` : ""}</option>;
                    })}
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
              <Input name="providerOrder" defaultValue="OPENROUTER,GEMINI,GROQ,MISTRAL,OPENAI,ANTHROPIC,COHERE,CEREBRAS,FIREWORKS" placeholder="Порядок провайдеров" className="sm:col-span-2" />
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
          <div className="max-h-[820px] overflow-auto rounded-lg border border-[var(--soft-paper-edge)] bg-white/65">
            <table className="w-full min-w-[1180px] text-left text-xs">
              <thead className="sticky top-0 z-10 bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
                <tr>
                  <th className="px-3 py-2">Продукт / feature</th>
                  <th className="px-3 py-2">Статус</th>
                  <th className="px-3 py-2">Цепочка провайдеров</th>
                  <th className="px-3 py-2">Модели по провайдерам</th>
                  <th className="px-3 py-2">Параметры</th>
                  <th className="px-3 py-2">Save</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--soft-paper-edge)]">
                {policies.map((policy) => (
                  <PolicyTableRow
                    key={policy.feature}
                    policy={policy}
                    providers={providers}
                    models={models}
                    disabled={isPending}
                    onSave={(payload) => saveAIControlPayload(payload, "Routing policy сохранена")}
                  />
                ))}
              </tbody>
            </table>
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
                    <div className="flex flex-wrap gap-2">
                      {prompt.source === "database" && (
                        <Button type="button" size="sm" variant="outline" disabled={isPending || !canViewSecrets} onClick={() => startTransition(() => { void resetPrompt(prompt.feature); })}>
                          Сбросить к default
                        </Button>
                      )}
                      <Button type="submit" size="sm" disabled={isPending || !canViewSecrets}>
                        <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                        Сохранить промт
                      </Button>
                    </div>
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
        <div className="mb-3 grid gap-2 md:grid-cols-[1.5fr_0.8fr_0.8fr_0.8fr]">
          <Input value={interactionQuery} onChange={(event) => setInteractionQuery(event.target.value)} placeholder="Поиск по feature, пользователю, контексту, ответу" />
          <select value={interactionStatus} onChange={(event) => setInteractionStatus(event.target.value)} className="h-9 rounded-md border border-[var(--soft-paper-edge)] bg-white/70 px-3 text-sm text-[var(--soft-ink)]">
            <option value="all">Все статусы</option>
            <option value="SUCCEEDED">SUCCEEDED</option>
            <option value="FAILED">FAILED</option>
            <option value="RUNNING">RUNNING</option>
          </select>
          <select value={interactionProvider} onChange={(event) => setInteractionProvider(event.target.value)} className="h-9 rounded-md border border-[var(--soft-paper-edge)] bg-white/70 px-3 text-sm text-[var(--soft-ink)]">
            <option value="all">Все провайдеры</option>
            {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
          </select>
          <select value={interactionSort} onChange={(event) => setInteractionSort(event.target.value as typeof interactionSort)} className="h-9 rounded-md border border-[var(--soft-paper-edge)] bg-white/70 px-3 text-sm text-[var(--soft-ink)]">
            <option value="createdAt_desc">Новые сверху</option>
            <option value="createdAt_asc">Старые сверху</option>
            <option value="tokens_desc">Токены ↓</option>
            <option value="cost_desc">Стоимость ↓</option>
          </select>
        </div>
        <div className="overflow-hidden rounded-lg border border-[var(--soft-paper-edge)] bg-white/65">
          <div className="overflow-auto">
            <table className="w-full min-w-[1180px] text-left text-xs">
              <thead className="bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
                <tr>
                  <th className="px-3 py-2">Время</th>
                  <th className="px-3 py-2">Feature</th>
                  <th className="px-3 py-2">Пользователь</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Provider / model</th>
                  <th className="px-3 py-2">Tokens / cost</th>
                  <th className="px-3 py-2">Ответ</th>
                  <th className="px-3 py-2">Просмотр</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--soft-paper-edge)]">
                {filteredInteractions.length === 0 ? (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">LLM-диалогов по фильтрам нет. Сейчас показывается окно до 7 дней, чтобы не терять вчерашние ответы.</td></tr>
                ) : filteredInteractions.map((interaction) => (
                  <tr key={interaction.id}>
                    <td className="px-3 py-3 align-top text-[var(--soft-ink-soft)]">{formatDate(interaction.createdAt)}</td>
                    <td className="px-3 py-3 align-top font-medium text-[var(--soft-ink)]">{interaction.feature}</td>
                    <td className="px-3 py-3 align-top text-[var(--soft-ink-soft)]">{interaction.userLabel ?? interaction.userId ?? "anonymous"}</td>
                    <td className="px-3 py-3 align-top"><SoftBadge className={statusTone(interaction.status)}>{interaction.status}</SoftBadge></td>
                    <td className="px-3 py-3 align-top font-mono text-[11px]">
                      {interaction.responseProvider ?? interaction.attempts.at(-1)?.provider ?? "no provider"} / {interaction.responseModel ?? interaction.attempts.at(-1)?.model ?? "no model"}
                    </td>
                    <td className="px-3 py-3 align-top text-[var(--soft-ink-soft)]">
                      {formatTokens(interaction.totalTokens)} · {formatUsdMicros(interaction.estimatedCostMicros)}
                    </td>
                    <td className="max-w-[22rem] px-3 py-3 align-top text-[var(--soft-ink)]">
                      <div className="line-clamp-3">{interaction.responseText ?? interaction.errorText ?? "Нет ответа"}</div>
                    </td>
                    <td className="px-3 py-3 align-top">
                      <details>
                        <summary className="cursor-pointer text-[var(--soft-bordeaux)]">Открыть</summary>
                        <div className="mt-3 grid gap-3 xl:grid-cols-2">
                          <div className="space-y-2">
                            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">
                              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                              User/context to LLM
                            </p>
                            <div className="max-h-96 min-w-[28rem] space-y-2 overflow-auto rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3">
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
                            <pre className="max-h-72 min-w-[28rem] overflow-auto whitespace-pre-wrap rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3 text-xs leading-relaxed text-[var(--soft-ink)]">
                              {interaction.responseText ?? interaction.errorText ?? "Нет ответа"}
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}
