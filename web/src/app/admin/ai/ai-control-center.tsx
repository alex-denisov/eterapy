"use client";

import type { ReactNode } from "react";
import { useId, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Activity,
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronLeft,
  ChevronRight,
  ChevronsUpDown,
  DollarSign,
  GripVertical,
  KeyRound,
  MessageSquareText,
  Plus,
  RefreshCw,
  Save,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  MODEL_PRICING_REFERENCE_USD_PER_MILLION,
  getReferenceModelPricing,
} from "@/lib/ai-gateway/model-pricing-reference";

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

type ModelCostRow = {
  provider: AIProvider;
  model: ModelRow;
  providerConfig?: ProviderRow;
  pricing: ReturnType<typeof modelPricing> | null;
};

type UsageTableRow = UsageDetailRow;

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
const TABLE_PAGE_SIZE = 25;
const COMPACT_INPUT_CLASS = "h-7 w-full min-w-0 border-0 border-t border-[var(--soft-paper-edge)] bg-white px-1.5 text-[11px] text-[var(--soft-ink)] outline-none focus:bg-white focus:ring-1 focus:ring-[var(--soft-bordeaux)]";
const COMPACT_SELECT_CLASS = "h-7 w-full min-w-0 border-0 border-t border-[var(--soft-paper-edge)] bg-white px-1.5 text-[11px] text-[var(--soft-ink)] outline-none focus:bg-white focus:ring-1 focus:ring-[var(--soft-bordeaux)]";
const COMPACT_CELL_CLASS = "border-r border-[var(--soft-paper-edge)] px-1.5 py-1 align-top";
const COMPACT_HEADER_CLASS = "border-r border-[var(--soft-paper-edge)] p-0 align-top font-medium";

type SortDirection = "asc" | "desc";
type SortState<K extends string> = { key: K; direction: SortDirection };

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

function clampPage(page: number, totalPages: number) {
  return Math.min(Math.max(page, 1), Math.max(totalPages, 1));
}

function pageCount(total: number) {
  return Math.max(1, Math.ceil(total / TABLE_PAGE_SIZE));
}

function paginate<T>(rows: T[], page: number) {
  const safePage = clampPage(page, pageCount(rows.length));
  return rows.slice((safePage - 1) * TABLE_PAGE_SIZE, safePage * TABLE_PAGE_SIZE);
}

function compareText(a: unknown, b: unknown, direction: SortDirection) {
  const result = String(a ?? "").localeCompare(String(b ?? ""), "ru", { numeric: true, sensitivity: "base" });
  return direction === "asc" ? result : -result;
}

function compareNumber(a: unknown, b: unknown, direction: SortDirection) {
  const parsedLeft = typeof a === "number" ? a : Number(a ?? 0);
  const parsedRight = typeof b === "number" ? b : Number(b ?? 0);
  const left = Number.isFinite(parsedLeft) ? parsedLeft : 0;
  const right = Number.isFinite(parsedRight) ? parsedRight : 0;
  const result = left - right;
  return direction === "asc" ? result : -result;
}

function nextDirection(current: SortDirection) {
  return current === "asc" ? "desc" : "asc";
}

function matchesFilter(value: unknown, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return String(value ?? "").toLowerCase().includes(normalized);
}

function productFromFeature(feature: string) {
  if (feature.startsWith("product-")) return feature.replace(/^product-/, "");
  if (feature.startsWith("dialogue-")) return "dialogue";
  if (feature.startsWith("session-")) return "session";
  if (feature.startsWith("video-")) return "video";
  if (feature.startsWith("modality-")) return feature.replace(/^modality-/, "modality:");
  return "platform";
}

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

function modelCatalogPricing(model: ModelRow, provider?: AIProvider) {
  if (model.isFree) {
    return {
      source: "free",
      inputUsdPerMillion: 0,
      outputUsdPerMillion: 0,
    };
  }
  if (model.inputTokenCostMicros != null || model.outputTokenCostMicros != null) {
    return {
      source: "model",
      inputUsdPerMillion: (model.inputTokenCostMicros ?? 0) / 1000,
      outputUsdPerMillion: (model.outputTokenCostMicros ?? 0) / 1000,
    };
  }
  if (provider) {
    const reference = getReferenceModelPricing(provider, model.modelId);
    if (reference) {
      return {
        source: reference.source ?? "reference",
        inputUsdPerMillion: reference.input,
        outputUsdPerMillion: reference.output,
      };
    }
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
  return modelCatalogPricing(model, provider?.provider) ?? providerDefaultPricing(provider);
}

function modelPricingLabel(model: ModelRow, provider?: ProviderRow) {
  const pricing = modelPricing(model, provider);
  if (!pricing) return null;
  return `${pricing.source}: ${formatUsdAmount(pricing.inputUsdPerMillion)} in / ${formatUsdAmount(pricing.outputUsdPerMillion)} out за 1M токенов`;
}

function providerOrderWithAllProviders(order?: AIProvider[] | null) {
  const seen = new Set<AIProvider>();
  const clean = (order ?? []).filter((provider): provider is AIProvider => PROVIDERS.includes(provider)).filter((provider) => {
    if (seen.has(provider)) return false;
    seen.add(provider);
    return true;
  });
  return [...clean, ...PROVIDERS.filter((provider) => !seen.has(provider))];
}

const CHEAP_MODEL_CANDIDATES: Record<AIProvider, string[]> = {
  [AIProvider.OPENROUTER]: ["openrouter/free", "meta-llama/llama-3.1-8b-instruct:free", "google/gemini-2.0-flash-exp:free"],
  [AIProvider.GROQ]: ["llama-3.1-8b-instant", "openai/gpt-oss-20b", "qwen/qwen3-32b"],
  [AIProvider.MISTRAL]: ["mistral-small-latest", "ministral-8b-latest", "ministral-3b-latest"],
  [AIProvider.GEMINI]: ["gemini-2.5-flash-lite", "gemini-2.0-flash", "gemini-2.5-flash"],
  [AIProvider.CEREBRAS]: ["gpt-oss-120b", "qwen-3-32b", "zai-glm-4.7"],
  [AIProvider.COHERE]: ["command-r7b-12-2024", "command-r", "command-r-08-2024"],
  [AIProvider.OPENAI]: ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1-nano"],
  [AIProvider.ANTHROPIC]: ["claude-3-5-haiku-20241022", "claude-3-haiku-20240307"],
  [AIProvider.FIREWORKS]: ["accounts/fireworks/models/qwen3-30b-a3b", "accounts/fireworks/models/gpt-oss-120b", "accounts/fireworks/models/llama-v3p1-8b-instruct"],
};

const PREMIUM_MODEL_CANDIDATES: Record<AIProvider, string[]> = {
  [AIProvider.OPENROUTER]: ["openrouter/free", "anthropic/claude-3.5-haiku:free", "meta-llama/llama-3.3-70b-instruct:free"],
  [AIProvider.GROQ]: ["llama-3.3-70b-versatile", "qwen/qwen3-32b", "openai/gpt-oss-120b"],
  [AIProvider.MISTRAL]: ["mistral-small-latest", "mistral-medium-latest", "mistral-large-latest"],
  [AIProvider.GEMINI]: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.5-pro"],
  [AIProvider.CEREBRAS]: ["gpt-oss-120b", "zai-glm-4.7", "qwen-3-32b"],
  [AIProvider.COHERE]: ["command-r", "command-r-08-2024", "command-a-03-2025"],
  [AIProvider.OPENAI]: ["gpt-4.1-mini", "gpt-4o-mini", "gpt-4.1"],
  [AIProvider.ANTHROPIC]: ["claude-3-5-haiku-20241022", "claude-sonnet-4-5", "claude-3-5-sonnet-20241022"],
  [AIProvider.FIREWORKS]: ["accounts/fireworks/models/gpt-oss-120b", "accounts/fireworks/models/qwen3-coder-480b-a35b-instruct", "accounts/fireworks/models/kimi-k2p6"],
};

const SENSITIVE_MODEL_CANDIDATES: Record<AIProvider, string[]> = {
  ...PREMIUM_MODEL_CANDIDATES,
  [AIProvider.OPENROUTER]: ["openrouter/free"],
  [AIProvider.GROQ]: ["openai/gpt-oss-safeguard-20b", "llama-3.3-70b-versatile", "openai/gpt-oss-120b"],
  [AIProvider.GEMINI]: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite"],
  [AIProvider.OPENAI]: ["gpt-4.1-mini", "gpt-4.1", "gpt-4o-mini"],
};

function candidateModelsForPolicy(provider: AIProvider, policy: PolicyRow) {
  if (policy.tier === "free" || policy.tier === "cheap") return CHEAP_MODEL_CANDIDATES[provider];
  if (policy.tier === "sensitive" || policy.tier === "vision" || policy.tier === "speech" || policy.tier === "compliance") {
    return SENSITIVE_MODEL_CANDIDATES[provider];
  }
  return PREMIUM_MODEL_CANDIDATES[provider];
}

function pickRecommendedModel(provider: AIProvider, policy: PolicyRow, providerModels: ModelRow[]) {
  const candidates = candidateModelsForPolicy(provider, policy);
  const modelIds = new Set(providerModels.map((model) => model.modelId));
  const direct = candidates.find((candidate) => modelIds.has(candidate));
  if (direct) return direct;
  if (provider === AIProvider.OPENROUTER) {
    const freeModel = providerModels.find((model) => model.modelId === "openrouter/free")
      ?? providerModels.find((model) => model.isFree || model.modelId.endsWith(":free"));
    return freeModel?.modelId ?? candidates[0] ?? "";
  }
  return candidates[0] ?? providerModels[0]?.modelId ?? "";
}

function modelPreferencesWithRecommendations(policy: PolicyRow, models: ModelsByProvider) {
  const next: Partial<Record<AIProvider, string>> = { ...(policy.modelPreferences ?? {}) };
  for (const provider of PROVIDERS) {
    if (!next[provider]) next[provider] = pickRecommendedModel(provider, policy, models[provider] ?? []);
  }
  return next;
}

function referenceModelRows(provider: AIProvider, existingModels: ModelRow[]) {
  const existing = new Set(existingModels.map((model) => model.modelId));
  return Object.entries(MODEL_PRICING_REFERENCE_USD_PER_MILLION[provider] ?? {})
    .filter(([modelId]) => !existing.has(modelId))
    .map(([modelId, pricing]): ModelRow => ({
      modelId,
      displayName: "Reference price",
      isFree: pricing.input === 0 && pricing.output === 0,
      contextWindow: null,
      inputTokenCostMicros: null,
      outputTokenCostMicros: null,
      fetchedAt: "reference",
      metadata: null,
    }));
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

function SoftBadge({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${className}`}>
      {children}
    </span>
  );
}

function CompactTableShell({
  children,
  minWidth = "1180px",
}: {
  children: ReactNode;
  minWidth?: string;
}) {
  return (
    <div className="max-w-full overflow-hidden rounded-md border border-[var(--soft-paper-edge)] bg-white">
      <div className="max-w-full overflow-auto">
        <table className="w-full border-collapse text-left text-[11px] leading-tight" style={{ minWidth }}>
          {children}
        </table>
      </div>
    </div>
  );
}

function CompactHeader({
  label,
  sortKey,
  activeSortKey,
  direction,
  onSort,
  children,
}: {
  label: string;
  sortKey?: string;
  activeSortKey?: string;
  direction?: SortDirection;
  onSort?: (key: string) => void;
  children?: ReactNode;
}) {
  const active = sortKey && activeSortKey === sortKey;
  return (
    <th className={COMPACT_HEADER_CLASS} scope="col">
      <button
        type="button"
        disabled={!sortKey || !onSort}
        onClick={() => sortKey && onSort?.(sortKey)}
        className="flex h-7 w-full items-center justify-between gap-1 px-1.5 text-left text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)] disabled:cursor-default"
      >
        <span>{label}</span>
        {sortKey && (
          <ChevronsUpDown
            className={`h-3 w-3 ${active ? "text-[var(--soft-bordeaux)]" : "text-[var(--soft-ink-soft)]"}`}
            aria-hidden="true"
          />
        )}
        {active && <span className="sr-only">sorted {direction}</span>}
      </button>
      {children}
    </th>
  );
}

function PaginationBar({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const totalPages = pageCount(total);
  const safePage = clampPage(page, totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * TABLE_PAGE_SIZE + 1;
  const end = Math.min(safePage * TABLE_PAGE_SIZE, total);
  return (
    <div className="flex items-center justify-between gap-2 border-t border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-2 py-1 text-[11px] text-[var(--soft-ink-soft)]">
      <span>{start}-{end} из {total}</span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          disabled={safePage <= 1}
          onClick={() => onPage(safePage - 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--soft-paper-edge)] bg-white disabled:opacity-40"
          aria-label="Предыдущая страница"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        <span className="min-w-14 text-center">{safePage}/{totalPages}</span>
        <button
          type="button"
          disabled={safePage >= totalPages}
          onClick={() => onPage(safePage + 1)}
          className="inline-flex h-7 w-7 items-center justify-center rounded border border-[var(--soft-paper-edge)] bg-white disabled:opacity-40"
          aria-label="Следующая страница"
        >
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
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
  recommendedValue,
}: {
  value: string;
  models: ModelRow[];
  provider?: ProviderRow;
  onChange: (value: string) => void;
  placeholder?: string;
  recommendedValue?: string;
}) {
  const datalistId = useId();
  const recommended = recommendedValue && recommendedValue !== value ? recommendedValue : null;
  return (
    <div className="grid gap-1">
      <input
        value={value}
        list={datalistId}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder ?? "Начните вводить model id"}
        className="h-7 w-full min-w-0 rounded-sm border border-[var(--soft-paper-edge)] bg-white px-1.5 font-mono text-[11px] text-[var(--soft-ink)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--soft-bordeaux)]"
        spellCheck={false}
      />
      <datalist id={datalistId}>
        {recommended && <option value={recommended}>recommended</option>}
        {models.slice(0, 500).map((model) => {
          const pricingLabel = modelPricingLabel(model, provider);
          const label = [
            model.isFree ? "Free" : null,
            model.displayName,
            pricingLabel,
          ].filter(Boolean).join(" · ");
          return <option key={model.modelId} value={model.modelId}>{label}</option>;
        })}
      </datalist>
      {recommended && (
        <button
          type="button"
          className="w-fit text-left text-[10px] text-[var(--soft-bordeaux)] underline-offset-2 hover:underline"
          onClick={() => onChange(recommended)}
        >
          Рекомендовано: {recommended}
        </button>
      )}
      {models.length === 0 && (
        <span className="text-[10px] text-[var(--soft-ink-soft)]">Каталог пуст, можно ввести model id вручную.</span>
      )}
    </div>
  );
}

function ModelCostTableRow({
  row,
  onSavePricing,
}: {
  row: ModelCostRow;
  onSavePricing: (provider: AIProvider, modelId: string, inputTokenCostMicros: number | null, outputTokenCostMicros: number | null) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState({
    input: row.model.inputTokenCostMicros ?? "",
    output: row.model.outputTokenCostMicros ?? "",
  });
  return (
    <tr data-testid={`ai-model-cost-${row.provider}-${row.model.modelId}`}>
      <td className={COMPACT_CELL_CLASS}>{row.provider}</td>
      <td className={`${COMPACT_CELL_CLASS} max-w-[28rem] break-all font-mono text-[var(--soft-ink)]`}>
        {row.model.isFree ? "Free · " : ""}{row.model.modelId}
      </td>
      <td className={`${COMPACT_CELL_CLASS} max-w-[18rem] whitespace-normal break-words text-[var(--soft-ink-soft)]`}>
        {row.model.displayName ?? "-"}
      </td>
      <td className={COMPACT_CELL_CLASS}>{row.model.contextWindow ? formatTokens(row.model.contextWindow) : "-"}</td>
      <td className={COMPACT_CELL_CLASS}>{row.pricing?.source ?? "provider default"}</td>
      <td className={COMPACT_CELL_CLASS}>{formatUsdAmount(row.pricing?.inputUsdPerMillion ?? 0)}</td>
      <td className={COMPACT_CELL_CLASS}>{formatUsdAmount(row.pricing?.outputUsdPerMillion ?? 0)}</td>
      <td className={COMPACT_CELL_CLASS}>
        <input
          value={draft.input}
          type="number"
          placeholder="input"
          onChange={(event) => setDraft({ ...draft, input: event.target.value === "" ? "" : Number(event.target.value) })}
          className={COMPACT_INPUT_CLASS}
          aria-label={`${row.provider} ${row.model.modelId} input price micros`}
        />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input
          value={draft.output}
          type="number"
          placeholder="output"
          onChange={(event) => setDraft({ ...draft, output: event.target.value === "" ? "" : Number(event.target.value) })}
          className={COMPACT_INPUT_CLASS}
          aria-label={`${row.provider} ${row.model.modelId} output price micros`}
        />
      </td>
      <td className={COMPACT_CELL_CLASS}>{row.model.fetchedAt === "reference" ? "reference seed" : formatDate(row.model.fetchedAt)}</td>
      <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onSavePricing(
            row.provider,
            row.model.modelId,
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
      <td className={COMPACT_CELL_CLASS}>
        <div className="font-semibold text-[var(--soft-ink)]">{provider.displayName}</div>
        <div className="mt-1 font-mono text-[11px] text-[var(--soft-ink-soft)]">{provider.provider}</div>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <div className="flex flex-col gap-1">
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
      <td className={COMPACT_CELL_CLASS}>
        <input value={draft.priority} type="number" onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })} aria-label={`${provider.provider} priority`} className={COMPACT_INPUT_CLASS} />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input value={draft.timeoutMs} type="number" onChange={(event) => setDraft({ ...draft, timeoutMs: Number(event.target.value) })} aria-label={`${provider.provider} timeout`} className={COMPACT_INPUT_CLASS} />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <ModelSelect
          value={draft.defaultModel}
          models={models}
          provider={provider}
          onChange={(value) => setDraft({ ...draft, defaultModel: value })}
          placeholder="Модель по умолчанию"
        />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input
          value={draft.baseUrl}
          onChange={(event) => setDraft({ ...draft, baseUrl: event.target.value })}
          className={`${COMPACT_INPUT_CLASS} min-w-[20rem] font-mono`}
          aria-label={`${provider.provider} base URL`}
        />
        {cfUrl && <div className="mt-1 max-w-[26rem] break-all text-[10px] text-[var(--soft-ink-soft)]">CF: {cfUrl}</div>}
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <div className="grid min-w-[10rem] grid-cols-2 gap-1">
          <input value={draft.inputTokenCostMicros} type="number" onChange={(event) => setDraft({ ...draft, inputTokenCostMicros: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="input" aria-label={`${provider.provider} input cost`} className={COMPACT_INPUT_CLASS} />
          <input value={draft.outputTokenCostMicros} type="number" onChange={(event) => setDraft({ ...draft, outputTokenCostMicros: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="output" aria-label={`${provider.provider} output cost`} className={COMPACT_INPUT_CLASS} />
        </div>
      </td>
      <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
        <div className="flex flex-col gap-1">
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
      <td className={COMPACT_CELL_CLASS}>
        <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{credential.provider}</SoftBadge>
      </td>
      <td className={COMPACT_CELL_CLASS}><input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} className={COMPACT_INPUT_CLASS} /></td>
      <td className={COMPACT_CELL_CLASS}>
        <input
          value={draft.apiKey}
          onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
          placeholder={canViewSecrets ? credential.apiKeyPreview : `${credential.apiKeyPreview} - новый ключ`}
          type={canViewSecrets ? "text" : "password"}
          spellCheck={false}
          autoComplete="off"
          className={`${COMPACT_INPUT_CLASS} min-w-[20rem] font-mono`}
        />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <SoftBadge className={state.tone}>{state.label}</SoftBadge>
        {credential.lastErrorCode && <div className="mt-1 text-xs text-red-700">{credential.lastErrorCode}</div>}
        {credential.lastErrorMessage && <div className="mt-1 max-w-[24rem] whitespace-normal break-words text-xs text-red-700">{credential.lastErrorMessage}</div>}
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <label className="flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
          enabled
        </label>
      </td>
      <td className={COMPACT_CELL_CLASS}><input value={draft.priority} type="number" onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })} className={COMPACT_INPUT_CLASS} /></td>
      <td className={COMPACT_CELL_CLASS}>
        <ModelSelect value={draft.modelOverride} models={models} provider={provider} onChange={(value) => setDraft({ ...draft, modelOverride: value })} placeholder="Override модели" />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input value={draft.baseUrlOverride} onChange={(event) => setDraft({ ...draft, baseUrlOverride: event.target.value })} placeholder="Base URL ключа" className={`${COMPACT_INPUT_CLASS} min-w-[20rem] font-mono`} />
      </td>
      <td className={`${COMPACT_CELL_CLASS} text-xs text-[var(--soft-ink-soft)]`}>
        <div>успех: {formatDate(credential.lastSuccessAt)}</div>
        <div>ошибка: {formatDate(credential.lastErrorAt)}</div>
        {credential.consecutiveFailures > 0 && <div className="text-red-700">{credential.consecutiveFailures} подряд</div>}
      </td>
      <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
        <div className="flex flex-col gap-1">
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
  errorCount,
  disabled,
  onSave,
}: {
  policy: PolicyRow;
  providers: ProviderRow[];
  models: ModelsByProvider;
  errorCount: number;
  disabled: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState({
    enabled: policy.enabled,
    providerOrder: providerOrderWithAllProviders(policy.providerOrder),
    modelPreferences: modelPreferencesWithRecommendations(policy, models),
    maxTokens: policy.maxTokens ?? "",
    temperature: policy.temperature ?? "",
    timeoutMs: policy.timeoutMs ?? "",
    dailyTokenBudget: policy.dailyTokenBudget ?? "",
    perUserDailyTokenBudget: policy.perUserDailyTokenBudget ?? "",
  });
  const [draggedProvider, setDraggedProvider] = useState<AIProvider | null>(null);
  const providerConfigById = useMemo(() => new Map(providers.map((provider) => [provider.provider, provider])), [providers]);
  const product = productFromFeature(policy.feature);

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
      <td className={COMPACT_CELL_CLASS}>
        <span className="font-mono text-[var(--soft-ink)]">{product}</span>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <div className="max-w-[15rem] whitespace-normal break-words font-medium text-[var(--soft-ink)]">{policy.title ?? policy.feature}</div>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <div className="max-w-[16rem] break-all font-mono text-[var(--soft-ink-soft)]">{policy.feature}</div>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <div className="max-w-[24rem] whitespace-normal break-words text-[var(--soft-ink-soft)]">{policy.purpose ?? "-"}</div>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{policy.tier ?? "-"}</SoftBadge>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{policy.source ?? "default"}</SoftBadge>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <label className="flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
          active
        </label>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <div className="grid min-w-[34rem] gap-1">
          {draft.providerOrder.map((provider, index) => (
            <div
              key={provider}
              draggable
              onDragStart={() => setDraggedProvider(provider)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => dropOn(provider)}
              className="grid grid-cols-[7rem_1fr_3.5rem] items-center gap-1"
              title="Перетащите, чтобы изменить порядок"
            >
              <div className="inline-flex min-w-0 items-center gap-1 rounded border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-1 py-0.5 font-mono text-[10px] text-[var(--soft-ink)]">
                <GripVertical className="h-3 w-3 shrink-0 text-[var(--soft-ink-soft)]" aria-hidden="true" />
                <span className="truncate">{index + 1}. {provider}</span>
              </div>
              <ModelSelect
                value={draft.modelPreferences[provider] ?? ""}
                models={models[provider] ?? []}
                provider={providerConfigById.get(provider)}
                onChange={(value) => updateModel(provider, value)}
                placeholder="модель провайдера"
                recommendedValue={pickRecommendedModel(provider, policy, models[provider] ?? [])}
              />
              <span className="inline-flex items-center justify-end gap-0.5">
                <button type="button" onClick={() => moveProvider(provider, -1)} disabled={index === 0} aria-label={`Поднять ${provider}`} className="rounded border border-[var(--soft-paper-edge)] bg-white p-0.5 disabled:opacity-35"><ArrowUp className="h-3 w-3" /></button>
                <button type="button" onClick={() => moveProvider(provider, 1)} disabled={index === draft.providerOrder.length - 1} aria-label={`Опустить ${provider}`} className="rounded border border-[var(--soft-paper-edge)] bg-white p-0.5 disabled:opacity-35"><ArrowDown className="h-3 w-3" /></button>
              </span>
            </div>
          ))}
        </div>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input value={draft.maxTokens} type="number" onChange={(event) => setDraft({ ...draft, maxTokens: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="max" className={COMPACT_INPUT_CLASS} />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input value={draft.temperature} type="number" step="0.1" onChange={(event) => setDraft({ ...draft, temperature: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="temp" className={COMPACT_INPUT_CLASS} />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input value={draft.timeoutMs} type="number" onChange={(event) => setDraft({ ...draft, timeoutMs: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="timeout" className={COMPACT_INPUT_CLASS} />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input value={draft.dailyTokenBudget} type="number" onChange={(event) => setDraft({ ...draft, dailyTokenBudget: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="feature/day" className={COMPACT_INPUT_CLASS} />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input value={draft.perUserDailyTokenBudget} type="number" onChange={(event) => setDraft({ ...draft, perUserDailyTokenBudget: event.target.value === "" ? "" : Number(event.target.value) })} placeholder="user/day" className={COMPACT_INPUT_CLASS} />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <span className={errorCount > 0 ? "text-red-700" : "text-[var(--soft-ink-soft)]"}>{errorCount}</span>
      </td>
      <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
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

function PromptTableRow({
  prompt,
  disabled,
  onSave,
  onReset,
}: {
  prompt: PromptRow;
  disabled: boolean;
  onSave: (payload: {
    feature: string;
    title: string;
    productKey: string | null;
    promptText: string;
    enabled: boolean;
  }) => Promise<void> | void;
  onReset: () => Promise<void> | void;
}) {
  const [draft, setDraft] = useState({
    title: prompt.title,
    productKey: prompt.productKey ?? "",
    promptText: prompt.promptText,
    enabled: prompt.enabled,
  });
  return (
    <tr data-testid={`ai-prompt-${prompt.feature}`}>
      <td className={COMPACT_CELL_CLASS}>
        <div className="max-w-[14rem] whitespace-normal break-words font-medium text-[var(--soft-ink)]">{prompt.feature}</div>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input
          value={draft.title}
          onChange={(event) => setDraft({ ...draft, title: event.target.value })}
          className={`${COMPACT_INPUT_CLASS} min-w-[16rem]`}
          aria-label={`${prompt.feature} title`}
        />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input
          value={draft.productKey}
          onChange={(event) => setDraft({ ...draft, productKey: event.target.value })}
          className={`${COMPACT_INPUT_CLASS} min-w-[10rem]`}
          aria-label={`${prompt.feature} product key`}
        />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <label className="flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
          enabled
        </label>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{prompt.source === "database" ? "custom" : "default"}</SoftBadge>
      </td>
      <td className={`${COMPACT_CELL_CLASS} text-[var(--soft-ink-soft)]`}>{formatDate(prompt.updatedAt)}</td>
      <td className={COMPACT_CELL_CLASS}>
        <textarea
          value={draft.promptText}
          onChange={(event) => setDraft({ ...draft, promptText: event.target.value })}
          className="min-h-28 w-full min-w-[46rem] resize-y border-0 border-t border-[var(--soft-paper-edge)] bg-white px-1.5 py-1 font-mono text-[11px] leading-snug text-[var(--soft-ink)] outline-none focus:bg-white focus:ring-1 focus:ring-[var(--soft-bordeaux)]"
          spellCheck={false}
          aria-label={`${prompt.feature} prompt text`}
        />
      </td>
      <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
        <div className="flex flex-col gap-1">
          {prompt.source === "database" && (
            <Button type="button" size="sm" variant="outline" disabled={disabled} onClick={() => { void onReset(); }}>
              Сброс
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            disabled={disabled}
            onClick={() => {
              void onSave({
                feature: prompt.feature,
                title: draft.title,
                productKey: draft.productKey.trim() || null,
                promptText: draft.promptText,
                enabled: draft.enabled,
              });
            }}
          >
            <Save className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
            Save
          </Button>
        </div>
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
  const [credentialOverrides, setCredentialOverrides] = useState<Record<string, CredentialRow>>({});
  const [policyFilters, setPolicyFilters] = useState({
    product: "",
    title: "",
    feature: "",
    purpose: "",
    tier: "",
    source: "",
    status: "all",
    provider: "all",
  });
  const [policySort, setPolicySort] = useState<SortState<"product" | "title" | "feature" | "purpose" | "tier" | "source" | "status" | "errors">>({ key: "product", direction: "asc" });
  const [policyPage, setPolicyPage] = useState(1);
  const [promptFilters, setPromptFilters] = useState({
    feature: "",
    title: "",
    productKey: "",
    source: "all",
    status: "all",
    promptText: "",
  });
  const [promptSort, setPromptSort] = useState<SortState<"feature" | "title" | "productKey" | "source" | "status" | "updatedAt">>({ key: "feature", direction: "asc" });
  const [promptPage, setPromptPage] = useState(1);
  const [modelCostFilters, setModelCostFilters] = useState({
    provider: "all",
    model: "",
    source: "all",
    free: "all",
  });
  const [modelCostSort, setModelCostSort] = useState<SortState<"provider" | "model" | "context" | "source" | "input" | "output" | "fetchedAt">>({ key: "provider", direction: "asc" });
  const [modelCostPage, setModelCostPage] = useState(1);
  const [usageFilters, setUsageFilters] = useState({
    feature: "",
    provider: "all",
    model: "",
    status: "all",
  });
  const [usageSort, setUsageSort] = useState<SortState<"feature" | "provider" | "model" | "status" | "requests" | "tokens" | "cost" | "latency">>({ key: "tokens", direction: "desc" });
  const [usagePage, setUsagePage] = useState(1);
  const [interactionFilters, setInteractionFilters] = useState({
    createdAt: "",
    feature: "",
    user: "",
    status: "all",
    provider: "all",
    answer: "",
  });
  const [interactionSort, setInteractionSort] = useState<SortState<"createdAt" | "feature" | "user" | "status" | "provider" | "tokens" | "cost">>({ key: "createdAt", direction: "desc" });
  const [interactionPage, setInteractionPage] = useState(1);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const providerById = useMemo(() => new Map(providers.map((provider) => [provider.provider, provider])), [providers]);
  const visibleCredentials = useMemo(
    () => credentials.map((credential) => credentialOverrides[credential.id] ?? credential),
    [credentialOverrides, credentials],
  );

  const featureErrors = useMemo(() => usageDetails
    .filter((row) => row.status !== "SUCCEEDED" && row.status !== "RUNNING")
    .reduce<Record<string, number>>((acc, row) => {
      acc[row.feature] = (acc[row.feature] ?? 0) + row.attemptCount;
      return acc;
    }, {}), [usageDetails]);

  const usageTableRows = useMemo(() => {
    const rows = new Map<string, UsageTableRow>();
    const latency = new Map<string, { total: number; count: number }>();
    const authoritativeUsageKeys = new Set<string>();

    for (const row of usageDetails) {
      const key = `${row.feature}:${row.provider}:${row.model}:${row.status}`;
      authoritativeUsageKeys.add(key);
      rows.set(key, { ...row });
      if (row.avgLatencyMs != null) latency.set(key, { total: row.avgLatencyMs, count: 1 });
    }

    function ensureRow(input: {
      feature: string;
      provider: string;
      model: string;
      status: string;
      latencyMs: number | null;
    }) {
      const key = `${input.feature}:${input.provider}:${input.model}:${input.status}`;
      if (!rows.has(key)) {
        rows.set(key, {
          feature: input.feature,
          provider: input.provider,
          model: input.model,
          status: input.status,
          requestCount: 0,
          attemptCount: 0,
          successCount: 0,
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          costMicros: 0,
          avgLatencyMs: null,
        });
      }
      if (input.latencyMs != null) {
        const current = latency.get(key) ?? { total: 0, count: 0 };
        current.total += input.latencyMs;
        current.count += 1;
        latency.set(key, current);
      }
      return rows.get(key)!;
    }

    for (const interaction of interactions) {
      if (interaction.attempts.length === 0) {
        const provider = interaction.responseProvider ?? "NO_PROVIDER";
        const model = interaction.responseModel ?? "NO_MODEL";
        const key = `${interaction.feature}:${provider}:${model}:${interaction.status}`;
        if (authoritativeUsageKeys.has(key)) continue;
        const row = ensureRow({
          feature: interaction.feature,
          provider,
          model,
          status: interaction.status,
          latencyMs: null,
        });
        row.requestCount += 1;
        row.attemptCount += 1;
        row.successCount += interaction.status === "SUCCEEDED" ? 1 : 0;
        row.promptTokens += interaction.promptTokens;
        row.completionTokens += interaction.completionTokens;
        row.totalTokens += interaction.totalTokens;
        row.costMicros += interaction.estimatedCostMicros;
        continue;
      }

      for (const attempt of interaction.attempts) {
        const key = `${interaction.feature}:${attempt.provider}:${attempt.model}:${attempt.status}`;
        if (authoritativeUsageKeys.has(key)) continue;
        const row = ensureRow({
          feature: interaction.feature,
          provider: attempt.provider,
          model: attempt.model,
          status: attempt.status,
          latencyMs: attempt.latencyMs,
        });
        row.requestCount += 1;
        row.attemptCount += 1;
        row.successCount += attempt.status === "SUCCEEDED" ? 1 : 0;
        row.totalTokens += attempt.totalTokens;
        row.costMicros += attempt.estimatedCostMicros;
      }
    }

    for (const [key, value] of latency) {
      const row = rows.get(key);
      if (row && value.count > 0) row.avgLatencyMs = Math.round(value.total / value.count);
    }
    return Array.from(rows.values());
  }, [interactions, usageDetails]);

  const totals = useMemo(() => {
    const global = usage.find((row) => row.scopeType === "global" && row.scopeKey === "all");
    const activeKeys = visibleCredentials.filter((credential) => credential.enabled && keyState(credential).label === "активен").length;
    const failedKeys = visibleCredentials.filter((credential) => keyState(credential).label === "ошибка" || credential.regionBlocked).length;
    const llmErrors = usageTableRows.filter((row) => row.status !== "SUCCEEDED" && row.status !== "RUNNING").reduce((sum, row) => sum + row.attemptCount, 0);
    return {
      tokens: global?.tokens ?? usageTableRows.reduce((sum, row) => sum + row.totalTokens, 0),
      costMicros: global?.costMicros ?? usageTableRows.reduce((sum, row) => sum + row.costMicros, 0),
      requests: global?.requestCount ?? usageTableRows.reduce((sum, row) => sum + row.requestCount, 0),
      activeKeys,
      failedKeys,
      llmErrors,
    };
  }, [usage, usageTableRows, visibleCredentials]);

  const modelCostRows = useMemo(() => {
    return PROVIDERS.flatMap((provider) => {
      const providerModels = models[provider] ?? [];
      return [...providerModels, ...referenceModelRows(provider, providerModels)].map((model) => ({
        provider,
        model,
        providerConfig: providerById.get(provider),
        pricing: modelPricing(model, providerById.get(provider)),
      } satisfies ModelCostRow));
    });
  }, [models, providerById]);

  const filteredModelCostRows = useMemo(() => {
    const sorted = modelCostRows
      .filter((row) => modelCostFilters.provider === "all" || row.provider === modelCostFilters.provider)
      .filter((row) => modelCostFilters.source === "all" || (row.pricing?.source ?? "provider default") === modelCostFilters.source)
      .filter((row) => modelCostFilters.free === "all" || (modelCostFilters.free === "free" ? row.model.isFree : !row.model.isFree))
      .filter((row) => matchesFilter(`${row.model.modelId} ${row.model.displayName ?? ""}`, modelCostFilters.model));
    sorted.sort((a, b) => {
      if (modelCostSort.key === "model") return compareText(a.model.modelId, b.model.modelId, modelCostSort.direction);
      if (modelCostSort.key === "context") return compareNumber(a.model.contextWindow ?? 0, b.model.contextWindow ?? 0, modelCostSort.direction);
      if (modelCostSort.key === "source") return compareText(a.pricing?.source, b.pricing?.source, modelCostSort.direction);
      if (modelCostSort.key === "input") return compareNumber(a.pricing?.inputUsdPerMillion ?? 0, b.pricing?.inputUsdPerMillion ?? 0, modelCostSort.direction);
      if (modelCostSort.key === "output") return compareNumber(a.pricing?.outputUsdPerMillion ?? 0, b.pricing?.outputUsdPerMillion ?? 0, modelCostSort.direction);
      if (modelCostSort.key === "fetchedAt") return compareNumber(Date.parse(a.model.fetchedAt), Date.parse(b.model.fetchedAt), modelCostSort.direction);
      return compareText(a.provider, b.provider, modelCostSort.direction);
    });
    return sorted;
  }, [modelCostFilters, modelCostRows, modelCostSort]);

  const filteredPolicies = useMemo(() => {
    const sorted = policies
      .filter((policy) => matchesFilter(productFromFeature(policy.feature), policyFilters.product))
      .filter((policy) => matchesFilter(policy.title ?? policy.feature, policyFilters.title))
      .filter((policy) => matchesFilter(policy.feature, policyFilters.feature))
      .filter((policy) => matchesFilter(policy.purpose, policyFilters.purpose))
      .filter((policy) => matchesFilter(policy.tier, policyFilters.tier))
      .filter((policy) => matchesFilter(policy.source ?? "default", policyFilters.source))
      .filter((policy) => policyFilters.status === "all" || (policyFilters.status === "active" ? policy.enabled : !policy.enabled))
      .filter((policy) => policyFilters.provider === "all" || policy.providerOrder.includes(policyFilters.provider as AIProvider) || Boolean(policy.modelPreferences?.[policyFilters.provider as AIProvider]));
    sorted.sort((a, b) => {
      if (policySort.key === "title") return compareText(a.title ?? a.feature, b.title ?? b.feature, policySort.direction);
      if (policySort.key === "feature") return compareText(a.feature, b.feature, policySort.direction);
      if (policySort.key === "purpose") return compareText(a.purpose, b.purpose, policySort.direction);
      if (policySort.key === "tier") return compareText(a.tier, b.tier, policySort.direction);
      if (policySort.key === "source") return compareText(a.source, b.source, policySort.direction);
      if (policySort.key === "status") return compareText(a.enabled ? "active" : "off", b.enabled ? "active" : "off", policySort.direction);
      if (policySort.key === "errors") return compareNumber(featureErrors[a.feature] ?? 0, featureErrors[b.feature] ?? 0, policySort.direction);
      return compareText(productFromFeature(a.feature), productFromFeature(b.feature), policySort.direction);
    });
    return sorted;
  }, [featureErrors, policies, policyFilters, policySort]);

  const filteredPrompts = useMemo(() => {
    const sorted = prompts
      .filter((prompt) => matchesFilter(prompt.feature, promptFilters.feature))
      .filter((prompt) => matchesFilter(prompt.title, promptFilters.title))
      .filter((prompt) => matchesFilter(prompt.productKey, promptFilters.productKey))
      .filter((prompt) => promptFilters.source === "all" || prompt.source === promptFilters.source)
      .filter((prompt) => promptFilters.status === "all" || (promptFilters.status === "active" ? prompt.enabled : !prompt.enabled))
      .filter((prompt) => matchesFilter(prompt.promptText, promptFilters.promptText));
    sorted.sort((a, b) => {
      if (promptSort.key === "title") return compareText(a.title, b.title, promptSort.direction);
      if (promptSort.key === "productKey") return compareText(a.productKey, b.productKey, promptSort.direction);
      if (promptSort.key === "source") return compareText(a.source, b.source, promptSort.direction);
      if (promptSort.key === "status") return compareText(a.enabled ? "active" : "off", b.enabled ? "active" : "off", promptSort.direction);
      if (promptSort.key === "updatedAt") return compareNumber(a.updatedAt ? Date.parse(a.updatedAt) : 0, b.updatedAt ? Date.parse(b.updatedAt) : 0, promptSort.direction);
      return compareText(a.feature, b.feature, promptSort.direction);
    });
    return sorted;
  }, [promptFilters, prompts, promptSort]);

  const filteredUsageRows = useMemo(() => {
    const sorted = usageTableRows
      .filter((row) => matchesFilter(row.feature, usageFilters.feature))
      .filter((row) => usageFilters.provider === "all" || row.provider === usageFilters.provider)
      .filter((row) => matchesFilter(row.model, usageFilters.model))
      .filter((row) => usageFilters.status === "all" || row.status === usageFilters.status);
    sorted.sort((a, b) => {
      if (usageSort.key === "provider") return compareText(a.provider, b.provider, usageSort.direction);
      if (usageSort.key === "model") return compareText(a.model, b.model, usageSort.direction);
      if (usageSort.key === "status") return compareText(a.status, b.status, usageSort.direction);
      if (usageSort.key === "requests") return compareNumber(a.requestCount, b.requestCount, usageSort.direction);
      if (usageSort.key === "tokens") return compareNumber(a.totalTokens, b.totalTokens, usageSort.direction);
      if (usageSort.key === "cost") return compareNumber(a.costMicros, b.costMicros, usageSort.direction);
      if (usageSort.key === "latency") return compareNumber(a.avgLatencyMs ?? 0, b.avgLatencyMs ?? 0, usageSort.direction);
      return compareText(a.feature, b.feature, usageSort.direction);
    });
    return sorted;
  }, [usageFilters, usageSort, usageTableRows]);

  const filteredInteractions = useMemo(() => {
    const sorted = interactions
      .filter((interaction) => matchesFilter(formatDate(interaction.createdAt), interactionFilters.createdAt) || matchesFilter(interaction.createdAt, interactionFilters.createdAt))
      .filter((interaction) => matchesFilter(interaction.feature, interactionFilters.feature))
      .filter((interaction) => matchesFilter(`${interaction.userLabel ?? ""} ${interaction.userId ?? ""}`, interactionFilters.user))
      .filter((interaction) => interactionFilters.status === "all" || interaction.status === interactionFilters.status)
      .filter((interaction) => interactionFilters.provider === "all" || interaction.attempts.some((attempt) => attempt.provider === interactionFilters.provider) || interaction.responseProvider?.toUpperCase() === interactionFilters.provider)
      .filter((interaction) => {
        if (!interactionFilters.answer.trim()) return true;
        return [
          interaction.requestId,
          interaction.responseText,
          interaction.errorText,
          interaction.responseProvider,
          interaction.responseModel,
          ...interaction.messages.map((message) => JSON.stringify(message.content)),
        ].some((value) => matchesFilter(value, interactionFilters.answer));
      });

    sorted.sort((a, b) => {
      if (interactionSort.key === "feature") return compareText(a.feature, b.feature, interactionSort.direction);
      if (interactionSort.key === "user") return compareText(a.userLabel ?? a.userId, b.userLabel ?? b.userId, interactionSort.direction);
      if (interactionSort.key === "status") return compareText(a.status, b.status, interactionSort.direction);
      if (interactionSort.key === "provider") return compareText(a.responseProvider ?? a.attempts.at(-1)?.provider, b.responseProvider ?? b.attempts.at(-1)?.provider, interactionSort.direction);
      if (interactionSort.key === "tokens") return compareNumber(a.totalTokens, b.totalTokens, interactionSort.direction);
      if (interactionSort.key === "cost") return compareNumber(a.estimatedCostMicros, b.estimatedCostMicros, interactionSort.direction);
      return compareNumber(Date.parse(a.createdAt), Date.parse(b.createdAt), interactionSort.direction);
    });
    return sorted;
  }, [interactionFilters, interactionSort, interactions]);

  const pagedModelCostRows = paginate(filteredModelCostRows, modelCostPage);
  const pagedPolicies = paginate(filteredPolicies, policyPage);
  const pagedPrompts = paginate(filteredPrompts, promptPage);
  const pagedUsageRows = paginate(filteredUsageRows, usagePage);
  const pagedInteractions = paginate(filteredInteractions, interactionPage);

  function toggleModelCostSort(key: typeof modelCostSort.key) {
    setModelCostSort((current) => current.key === key ? { key, direction: nextDirection(current.direction) } : { key, direction: "asc" });
  }

  function togglePolicySort(key: typeof policySort.key) {
    setPolicySort((current) => current.key === key ? { key, direction: nextDirection(current.direction) } : { key, direction: "asc" });
  }

  function togglePromptSort(key: typeof promptSort.key) {
    setPromptSort((current) => current.key === key ? { key, direction: nextDirection(current.direction) } : { key, direction: "asc" });
  }

  function toggleUsageSort(key: typeof usageSort.key) {
    setUsageSort((current) => current.key === key ? { key, direction: nextDirection(current.direction) } : { key, direction: "asc" });
  }

  function toggleInteractionSort(key: typeof interactionSort.key) {
    setInteractionSort((current) => current.key === key ? { key, direction: nextDirection(current.direction) } : { key, direction: "asc" });
  }

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
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      reportError(body?.message ?? "Не удалось обновить ключ");
      return;
    }
    if (body?.credential?.id) {
      setCredentialOverrides((current) => ({ ...current, [body.credential.id]: body.credential }));
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
      if (body?.credential?.id) {
        setCredentialOverrides((current) => ({ ...current, [body.credential.id]: body.credential }));
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

  async function savePrompt(payload: {
    feature: string;
    title: string;
    productKey: string | null;
    promptText: string;
    enabled: boolean;
  }) {
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

  return (
    <div className="space-y-6" data-testid="admin-ai-control-center">
      <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4" data-testid="admin-ai-ops-metrics">
        <MetricCard icon={Activity} label="requests" value={formatTokens(totals.requests)} hint={`tokens ${formatTokens(totals.tokens)} today`} />
        <MetricCard icon={DollarSign} label="usd usage" value={formatUsdMicros(totals.costMicros)} hint="расчет по provider/model cost" />
        <MetricCard icon={KeyRound} label="api keys" value={`${totals.activeKeys}/${visibleCredentials.length}`} hint={`${totals.failedKeys} ключей в ошибке`} />
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
        <CompactTableShell minWidth="1320px">
          <thead className="bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Провайдер</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Статус</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Priority</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Timeout</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Default model</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Base URL</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Default price micros/1K</th>
              <th className={`${COMPACT_HEADER_CLASS} border-r-0 px-1.5 py-2`}>Действия</th>
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
        </CompactTableShell>
      </section>

      <section data-testid="admin-ai-credentials">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">API ключи</h2>
        <CompactTableShell minWidth="1680px">
          <thead className="bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Provider</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Label</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>API key</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Health</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Enabled</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Priority</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Model override</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Base URL override</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Мониторинг</th>
              <th className={`${COMPACT_HEADER_CLASS} border-r-0 px-1.5 py-2`}>Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {visibleCredentials.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">Ключи не настроены</td></tr>
            ) : visibleCredentials.map((credential) => {
              const providerConfig = providerById.get(credential.provider) ?? {
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
            <tr data-testid="ai-credentials-create-manual">
              <td colSpan={10} className="border-t border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] px-1.5 py-2">
                <form
                  className="grid gap-1 lg:grid-cols-[9rem_12rem_24rem_16rem_22rem_7rem_auto]"
                  action={(formData) => {
                    startTransition(() => { void createCredential(formData); });
                  }}
                >
                  <select name="provider" defaultValue={AIProvider.OPENROUTER} className={COMPACT_SELECT_CLASS} aria-label="Provider">
                    {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                  </select>
                  <input name="label" placeholder="Метка" required className={COMPACT_INPUT_CLASS} />
                  <input name="apiKey" placeholder="API ключ" type={canViewSecrets ? "text" : "password"} required className={`${COMPACT_INPUT_CLASS} font-mono`} autoComplete="off" />
                  <input name="modelOverride" placeholder="Model override" className={COMPACT_INPUT_CLASS} />
                  <input name="baseUrlOverride" placeholder="Base URL override" className={`${COMPACT_INPUT_CLASS} font-mono`} />
                  <input name="priority" type="number" placeholder="Priority" className={COMPACT_INPUT_CLASS} />
                  <Button type="submit" size="sm" disabled={!canViewSecrets || !encryptionConfigured || isPending}>
                    <Plus className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                    Добавить
                  </Button>
                </form>
              </td>
            </tr>
          </tbody>
        </CompactTableShell>
      </section>

      <section data-testid="admin-ai-model-costs">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Стоимость моделей провайдеров</h2>
        <CompactTableShell minWidth="1480px">
          <thead className="bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <CompactHeader label="Provider" sortKey="provider" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)}>
                <select value={modelCostFilters.provider} onChange={(event) => { setModelCostFilters({ ...modelCostFilters, provider: event.target.value }); setModelCostPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                </select>
              </CompactHeader>
              <CompactHeader label="Model" sortKey="model" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)}>
                <input value={modelCostFilters.model} onChange={(event) => { setModelCostFilters({ ...modelCostFilters, model: event.target.value }); setModelCostPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Display name</th>
              <CompactHeader label="Context" sortKey="context" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)} />
              <CompactHeader label="Source" sortKey="source" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)}>
                <select value={modelCostFilters.source} onChange={(event) => { setModelCostFilters({ ...modelCostFilters, source: event.target.value }); setModelCostPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="free">free</option>
                  <option value="model">model</option>
                  <option value="reference">reference</option>
                  <option value="reference/free">reference/free</option>
                  <option value="catalog">catalog</option>
                  <option value="provider default">provider default</option>
                </select>
              </CompactHeader>
              <CompactHeader label="Input $/1M" sortKey="input" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)} />
              <CompactHeader label="Output $/1M" sortKey="output" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)}>
                <select value={modelCostFilters.free} onChange={(event) => { setModelCostFilters({ ...modelCostFilters, free: event.target.value }); setModelCostPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="free">Free</option>
                  <option value="paid">Paid</option>
                </select>
              </CompactHeader>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Edit input micros/1K</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Edit output micros/1K</th>
              <CompactHeader label="Fetched" sortKey="fetchedAt" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)} />
              <th className={`${COMPACT_HEADER_CLASS} border-r-0 px-1.5 py-2`}>Save</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {pagedModelCostRows.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">Каталог моделей пуст по выбранным фильтрам</td></tr>
            ) : pagedModelCostRows.map((row) => (
              <ModelCostTableRow key={`${row.provider}:${row.model.modelId}`} row={row} onSavePricing={saveModelPricing} />
            ))}
          </tbody>
        </CompactTableShell>
        <PaginationBar page={modelCostPage} total={filteredModelCostRows.length} onPage={setModelCostPage} />
      </section>

      <section data-testid="admin-ai-policies">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Цепочки маршрутизации по продуктам</h2>
        <CompactTableShell minWidth="2100px">
          <thead className="sticky top-0 z-10 bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <CompactHeader label="Продукт" sortKey="product" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.product} onChange={(event) => { setPolicyFilters({ ...policyFilters, product: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Название" sortKey="title" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.title} onChange={(event) => { setPolicyFilters({ ...policyFilters, title: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Feature" sortKey="feature" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.feature} onChange={(event) => { setPolicyFilters({ ...policyFilters, feature: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Назначение" sortKey="purpose" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.purpose} onChange={(event) => { setPolicyFilters({ ...policyFilters, purpose: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Tier" sortKey="tier" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.tier} onChange={(event) => { setPolicyFilters({ ...policyFilters, tier: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Source" sortKey="source" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.source} onChange={(event) => { setPolicyFilters({ ...policyFilters, source: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Статус" sortKey="status" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <select value={policyFilters.status} onChange={(event) => { setPolicyFilters({ ...policyFilters, status: event.target.value }); setPolicyPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="active">active</option>
                  <option value="off">off</option>
                </select>
              </CompactHeader>
              <th className={`${COMPACT_HEADER_CLASS} p-0 align-top`}>
                <div className="px-1.5 py-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">Модели по провайдерам</div>
                <select value={policyFilters.provider} onChange={(event) => { setPolicyFilters({ ...policyFilters, provider: event.target.value }); setPolicyPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все провайдеры</option>
                  {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                </select>
              </th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Max tokens</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Temperature</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Timeout</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Feature budget</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>User budget</th>
              <CompactHeader label="Errors" sortKey="errors" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)} />
              <th className={`${COMPACT_HEADER_CLASS} border-r-0 px-1.5 py-2`}>Save</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {pagedPolicies.length === 0 ? (
              <tr><td colSpan={15} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">Цепочек по фильтрам нет</td></tr>
            ) : pagedPolicies.map((policy) => (
              <PolicyTableRow
                key={policy.feature}
                policy={policy}
                providers={providers}
                models={models}
                errorCount={featureErrors[policy.feature] ?? 0}
                disabled={isPending}
                onSave={(payload) => saveAIControlPayload(payload, "Routing policy сохранена")}
              />
            ))}
          </tbody>
        </CompactTableShell>
        <PaginationBar page={policyPage} total={filteredPolicies.length} onPage={setPolicyPage} />
      </section>

      <section data-testid="admin-ai-prompts">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Промты продуктов</h2>
        <CompactTableShell minWidth="1420px">
          <thead className="sticky top-0 z-10 bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <CompactHeader label="Feature" sortKey="feature" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)}>
                <input value={promptFilters.feature} onChange={(event) => { setPromptFilters({ ...promptFilters, feature: event.target.value }); setPromptPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Title" sortKey="title" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)}>
                <input value={promptFilters.title} onChange={(event) => { setPromptFilters({ ...promptFilters, title: event.target.value }); setPromptPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Product" sortKey="productKey" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)}>
                <input value={promptFilters.productKey} onChange={(event) => { setPromptFilters({ ...promptFilters, productKey: event.target.value }); setPromptPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Status" sortKey="status" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)}>
                <select value={promptFilters.status} onChange={(event) => { setPromptFilters({ ...promptFilters, status: event.target.value }); setPromptPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="active">active</option>
                  <option value="off">off</option>
                </select>
              </CompactHeader>
              <CompactHeader label="Source" sortKey="source" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)}>
                <select value={promptFilters.source} onChange={(event) => { setPromptFilters({ ...promptFilters, source: event.target.value }); setPromptPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="database">custom</option>
                  <option value="default">default</option>
                </select>
              </CompactHeader>
              <CompactHeader label="Updated" sortKey="updatedAt" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)} />
              <th className={`${COMPACT_HEADER_CLASS} p-0 align-top`}>
                <div className="px-1.5 py-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">Prompt text</div>
                <input value={promptFilters.promptText} onChange={(event) => { setPromptFilters({ ...promptFilters, promptText: event.target.value }); setPromptPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </th>
              <th className={`${COMPACT_HEADER_CLASS} border-r-0 px-1.5 py-2`}>Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {pagedPrompts.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">Промтов по фильтрам нет</td></tr>
            ) : pagedPrompts.map((prompt) => (
              <PromptTableRow
                key={prompt.feature}
                prompt={prompt}
                disabled={isPending || !canViewSecrets}
                onSave={(payload) => startTransition(() => { void savePrompt(payload); })}
                onReset={() => startTransition(() => { void resetPrompt(prompt.feature); })}
              />
            ))}
          </tbody>
        </CompactTableShell>
        <PaginationBar page={promptPage} total={filteredPrompts.length} onPage={setPromptPage} />
      </section>

      <section data-testid="admin-ai-usage-details">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Расход токенов и денег</h2>
        <CompactTableShell minWidth="1120px">
          <thead className="bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <CompactHeader label="Product / feature" sortKey="feature" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)}>
                <input value={usageFilters.feature} onChange={(event) => { setUsageFilters({ ...usageFilters, feature: event.target.value }); setUsagePage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Provider" sortKey="provider" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)}>
                <select value={usageFilters.provider} onChange={(event) => { setUsageFilters({ ...usageFilters, provider: event.target.value }); setUsagePage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                  <option value="NO_PROVIDER">NO_PROVIDER</option>
                </select>
              </CompactHeader>
              <CompactHeader label="Model" sortKey="model" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)}>
                <input value={usageFilters.model} onChange={(event) => { setUsageFilters({ ...usageFilters, model: event.target.value }); setUsagePage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Status" sortKey="status" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)}>
                <select value={usageFilters.status} onChange={(event) => { setUsageFilters({ ...usageFilters, status: event.target.value }); setUsagePage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="SUCCEEDED">SUCCEEDED</option>
                  <option value="FAILED">FAILED</option>
                  <option value="RUNNING">RUNNING</option>
                  <option value="TIMEOUT">TIMEOUT</option>
                </select>
              </CompactHeader>
              <CompactHeader label="Req/attempts" sortKey="requests" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)} />
              <CompactHeader label="Tokens" sortKey="tokens" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)} />
              <CompactHeader label="Cost" sortKey="cost" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)} />
              <CompactHeader label="Latency" sortKey="latency" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)} />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {pagedUsageRows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">За период и audit window пока нет LLM usage</td></tr>
            ) : pagedUsageRows.map((row) => (
              <tr key={`${row.feature}:${row.provider}:${row.model}:${row.status}`}>
                <td className={`${COMPACT_CELL_CLASS} font-medium text-[var(--soft-ink)]`}>{row.feature}</td>
                <td className={COMPACT_CELL_CLASS}>{row.provider}</td>
                <td className={`${COMPACT_CELL_CLASS} max-w-[20rem] break-all font-mono`}>{row.model}</td>
                <td className={COMPACT_CELL_CLASS}><SoftBadge className={statusTone(row.status)}>{row.status}</SoftBadge></td>
                <td className={COMPACT_CELL_CLASS}>{row.requestCount}/{row.attemptCount}</td>
                <td className={COMPACT_CELL_CLASS}>{formatTokens(row.totalTokens)}</td>
                <td className={COMPACT_CELL_CLASS}>{formatUsdMicros(row.costMicros)}</td>
                <td className={`${COMPACT_CELL_CLASS} border-r-0`}>{row.avgLatencyMs ? `${row.avgLatencyMs} ms` : "-"}</td>
              </tr>
            ))}
          </tbody>
        </CompactTableShell>
        <PaginationBar page={usagePage} total={filteredUsageRows.length} onPage={setUsagePage} />
      </section>

      <section data-testid="admin-ai-interactions">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">
          <MessageSquareText className="h-4 w-4" aria-hidden="true" />
          Аудит пользовательских LLM-диалогов
        </h2>
        <CompactTableShell minWidth="1320px">
          <thead className="bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <CompactHeader label="Время" sortKey="createdAt" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)}>
                <input value={interactionFilters.createdAt} onChange={(event) => { setInteractionFilters({ ...interactionFilters, createdAt: event.target.value }); setInteractionPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Feature" sortKey="feature" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)}>
                <input value={interactionFilters.feature} onChange={(event) => { setInteractionFilters({ ...interactionFilters, feature: event.target.value }); setInteractionPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Пользователь" sortKey="user" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)}>
                <input value={interactionFilters.user} onChange={(event) => { setInteractionFilters({ ...interactionFilters, user: event.target.value }); setInteractionPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </CompactHeader>
              <CompactHeader label="Status" sortKey="status" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)}>
                <select value={interactionFilters.status} onChange={(event) => { setInteractionFilters({ ...interactionFilters, status: event.target.value }); setInteractionPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="SUCCEEDED">SUCCEEDED</option>
                  <option value="FAILED">FAILED</option>
                  <option value="RUNNING">RUNNING</option>
                </select>
              </CompactHeader>
              <CompactHeader label="Provider / model" sortKey="provider" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)}>
                <select value={interactionFilters.provider} onChange={(event) => { setInteractionFilters({ ...interactionFilters, provider: event.target.value }); setInteractionPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                </select>
              </CompactHeader>
              <CompactHeader label="Tokens" sortKey="tokens" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)} />
              <CompactHeader label="Cost" sortKey="cost" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)} />
              <th className={`${COMPACT_HEADER_CLASS} p-0 align-top`}>
                <div className="px-1.5 py-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">Ответ</div>
                <input value={interactionFilters.answer} onChange={(event) => { setInteractionFilters({ ...interactionFilters, answer: event.target.value }); setInteractionPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="filter" />
              </th>
              <th className={`${COMPACT_HEADER_CLASS} border-r-0 px-1.5 py-2`}>Просмотр</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {pagedInteractions.length === 0 ? (
              <tr><td colSpan={9} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">LLM-диалогов по фильтрам нет. Сейчас показывается окно до 7 дней, чтобы не терять вчерашние ответы.</td></tr>
            ) : pagedInteractions.map((interaction) => (
              <tr key={interaction.id}>
                <td className={`${COMPACT_CELL_CLASS} text-[var(--soft-ink-soft)]`}>{formatDate(interaction.createdAt)}</td>
                <td className={`${COMPACT_CELL_CLASS} font-medium text-[var(--soft-ink)]`}>{interaction.feature}</td>
                <td className={`${COMPACT_CELL_CLASS} text-[var(--soft-ink-soft)]`}>{interaction.userLabel ?? interaction.userId ?? "anonymous"}</td>
                <td className={COMPACT_CELL_CLASS}><SoftBadge className={statusTone(interaction.status)}>{interaction.status}</SoftBadge></td>
                <td className={`${COMPACT_CELL_CLASS} max-w-[20rem] break-all font-mono text-[11px]`}>
                  {interaction.responseProvider ?? interaction.attempts.at(-1)?.provider ?? "no provider"} / {interaction.responseModel ?? interaction.attempts.at(-1)?.model ?? "no model"}
                </td>
                <td className={`${COMPACT_CELL_CLASS} text-[var(--soft-ink-soft)]`}>{formatTokens(interaction.totalTokens)}</td>
                <td className={`${COMPACT_CELL_CLASS} text-[var(--soft-ink-soft)]`}>{formatUsdMicros(interaction.estimatedCostMicros)}</td>
                <td className={`${COMPACT_CELL_CLASS} max-w-[24rem] whitespace-normal break-words text-[var(--soft-ink)]`}>
                  {interaction.responseText ?? interaction.errorText ?? "Нет ответа"}
                </td>
                <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
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
        </CompactTableShell>
        <PaginationBar page={interactionPage} total={filteredInteractions.length} onPage={setInteractionPage} />
      </section>
    </div>
  );
}
