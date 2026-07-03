"use client";

import type { ReactNode } from "react";
import { useId, useMemo, useState, useTransition } from "react";
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
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CompactHeader,
  CompactPaginationBar as SharedCompactPaginationBar,
  CompactTableShell,
  COMPACT_CELL_CLASS,
  COMPACT_HEADER_CLASS,
  COMPACT_INPUT_CLASS,
  COMPACT_SELECT_CLASS,
  type SortDirection,
} from "@/components/admin/compact-table";
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
  YANDEX: "YANDEX",
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

type NumericDraft = number | "";

type RoutingPolicyDraft = {
  enabled: boolean;
  providerOrder: AIProvider[];
  modelPreferences: Partial<Record<AIProvider, string>>;
  maxTokens: NumericDraft;
  temperature: NumericDraft;
  timeoutMs: NumericDraft;
  dailyTokenBudget: NumericDraft;
  perUserDailyTokenBudget: NumericDraft;
};

type ModelPricingDraft = {
  input: NumericDraft;
  output: NumericDraft;
};

type ProviderConfigDraft = {
  enabled: boolean;
  cloudflareGatewayEnabled: boolean;
  priority: number;
  timeoutMs: number;
  defaultModel: string;
  baseUrl: string;
  inputTokenCostMicros: NumericDraft;
  outputTokenCostMicros: NumericDraft;
};

type CredentialDraft = {
  label: string;
  apiKey: string;
  enabled: boolean;
  priority: number;
  modelOverride: string;
  baseUrlOverride: string;
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
  effectiveBaseUrl: string | null;
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
type SortState<K extends string> = { key: K; direction: SortDirection };
type DisplayCurrency = "RUB" | "USD";

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
  [AIProvider.YANDEX]: "https://llm.api.cloud.yandex.net/foundationModels/v1",
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

function formatDisplayMoney(value: number | null, currency: DisplayCurrency) {
  if (value === null) return "Курс ЦБ недоступен";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency,
    maximumFractionDigits: value > 0 && value < 100 ? 2 : 0,
  }).format(value);
}

function formatRubFromUsdMicros(value: number, usdRub: number | null, currency: DisplayCurrency = "RUB") {
  if (currency === "USD") return formatDisplayMoney(usdFromMicros(value), currency);
  if (!usdRub) return "Курс ЦБ недоступен";
  return formatDisplayMoney(usdFromMicros(value) * usdRub, currency);
}

function formatUsdPerMillionAsRub(value: number, usdRub: number | null, currency: DisplayCurrency = "RUB") {
  if (currency === "USD") return formatDisplayMoney(value, currency);
  if (!usdRub) return "Курс ЦБ недоступен";
  return formatDisplayMoney(value * usdRub, currency);
}

function statusTone(status: string) {
  const normalized = status.toUpperCase();
  if (normalized === "SUCCEEDED" || normalized === "OK") return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700";
  if (normalized === "FAILED" || normalized === "TIMEOUT" || normalized === "RATE_LIMITED" || normalized === "DOWN") {
    return "border-red-500/30 bg-red-500/10 text-red-700";
  }
  if (normalized === "SKIPPED" || normalized === "RUNNING" || normalized === "WARN") return "border-amber-500/30 bg-amber-500/10 text-amber-700";
  return "border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]";
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    SUCCEEDED: "Успешно",
    FAILED: "Ошибка",
    RUNNING: "В работе",
    TIMEOUT: "Таймаут",
    RATE_LIMITED: "Лимит",
    OK: "ОК",
    WARN: "Внимание",
    SKIPPED: "Пропущено",
  };
  return labels[status.toUpperCase()] ?? status;
}

// Human-readable reasons for the admin so a failed key tells whether it needs a
// replacement (INVALID_KEY) or just a billing top-up (INSUFFICIENT_CREDITS).
const ERROR_CODE_LABELS: Record<string, string> = {
  INSUFFICIENT_CREDITS: "нет средств на балансе провайдера — пополните счёт",
  PROVIDER_RESTRICTED: "аккаунт провайдера ограничен — нужен новый ключ",
  QUOTA_EXCEEDED: "превышена квота / лимит запросов",
  INVALID_KEY: "неверный ключ — требуется замена",
  MISSING_CONFIG: "ключ не настроен",
  HEALTHCHECK_FAILED: "проверка не прошла",
};

export function errorCodeLabel(code: string | null | undefined): string | null {
  if (!code) return null;
  return ERROR_CODE_LABELS[code] ?? code;
}

function keyState(credential: CredentialRow) {
  if (!credential.enabled) return { label: "выключен", tone: "border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]" };
  if (credential.regionBlocked) return { label: "region error", tone: statusTone("failed") };
  const successAt = credential.lastSuccessAt ? Date.parse(credential.lastSuccessAt) : 0;
  const errorAt = credential.lastErrorAt ? Date.parse(credential.lastErrorAt) : 0;
  if (errorAt > successAt) {
    // A valid key that's merely out of credits is a billing issue, not a broken
    // key — surface it with a softer "warn" tone and a clear label.
    if (credential.lastErrorCode === "INSUFFICIENT_CREDITS") {
      return { label: "нет средств", tone: statusTone("warn") };
    }
    return { label: "ошибка", tone: statusTone("failed") };
  }
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

function modelPricingLabel(model: ModelRow, provider?: ProviderRow, usdRub?: number | null, currency: DisplayCurrency = "RUB") {
  const pricing = modelPricing(model, provider);
  if (!pricing) return null;
  return `${pricing.source}: вход ${formatUsdPerMillionAsRub(pricing.inputUsdPerMillion, usdRub ?? null, currency)} / выход ${formatUsdPerMillionAsRub(pricing.outputUsdPerMillion, usdRub ?? null, currency)} за 1 млн токенов`;
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
  [AIProvider.YANDEX]: ["yandexgpt-lite/latest", "yandexgpt/latest"],
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
  [AIProvider.YANDEX]: ["yandexgpt/latest", "yandexgpt-lite/latest"],
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

function renderAuditLines(lines: string[]) {
  return lines.map((line, index) => (
    <span key={`${line}:${index}`}>
      {index > 0 && <br />}
      {line}
    </span>
  ));
}

function RenderedAuditText({ content, className = "" }: { content: unknown; className?: string }) {
  const text = renderAuditContent(content);
  const blocks = text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean);

  if (blocks.length === 0) {
    return <div className={`soft-admin-rendered-text ${className}`}>Нет ответа</div>;
  }

  return (
    <div className={`soft-admin-rendered-text ${className}`}>
      {blocks.map((block, index) => {
        const heading = block.match(/^(#{1,4})\s+(.+)$/);
        if (heading) {
          return <h4 key={`${block}:${index}`}>{heading[2]}</h4>;
        }

        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        if (lines.length > 0 && lines.every((line) => /^[-*]\s+/.test(line))) {
          return (
            <ul key={`${block}:${index}`}>
              {lines.map((line, itemIndex) => <li key={`${line}:${itemIndex}`}>{line.replace(/^[-*]\s+/, "")}</li>)}
            </ul>
          );
        }

        if (lines.length > 0 && lines.every((line) => /^\d+[.)]\s+/.test(line))) {
          return (
            <ol key={`${block}:${index}`}>
              {lines.map((line, itemIndex) => <li key={`${line}:${itemIndex}`}>{line.replace(/^\d+[.)]\s+/, "")}</li>)}
            </ol>
          );
        }

        return <p key={`${block}:${index}`}>{renderAuditLines(lines.length > 0 ? lines : [block])}</p>;
      })}
    </div>
  );
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

function InteractionAuditModal({
  interaction,
  formatCost,
  onClose,
}: {
  interaction: InteractionRow;
  formatCost: (value: number) => string;
  onClose: () => void;
}) {
  return (
    <dialog open className="soft-admin-detail-dialog" aria-label={`Аудит LLM-диалога ${interaction.id}`}>
      <div className="soft-admin-detail-dialog__panel w-[min(1120px,calc(100vw-32px))]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--soft-ink-soft)]">LLM-аудит</p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--soft-ink)]">{interaction.feature}</h3>
            <p className="mt-1 text-xs text-[var(--soft-ink-soft)]">
              {formatDate(interaction.createdAt)} · {interaction.userLabel ?? interaction.userId ?? "анонимно"} · {interaction.requestId ?? interaction.id}
            </p>
          </div>
          <button type="button" className="soft-admin-icon-button" onClick={onClose} aria-label="Закрыть аудит">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-2">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              Запрос и контекст для LLM
            </p>
            <div className="max-h-[32rem] space-y-2 overflow-auto rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3">
              {interaction.messages.map((item, index) => (
                <div key={`${interaction.id}:message:${index}`} className="rounded-md bg-white/80 p-2">
                  <p className="mb-1 text-[11px] font-semibold uppercase text-[var(--soft-bordeaux)]">{item.role}</p>
                  <pre className="whitespace-pre-wrap text-xs leading-relaxed text-[var(--soft-ink)]">{renderAuditContent(item.content)}</pre>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Ответ LLM и попытки</p>
            <RenderedAuditText
              content={interaction.responseText ?? interaction.errorText ?? "Нет ответа"}
              className="max-h-80 overflow-auto rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-3"
            />
            <div className="space-y-1">
              {interaction.attempts.map((attempt, index) => (
                <div key={`${interaction.id}:attempt:${index}`} className="flex flex-wrap items-center gap-2 rounded-md bg-[var(--soft-surface)] px-3 py-2 text-xs">
                  <SoftBadge className={statusTone(attempt.status)}>{statusLabel(attempt.status)}</SoftBadge>
                  <span className="font-mono">{attempt.provider}/{attempt.model}</span>
                  <span className="text-[var(--soft-ink-soft)]">{formatTokens(attempt.totalTokens)} токенов · {formatCost(attempt.estimatedCostMicros)} · {attempt.latencyMs ? `${attempt.latencyMs} ms` : "нет времени ответа"}</span>
                  {attempt.errorCode && <span className="text-red-700">{attempt.errorCode}</span>}
                </div>
              ))}
              {interaction.attempts.length === 0 ? <p className="text-xs text-[var(--soft-ink-soft)]">Попытки маршрутизации не записаны.</p> : null}
            </div>
          </div>
        </div>
      </div>
    </dialog>
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
  return <SharedCompactPaginationBar page={page} total={total} onPage={onPage} pageSize={TABLE_PAGE_SIZE} />;
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
  usdRub,
  currency,
  onChange,
  placeholder,
  recommendedValue,
}: {
  value: string;
  models: ModelRow[];
  provider?: ProviderRow;
  usdRub: number | null;
  currency: DisplayCurrency;
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
          const pricingLabel = modelPricingLabel(model, provider, usdRub, currency);
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
  usdRub,
  currency,
  onSavePricing,
}: {
  row: ModelCostRow;
  usdRub: number | null;
  currency: DisplayCurrency;
  onSavePricing: (provider: AIProvider, modelId: string, inputTokenCostMicros: number | null, outputTokenCostMicros: number | null) => Promise<void> | void;
}) {
  const [draft, setDraft] = useState<ModelPricingDraft>({
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
      <td className={COMPACT_CELL_CLASS}>{row.pricing?.source === "database" ? "ручная цена" : "цена провайдера"}</td>
      <td className={COMPACT_CELL_CLASS}>{formatUsdPerMillionAsRub(row.pricing?.inputUsdPerMillion ?? 0, usdRub, currency)}</td>
      <td className={COMPACT_CELL_CLASS}>{formatUsdPerMillionAsRub(row.pricing?.outputUsdPerMillion ?? 0, usdRub, currency)}</td>
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
      <td className={COMPACT_CELL_CLASS}>{row.model.fetchedAt === "reference" ? "справочник" : formatDate(row.model.fetchedAt)}</td>
      <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
        <button
          type="button"
          className="soft-admin-icon-button"
          data-variant="primary"
          onClick={() => onSavePricing(
            row.provider,
            row.model.modelId,
            draft.input === "" ? null : Number(draft.input),
            draft.output === "" ? null : Number(draft.output),
          )}
          title="Сохранить цену модели"
          aria-label={`Сохранить цену модели ${row.model.modelId}`}
        >
          <Save className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function ProviderTableRow({
  provider,
  models,
  usdRub,
  currency,
  cloudflareGateway,
  disabled,
  onSave,
  onRefreshModels,
  refreshing,
}: {
  provider: ProviderRow;
  models: ModelRow[];
  usdRub: number | null;
  currency: DisplayCurrency;
  cloudflareGateway: CloudflareGatewayState;
  disabled: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void> | void;
  onRefreshModels: () => Promise<void> | void;
  refreshing: boolean;
}) {
  const cfUrl = cloudflareGateway.configured ? cloudflareGateway.providerUrls?.[provider.provider] ?? null : null;
  const directUrl = DIRECT_PROVIDER_BASE_URLS[provider.provider];
  const [draft, setDraft] = useState<ProviderConfigDraft>({
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
          usdRub={usdRub}
          currency={currency}
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
        <div className="soft-admin-table-actions">
          <button
            type="button"
            className="soft-admin-icon-button"
            data-variant="primary"
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
            title="Сохранить провайдера"
            aria-label={`Сохранить провайдера ${provider.displayName}`}
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="soft-admin-icon-button"
            disabled={disabled || refreshing}
            onClick={() => onRefreshModels()}
            title="Обновить список моделей"
            aria-label={`Обновить список моделей ${provider.displayName}`}
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function CredentialTableRow({
  credential,
  models,
  provider,
  usdRub,
  currency,
  onUpdate,
  onDelete,
  onCheck,
  disabled,
  canViewSecrets,
}: {
  credential: CredentialRow;
  models: ModelRow[];
  provider: ProviderRow;
  usdRub: number | null;
  currency: DisplayCurrency;
  onUpdate: (payload: Record<string, unknown>, msg: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  onCheck: () => Promise<void> | void;
  disabled: boolean;
  canViewSecrets: boolean;
}) {
  const originalKey = credential.apiKey ?? "";
  const [draft, setDraft] = useState<CredentialDraft>({
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
        {credential.lastErrorCode && (
          <div className={`mt-1 text-xs ${credential.lastErrorCode === "INSUFFICIENT_CREDITS" || credential.lastErrorCode === "PROVIDER_RESTRICTED" ? "text-amber-700" : "text-red-700"}`}>
            {errorCodeLabel(credential.lastErrorCode)}
          </div>
        )}
        {credential.lastErrorMessage && <div className="mt-1 max-w-[24rem] whitespace-normal break-words text-xs text-[var(--soft-ink-faint)]">{credential.lastErrorMessage}</div>}
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <label className="flex items-center gap-2 text-xs text-[var(--soft-ink-soft)]">
          <input type="checkbox" checked={draft.enabled} onChange={(event) => setDraft({ ...draft, enabled: event.target.checked })} />
          включен
        </label>
      </td>
      <td className={COMPACT_CELL_CLASS}><input value={draft.priority} type="number" onChange={(event) => setDraft({ ...draft, priority: Number(event.target.value) })} className={COMPACT_INPUT_CLASS} /></td>
      <td className={COMPACT_CELL_CLASS}>
        <ModelSelect value={draft.modelOverride} models={models} provider={provider} usdRub={usdRub} currency={currency} onChange={(value) => setDraft({ ...draft, modelOverride: value })} placeholder="Override модели" />
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <input value={draft.baseUrlOverride} onChange={(event) => setDraft({ ...draft, baseUrlOverride: event.target.value })} placeholder="Base URL ключа" className={`${COMPACT_INPUT_CLASS} min-w-[20rem] font-mono`} />
        {/* The override is often blank even when requests route through the
            provider config / Cloudflare AI Gateway — show the resolved URL so
            "Use CF Gateway" is visibly reflected here. */}
        {credential.effectiveBaseUrl && credential.effectiveBaseUrl !== (draft.baseUrlOverride || credential.baseUrlOverride) && (
          <div className="mt-1 max-w-[24rem] break-all font-mono text-[10px] text-[var(--soft-ink-faint)]">
            эффективный: {credential.effectiveBaseUrl}
            {credential.effectiveBaseUrl.includes("gateway.ai.cloudflare.com") ? " · CF Gateway" : ""}
          </div>
        )}
      </td>
      <td className={`${COMPACT_CELL_CLASS} text-xs text-[var(--soft-ink-soft)]`}>
        <div>успех: {formatDate(credential.lastSuccessAt)}</div>
        <div>ошибка: {formatDate(credential.lastErrorAt)}</div>
        {credential.consecutiveFailures > 0 && <div className="text-red-700">{credential.consecutiveFailures} подряд</div>}
      </td>
      <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
        <div className="soft-admin-table-actions">
          <button
            type="button"
            className="soft-admin-icon-button"
            disabled={disabled}
            onClick={() => onCheck()}
            title="Проверить ключ"
            aria-label={`Проверить ключ ${draft.label}`}
          >
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            type="button"
            className="soft-admin-icon-button"
            data-variant="primary"
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
            title="Сохранить ключ"
            aria-label={`Сохранить ключ ${draft.label}`}
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {(credential.regionBlocked || credential.consecutiveFailures > 0) && (
            <button
              type="button"
              className="soft-admin-icon-button"
              disabled={disabled}
              onClick={() => onUpdate({ resetFailureState: true }, "Состояние ошибок сброшено")}
              title="Сбросить ошибки ключа"
              aria-label={`Сбросить ошибки ключа ${draft.label}`}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="soft-admin-icon-button"
            data-variant="danger"
            disabled={disabled}
            onClick={() => onDelete()}
            title="Удалить ключ"
            aria-label={`Удалить ключ ${draft.label}`}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function PolicyTableRow({
  policy,
  providers,
  models,
  usdRub,
  currency,
  errorCount,
  disabled,
  onSave,
}: {
  policy: PolicyRow;
  providers: ProviderRow[];
  models: ModelsByProvider;
  usdRub: number | null;
  currency: DisplayCurrency;
  errorCount: number;
  disabled: boolean;
  onSave: (payload: Record<string, unknown>) => Promise<void> | void;
}) {
  const [openModal, setOpenModal] = useState(false);
  const [draft, setDraft] = useState<RoutingPolicyDraft>({
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
  const product = productFromFeature(policy.feature);
  const providerLabelById = useMemo(() => new Map(providers.map((provider) => [provider.provider, provider.displayName])), [providers]);

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

  function saveDraft() {
    const modelPreferences = Object.fromEntries(
      Object.entries(draft.modelPreferences).filter(([, value]) => typeof value === "string" && value.trim()),
    );
    void Promise.resolve(onSave({
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
    })).then(() => setOpenModal(false));
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
        <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{policy.source === "database" ? "ручная" : "по умолчанию"}</SoftBadge>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <SoftBadge className={draft.enabled ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700" : "border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]"}>
          {draft.enabled ? "Включено" : "Отключено"}
        </SoftBadge>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <div className="provider-logo-chain flex max-w-[22rem] flex-wrap items-center gap-1" title={draft.providerOrder.join(" → ")}>
          {draft.providerOrder.map((provider, index) => (
            <span key={provider} className="inline-flex items-center gap-1 rounded-full border border-[var(--soft-paper-edge)] bg-white px-2 py-1 text-[10px] font-semibold text-[var(--soft-ink)]">
              <span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--soft-bordeaux)] text-[9px] font-bold text-white" aria-hidden="true">
                {provider.slice(0, 2)}
              </span>
              <span className="sr-only">{index + 1}. </span>
              {providerLabelById.get(provider) ?? provider}
            </span>
          ))}
        </div>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <span className={errorCount > 0 ? "text-red-700" : "text-[var(--soft-ink-soft)]"}>{errorCount}</span>
      </td>
      <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
        <button
          type="button"
          className="soft-admin-icon-button"
          data-variant="primary"
          disabled={disabled}
          onClick={() => setOpenModal(true)}
          title="Изменить цепочку маршрутизации"
          aria-label={`Изменить цепочку маршрутизации ${policy.title ?? policy.feature}`}
        >
          Изменить
        </button>
        {openModal ? (
          <RoutingChainModal
            title={policy.title ?? policy.feature}
            feature={policy.feature}
            enabled={draft.enabled}
            providerOrder={draft.providerOrder}
            modelPreferences={draft.modelPreferences}
            maxTokens={draft.maxTokens}
            temperature={draft.temperature}
            timeoutMs={draft.timeoutMs}
            dailyTokenBudget={draft.dailyTokenBudget}
            perUserDailyTokenBudget={draft.perUserDailyTokenBudget}
            providers={providers}
            models={models}
            usdRub={usdRub}
            currency={currency}
            draggedProvider={draggedProvider}
            setDraggedProvider={setDraggedProvider}
            onEnabledChange={(enabled) => setDraft({ ...draft, enabled })}
            onDropProvider={dropOn}
            onMoveProvider={moveProvider}
            onModelChange={updateModel}
            onMaxTokensChange={(value) => setDraft({ ...draft, maxTokens: value })}
            onTemperatureChange={(value) => setDraft({ ...draft, temperature: value })}
            onTimeoutChange={(value) => setDraft({ ...draft, timeoutMs: value })}
            onDailyBudgetChange={(value) => setDraft({ ...draft, dailyTokenBudget: value })}
            onUserBudgetChange={(value) => setDraft({ ...draft, perUserDailyTokenBudget: value })}
            onClose={() => setOpenModal(false)}
            onSave={saveDraft}
            disabled={disabled}
          />
        ) : null}
      </td>
    </tr>
  );
}

function RoutingChainModal({
  title,
  feature,
  enabled,
  providerOrder,
  modelPreferences,
  maxTokens,
  temperature,
  timeoutMs,
  dailyTokenBudget,
  perUserDailyTokenBudget,
  providers,
  models,
  usdRub,
  currency,
  draggedProvider,
  setDraggedProvider,
  onEnabledChange,
  onDropProvider,
  onMoveProvider,
  onModelChange,
  onMaxTokensChange,
  onTemperatureChange,
  onTimeoutChange,
  onDailyBudgetChange,
  onUserBudgetChange,
  onClose,
  onSave,
  disabled,
}: {
  title: string;
  feature: string;
  enabled: boolean;
  providerOrder: AIProvider[];
  modelPreferences: Partial<Record<AIProvider, string>>;
  maxTokens: number | "";
  temperature: number | "";
  timeoutMs: number | "";
  dailyTokenBudget: number | "";
  perUserDailyTokenBudget: number | "";
  providers: ProviderRow[];
  models: ModelsByProvider;
  usdRub: number | null;
  currency: DisplayCurrency;
  draggedProvider: AIProvider | null;
  setDraggedProvider: (provider: AIProvider | null) => void;
  onEnabledChange: (enabled: boolean) => void;
  onDropProvider: (provider: AIProvider) => void;
  onMoveProvider: (provider: AIProvider, direction: -1 | 1) => void;
  onModelChange: (provider: AIProvider, value: string) => void;
  onMaxTokensChange: (value: number | "") => void;
  onTemperatureChange: (value: number | "") => void;
  onTimeoutChange: (value: number | "") => void;
  onDailyBudgetChange: (value: number | "") => void;
  onUserBudgetChange: (value: number | "") => void;
  onClose: () => void;
  onSave: () => void;
  disabled: boolean;
}) {
  const providerConfigById = useMemo(() => new Map(providers.map((provider) => [provider.provider, provider])), [providers]);
  void draggedProvider;
  return (
    <dialog open className="soft-admin-detail-dialog" aria-label={`Редактирование маршрута ${title}`}>
      <div className="soft-admin-detail-dialog__panel w-[min(1040px,calc(100vw-32px))]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-[var(--soft-ink-soft)]">Цепочка маршрутизации</p>
            <h3 className="mt-1 text-lg font-semibold text-[var(--soft-ink)]">{title}</h3>
            <p className="mt-1 font-mono text-xs text-[var(--soft-ink-soft)]">{feature}</p>
          </div>
          <button type="button" className="soft-admin-icon-button" onClick={onClose} aria-label="Закрыть">
            <X className="size-4" aria-hidden="true" />
          </button>
        </div>
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <label className="inline-flex items-center gap-2 text-sm text-[var(--soft-ink)]">
            <input type="checkbox" checked={enabled} onChange={(event) => onEnabledChange(event.target.checked)} />
            Цепочка включена
          </label>
          <span className="text-xs text-[var(--soft-ink-soft)]">Перетащите провайдера, чтобы изменить приоритет fallback.</span>
        </div>
        <div className="grid gap-2">
          {providerOrder.map((provider, index) => (
            <div
              key={provider}
              draggable
              onDragStart={() => setDraggedProvider(provider)}
              onDragEnd={() => setDraggedProvider(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={() => onDropProvider(provider)}
              className="grid grid-cols-[9rem_minmax(0,1fr)_4rem] items-center gap-2 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-2"
              title="Перетащите, чтобы изменить порядок"
            >
              <div className="inline-flex min-w-0 items-center gap-2 rounded border border-[var(--soft-paper-edge)] bg-white px-2 py-1 font-mono text-[11px] text-[var(--soft-ink)]">
                <GripVertical className="h-3.5 w-3.5 shrink-0 text-[var(--soft-ink-soft)]" aria-hidden="true" />
                <span className="truncate">{index + 1}. {provider}</span>
              </div>
              <ModelSelect
                value={modelPreferences[provider] ?? ""}
                models={models[provider] ?? []}
                provider={providerConfigById.get(provider)}
                usdRub={usdRub}
                currency={currency}
                onChange={(value) => onModelChange(provider, value)}
                placeholder="модель провайдера"
                recommendedValue={pickRecommendedModel(provider, { feature, enabled, providerOrder }, models[provider] ?? [])}
              />
              <span className="inline-flex items-center justify-end gap-0.5">
                <button type="button" onClick={() => onMoveProvider(provider, -1)} disabled={index === 0} aria-label={`Поднять ${provider}`} className="rounded border border-[var(--soft-paper-edge)] bg-white p-1 disabled:opacity-35"><ArrowUp className="h-3 w-3" /></button>
                <button type="button" onClick={() => onMoveProvider(provider, 1)} disabled={index === providerOrder.length - 1} aria-label={`Опустить ${provider}`} className="rounded border border-[var(--soft-paper-edge)] bg-white p-1 disabled:opacity-35"><ArrowDown className="h-3 w-3" /></button>
              </span>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-5">
          <label className="grid gap-1 text-xs text-[var(--soft-ink-soft)]">Макс. токены
            <input value={maxTokens} type="number" onChange={(event) => onMaxTokensChange(event.target.value === "" ? "" : Number(event.target.value))} className={COMPACT_INPUT_CLASS} />
          </label>
          <label className="grid gap-1 text-xs text-[var(--soft-ink-soft)]">Температура
            <input value={temperature} type="number" step="0.1" onChange={(event) => onTemperatureChange(event.target.value === "" ? "" : Number(event.target.value))} className={COMPACT_INPUT_CLASS} />
          </label>
          <label className="grid gap-1 text-xs text-[var(--soft-ink-soft)]">Таймаут, ms
            <input value={timeoutMs} type="number" onChange={(event) => onTimeoutChange(event.target.value === "" ? "" : Number(event.target.value))} className={COMPACT_INPUT_CLASS} />
          </label>
          <label className="grid gap-1 text-xs text-[var(--soft-ink-soft)]">Бюджет функции
            <input value={dailyTokenBudget} type="number" onChange={(event) => onDailyBudgetChange(event.target.value === "" ? "" : Number(event.target.value))} className={COMPACT_INPUT_CLASS} />
          </label>
          <label className="grid gap-1 text-xs text-[var(--soft-ink-soft)]">Бюджет пользователя
            <input value={perUserDailyTokenBudget} type="number" onChange={(event) => onUserBudgetChange(event.target.value === "" ? "" : Number(event.target.value))} className={COMPACT_INPUT_CLASS} />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="soft-admin-action" data-variant="subtle" onClick={onClose}>Отмена</button>
          <button type="button" className="soft-admin-action" data-variant="primary" disabled={disabled} onClick={onSave}>
            <Save className="size-4" aria-hidden="true" />
            Сохранить
          </button>
        </div>
      </div>
    </dialog>
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
          включен
        </label>
      </td>
      <td className={COMPACT_CELL_CLASS}>
        <SoftBadge className="border-[var(--soft-paper-edge)] text-[var(--soft-ink-soft)]">{prompt.source === "database" ? "ручной" : "по умолчанию"}</SoftBadge>
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
        <div className="soft-admin-table-actions">
          {prompt.source === "database" && (
            <button
              type="button"
              className="soft-admin-icon-button"
              disabled={disabled}
              onClick={() => { void onReset(); }}
              title="Сбросить промт к значению по умолчанию"
              aria-label={`Сбросить промт ${prompt.title}`}
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          )}
          <button
            type="button"
            className="soft-admin-icon-button"
            data-variant="primary"
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
            title="Сохранить промт"
            aria-label={`Сохранить промт ${prompt.title}`}
          >
            <Save className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
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
  usdRub,
  currency,
  currencyRateLabel,
  usagePeriod,
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
  usdRub: number | null;
  currency: DisplayCurrency;
  currencyRateLabel: string;
  usagePeriod: string;
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
  const [openInteractionId, setOpenInteractionId] = useState<string | null>(null);
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
  const formatCost = (value: number) => formatRubFromUsdMicros(value, usdRub, currency);
  const perMillionUnit = currency === "USD" ? "$/1 млн" : "₽/1 млн";
  const moneyUnit = currency === "USD" ? "$" : "₽";

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
        // T1: even a failed request must surface in the Health column, not just
        // a toast — synthesize an error state so the badge flips to «ошибка».
        const message = body?.error ?? body?.message ?? "Не удалось проверить ключ";
        setCredentialOverrides((current) => {
          const base = current[id] ?? credentials.find((c) => c.id === id);
          if (!base) return current;
          return {
            ...current,
            [id]: {
              ...base,
              lastErrorAt: new Date().toISOString(),
              lastErrorCode: body?.code ?? "HEALTHCHECK_FAILED",
              lastErrorMessage: message,
              consecutiveFailures: (base.consecutiveFailures ?? 0) + 1,
            },
          };
        });
        reportError(message);
        return;
      }
      const status: string = body?.health?.status ?? "unknown";
      const healthy = status === "ok";
      // Prefer the authoritative credential row the API returns; fall back to
      // applying the health result onto the existing row so the Health column
      // (keyState reads lastSuccessAt/lastErrorAt) always reflects this check.
      setCredentialOverrides((current) => {
        const nowIso = new Date().toISOString();
        if (body?.credential?.id) {
          return { ...current, [body.credential.id]: body.credential };
        }
        const base = current[id] ?? credentials.find((c) => c.id === id);
        if (!base) return current;
        return {
          ...current,
          [id]: healthy
            ? { ...base, lastSuccessAt: nowIso, lastErrorCode: null, lastErrorMessage: null, consecutiveFailures: 0 }
            : {
                ...base,
                lastErrorAt: nowIso,
                lastErrorCode: body?.health?.code ?? "HEALTHCHECK_FAILED",
                lastErrorMessage: body?.health?.message ?? status,
                consecutiveFailures: (base.consecutiveFailures ?? 0) + 1,
              },
        };
      });
      if (healthy) {
        reportSuccess(`Проверка ${label}: ${status}${body.health?.latencyMs ? `, ${body.health.latencyMs} ms` : ""}`);
      } else {
        reportError(`Проверка ${label}: ${status}${body?.health?.message ? ` — ${body.health.message}` : ""}`);
      }
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
        <MetricCard icon={Activity} label="AI-запросы" value={formatTokens(totals.requests)} hint={`токены ${formatTokens(totals.tokens)} за день`} />
        <MetricCard icon={DollarSign} label="Расход AI" value={formatCost(totals.costMicros)} hint={`расчет по стоимости провайдера и модели · ${currencyRateLabel}`} />
        <MetricCard icon={KeyRound} label="API-ключи" value={`${totals.activeKeys}/${visibleCredentials.length}`} hint={`${totals.failedKeys} ключей в ошибке`} />
        <MetricCard icon={AlertTriangle} label="Ошибки LLM" value={formatTokens(totals.llmErrors)} hint={`${Object.keys(featureErrors).length} продуктов с ошибками`} />
      </section>

      <section
        className="grid gap-3 rounded-lg border border-[var(--soft-paper-edge)] bg-[var(--soft-surface)] p-4 md:grid-cols-3"
        data-testid="admin-ai-guardrails"
      >
        <div>
          <p className="soft-eyebrow">бесплатный слой</p>
          <p className="mt-2 text-sm font-medium">Бесплатный вход остается дешевым</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
            Разбор, маршрутизация и уточнения идут через цепочку дешевых моделей с резервным переключением между LLM.
          </p>
        </div>
        <div>
          <p className="soft-eyebrow">платный слой</p>
          <p className="mt-2 text-sm font-medium">Платные продукты получают сильный слой</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
            Разборы, полная картина, совместимость и сессии настраиваются отдельно по цепочке провайдеров.
          </p>
        </div>
        <div>
          <p className="soft-eyebrow">контур аудита</p>
          <p className="mt-2 text-sm font-medium">Промты, диалоги и ключи контролируются здесь</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--soft-ink-soft)]">
            Суперадмин видит ключи и LLM-диалоги; секреты не пишутся в runtime-логи и детали аудита.
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
          AI_CREDENTIAL_KEY не настроен. Ключи нельзя расшифровать или проверить до настройки 32-байтного мастер-ключа в окружении.
        </div>
      )}

      {cloudflareGateway.configured ? (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-800" data-testid="ai-cf-gateway-info">
          <div className="font-medium">Cloudflare AI Gateway настроен</div>
          <p className="mt-1 text-xs text-emerald-800/80">
            шлюз <code>{cloudflareGateway.gatewayId}</code> · аккаунт <code>{cloudflareGateway.accountId.slice(0, 8)}…</code> · токен {cloudflareGateway.hasToken ? "есть" : "не задан"}
          </p>
        </div>
      ) : (
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-xs text-sky-800" data-testid="ai-cf-gateway-missing">
          Cloudflare AI Gateway не настроен. Переключатели ниже можно оставить выключенными; прямые базовые URL будут работать без доработки кода.
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Провайдеры и Cloudflare Gateway</h2>
        <CompactTableShell minWidth="1320px">
          <thead className="bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Провайдер</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Статус</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Приоритет</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Таймаут</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Модель по умолчанию</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Базовый URL</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Базовая цена micros/1K</th>
              <th className={`${COMPACT_HEADER_CLASS} border-r-0 px-1.5 py-2`}>Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {providers.map((provider) => (
              <ProviderTableRow
                key={provider.provider}
                provider={provider}
                models={models[provider.provider] ?? []}
                usdRub={usdRub}
                currency={currency}
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
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Провайдер</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Название</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>API-ключ</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Состояние</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Включен</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Приоритет</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Модель ключа</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>URL ключа</th>
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
                  usdRub={usdRub}
                  currency={currency}
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
                  <select name="provider" defaultValue={AIProvider.OPENROUTER} className={COMPACT_SELECT_CLASS} aria-label="Провайдер">
                    {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                  </select>
                  <input name="label" placeholder="Метка" required className={COMPACT_INPUT_CLASS} />
                  <input name="apiKey" placeholder="API ключ" type={canViewSecrets ? "text" : "password"} required className={`${COMPACT_INPUT_CLASS} font-mono`} autoComplete="off" />
                  <input name="modelOverride" placeholder="Модель ключа" className={COMPACT_INPUT_CLASS} />
                  <input name="baseUrlOverride" placeholder="URL ключа" className={`${COMPACT_INPUT_CLASS} font-mono`} />
                  <input name="priority" type="number" placeholder="Приоритет" className={COMPACT_INPUT_CLASS} />
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
              <CompactHeader label="Провайдер" sortKey="provider" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)}>
                <select value={modelCostFilters.provider} onChange={(event) => { setModelCostFilters({ ...modelCostFilters, provider: event.target.value }); setModelCostPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                </select>
              </CompactHeader>
              <CompactHeader label="Модель" sortKey="model" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)}>
                <input value={modelCostFilters.model} onChange={(event) => { setModelCostFilters({ ...modelCostFilters, model: event.target.value }); setModelCostPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Название</th>
              <CompactHeader label="Контекст" sortKey="context" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)} />
              <CompactHeader label="Источник цены" sortKey="source" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)}>
                <select value={modelCostFilters.source} onChange={(event) => { setModelCostFilters({ ...modelCostFilters, source: event.target.value }); setModelCostPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="free">бесплатно</option>
                  <option value="model">модель</option>
                  <option value="reference">справочник</option>
                  <option value="reference/free">справочник / бесплатно</option>
                  <option value="catalog">каталог</option>
                  <option value="provider default">цена провайдера</option>
                </select>
              </CompactHeader>
              <CompactHeader label={`Вход, ${perMillionUnit}`} sortKey="input" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)} />
              <CompactHeader label={`Выход, ${perMillionUnit}`} sortKey="output" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)}>
                <select value={modelCostFilters.free} onChange={(event) => { setModelCostFilters({ ...modelCostFilters, free: event.target.value }); setModelCostPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="free">Бесплатные</option>
                  <option value="paid">Платные</option>
                </select>
              </CompactHeader>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Вход micros/1K</th>
              <th className={`${COMPACT_HEADER_CLASS} px-1.5 py-2`}>Выход micros/1K</th>
              <CompactHeader label="Обновлено" sortKey="fetchedAt" activeSortKey={modelCostSort.key} direction={modelCostSort.direction} onSort={(key) => toggleModelCostSort(key as typeof modelCostSort.key)} />
              <th className={`${COMPACT_HEADER_CLASS} border-r-0 px-1.5 py-2`}>Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {pagedModelCostRows.length === 0 ? (
              <tr><td colSpan={11} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">Каталог моделей пуст по выбранным фильтрам</td></tr>
            ) : pagedModelCostRows.map((row) => (
              <ModelCostTableRow key={`${row.provider}:${row.model.modelId}`} row={row} usdRub={usdRub} currency={currency} onSavePricing={saveModelPricing} />
            ))}
          </tbody>
        </CompactTableShell>
        <PaginationBar page={modelCostPage} total={filteredModelCostRows.length} onPage={setModelCostPage} />
      </section>

      <section data-testid="admin-ai-policies">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Цепочки маршрутизации по продуктам</h2>
        <CompactTableShell minWidth="1320px">
          <thead className="sticky top-0 z-10 bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <CompactHeader label="Продукт" sortKey="product" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.product} onChange={(event) => { setPolicyFilters({ ...policyFilters, product: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Название" sortKey="title" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.title} onChange={(event) => { setPolicyFilters({ ...policyFilters, title: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Функция" sortKey="feature" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.feature} onChange={(event) => { setPolicyFilters({ ...policyFilters, feature: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Назначение" sortKey="purpose" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.purpose} onChange={(event) => { setPolicyFilters({ ...policyFilters, purpose: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Уровень" sortKey="tier" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.tier} onChange={(event) => { setPolicyFilters({ ...policyFilters, tier: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Источник" sortKey="source" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <input value={policyFilters.source} onChange={(event) => { setPolicyFilters({ ...policyFilters, source: event.target.value }); setPolicyPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Статус" sortKey="status" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)}>
                <select value={policyFilters.status} onChange={(event) => { setPolicyFilters({ ...policyFilters, status: event.target.value }); setPolicyPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="active">Включено</option>
                  <option value="off">Отключено</option>
                </select>
              </CompactHeader>
              <th className={`${COMPACT_HEADER_CLASS} p-0 align-top`}>
                <div className="px-1.5 py-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">Модели по провайдерам</div>
                <select value={policyFilters.provider} onChange={(event) => { setPolicyFilters({ ...policyFilters, provider: event.target.value }); setPolicyPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все провайдеры</option>
                  {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                </select>
              </th>
              <CompactHeader label="Ошибки" sortKey="errors" activeSortKey={policySort.key} direction={policySort.direction} onSort={(key) => togglePolicySort(key as typeof policySort.key)} />
              <th className={`${COMPACT_HEADER_CLASS} border-r-0 px-1.5 py-2`}>Действия</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {pagedPolicies.length === 0 ? (
              <tr><td colSpan={10} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">Цепочек по фильтрам нет</td></tr>
            ) : pagedPolicies.map((policy) => (
              <PolicyTableRow
                key={policy.feature}
                policy={policy}
                providers={providers}
                models={models}
                usdRub={usdRub}
                currency={currency}
                errorCount={featureErrors[policy.feature] ?? 0}
                disabled={isPending}
                onSave={(payload) => saveAIControlPayload(payload, "Цепочка маршрутизации сохранена")}
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
              <CompactHeader label="Функция" sortKey="feature" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)}>
                <input value={promptFilters.feature} onChange={(event) => { setPromptFilters({ ...promptFilters, feature: event.target.value }); setPromptPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Название" sortKey="title" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)}>
                <input value={promptFilters.title} onChange={(event) => { setPromptFilters({ ...promptFilters, title: event.target.value }); setPromptPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Продукт" sortKey="productKey" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)}>
                <input value={promptFilters.productKey} onChange={(event) => { setPromptFilters({ ...promptFilters, productKey: event.target.value }); setPromptPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Статус" sortKey="status" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)}>
                <select value={promptFilters.status} onChange={(event) => { setPromptFilters({ ...promptFilters, status: event.target.value }); setPromptPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="active">Включено</option>
                  <option value="off">Отключено</option>
                </select>
              </CompactHeader>
              <CompactHeader label="Источник" sortKey="source" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)}>
                <select value={promptFilters.source} onChange={(event) => { setPromptFilters({ ...promptFilters, source: event.target.value }); setPromptPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="database">ручные</option>
                  <option value="default">по умолчанию</option>
                </select>
              </CompactHeader>
              <CompactHeader label="Обновлено" sortKey="updatedAt" activeSortKey={promptSort.key} direction={promptSort.direction} onSort={(key) => togglePromptSort(key as typeof promptSort.key)} />
              <th className={`${COMPACT_HEADER_CLASS} p-0 align-top`}>
                <div className="px-1.5 py-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">Текст промта</div>
                <input value={promptFilters.promptText} onChange={(event) => { setPromptFilters({ ...promptFilters, promptText: event.target.value }); setPromptPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </th>
              <th className={`${COMPACT_HEADER_CLASS} border-r-0 px-1.5 py-2`}>Действия</th>
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
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-[var(--soft-ink-soft)]">Расход токенов и денег</h2>
          <p className="text-xs text-[var(--soft-ink-soft)]">
            Период: {usagePeriod} · AIRequest + аудит взаимодействий
          </p>
        </div>
        <CompactTableShell minWidth="1120px">
          <thead className="bg-[var(--soft-surface)] text-[var(--soft-ink-soft)]">
            <tr>
              <CompactHeader label="Продукт / функция" sortKey="feature" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)}>
                <input value={usageFilters.feature} onChange={(event) => { setUsageFilters({ ...usageFilters, feature: event.target.value }); setUsagePage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Провайдер" sortKey="provider" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)}>
                <select value={usageFilters.provider} onChange={(event) => { setUsageFilters({ ...usageFilters, provider: event.target.value }); setUsagePage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                  <option value="NO_PROVIDER">Провайдер не указан</option>
                </select>
              </CompactHeader>
              <CompactHeader label="Модель" sortKey="model" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)}>
                <input value={usageFilters.model} onChange={(event) => { setUsageFilters({ ...usageFilters, model: event.target.value }); setUsagePage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Статус" sortKey="status" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)}>
                <select value={usageFilters.status} onChange={(event) => { setUsageFilters({ ...usageFilters, status: event.target.value }); setUsagePage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="SUCCEEDED">{statusLabel("SUCCEEDED")}</option>
                  <option value="FAILED">{statusLabel("FAILED")}</option>
                  <option value="RUNNING">{statusLabel("RUNNING")}</option>
                  <option value="TIMEOUT">Таймаут</option>
                </select>
              </CompactHeader>
              <CompactHeader label="Запросы / попытки" sortKey="requests" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)} />
              <CompactHeader label="Токены" sortKey="tokens" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)} />
              <CompactHeader label={`Стоимость, ${moneyUnit}`} sortKey="cost" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)} />
              <CompactHeader label="Время ответа" sortKey="latency" activeSortKey={usageSort.key} direction={usageSort.direction} onSort={(key) => toggleUsageSort(key as typeof usageSort.key)} />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--soft-paper-edge)]">
            {pagedUsageRows.length === 0 ? (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-[var(--soft-ink-soft)]">За период и окно аудита пока нет LLM-расхода</td></tr>
            ) : pagedUsageRows.map((row) => (
              <tr key={`${row.feature}:${row.provider}:${row.model}:${row.status}`}>
                <td className={`${COMPACT_CELL_CLASS} font-medium text-[var(--soft-ink)]`}>{row.feature}</td>
                <td className={COMPACT_CELL_CLASS}>{row.provider}</td>
                <td className={`${COMPACT_CELL_CLASS} max-w-[20rem] break-all font-mono`}>{row.model}</td>
                <td className={COMPACT_CELL_CLASS}><SoftBadge className={statusTone(row.status)}>{statusLabel(row.status)}</SoftBadge></td>
                <td className={COMPACT_CELL_CLASS}>{row.requestCount}/{row.attemptCount}</td>
                <td className={COMPACT_CELL_CLASS}>{formatTokens(row.totalTokens)}</td>
                <td className={COMPACT_CELL_CLASS}>{formatCost(row.costMicros)}</td>
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
                <input type="date" value={interactionFilters.createdAt} onChange={(event) => { setInteractionFilters({ ...interactionFilters, createdAt: event.target.value }); setInteractionPage(1); }} className={COMPACT_INPUT_CLASS} aria-label="Фильтр по дате LLM-аудита" />
              </CompactHeader>
              <CompactHeader label="Функция" sortKey="feature" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)}>
                <input value={interactionFilters.feature} onChange={(event) => { setInteractionFilters({ ...interactionFilters, feature: event.target.value }); setInteractionPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Пользователь" sortKey="user" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)}>
                <input value={interactionFilters.user} onChange={(event) => { setInteractionFilters({ ...interactionFilters, user: event.target.value }); setInteractionPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
              </CompactHeader>
              <CompactHeader label="Статус" sortKey="status" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)}>
                <select value={interactionFilters.status} onChange={(event) => { setInteractionFilters({ ...interactionFilters, status: event.target.value }); setInteractionPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  <option value="SUCCEEDED">{statusLabel("SUCCEEDED")}</option>
                  <option value="FAILED">{statusLabel("FAILED")}</option>
                  <option value="RUNNING">{statusLabel("RUNNING")}</option>
                </select>
              </CompactHeader>
              <CompactHeader label="Провайдер / модель" sortKey="provider" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)}>
                <select value={interactionFilters.provider} onChange={(event) => { setInteractionFilters({ ...interactionFilters, provider: event.target.value }); setInteractionPage(1); }} className={COMPACT_SELECT_CLASS}>
                  <option value="all">Все</option>
                  {PROVIDERS.map((provider) => <option key={provider} value={provider}>{provider}</option>)}
                </select>
              </CompactHeader>
              <CompactHeader label="Токены" sortKey="tokens" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)} />
              <CompactHeader label={`Стоимость, ${moneyUnit}`} sortKey="cost" activeSortKey={interactionSort.key} direction={interactionSort.direction} onSort={(key) => toggleInteractionSort(key as typeof interactionSort.key)} />
              <th className={`${COMPACT_HEADER_CLASS} p-0 align-top`}>
                <div className="px-1.5 py-2 text-[10px] font-semibold uppercase tracking-[0.04em] text-[var(--soft-ink-soft)]">Ответ</div>
                <input value={interactionFilters.answer} onChange={(event) => { setInteractionFilters({ ...interactionFilters, answer: event.target.value }); setInteractionPage(1); }} className={COMPACT_INPUT_CLASS} placeholder="Фильтр" />
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
                <td className={`${COMPACT_CELL_CLASS} text-[var(--soft-ink-soft)]`}>{interaction.userLabel ?? interaction.userId ?? "анонимно"}</td>
                <td className={COMPACT_CELL_CLASS}><SoftBadge className={statusTone(interaction.status)}>{statusLabel(interaction.status)}</SoftBadge></td>
                <td className={`${COMPACT_CELL_CLASS} max-w-[20rem] break-all font-mono text-[11px]`}>
                  {interaction.responseProvider ?? interaction.attempts.at(-1)?.provider ?? "провайдер не указан"} / {interaction.responseModel ?? interaction.attempts.at(-1)?.model ?? "модель не указана"}
                </td>
                <td className={`${COMPACT_CELL_CLASS} text-[var(--soft-ink-soft)]`}>{formatTokens(interaction.totalTokens)}</td>
                <td className={`${COMPACT_CELL_CLASS} text-[var(--soft-ink-soft)]`}>{formatCost(interaction.estimatedCostMicros)}</td>
                <td className={`${COMPACT_CELL_CLASS} max-w-[24rem] whitespace-normal break-words text-[var(--soft-ink)]`}>
                  <RenderedAuditText content={interaction.responseText ?? interaction.errorText ?? "Нет ответа"} className="max-h-24 overflow-hidden" />
                </td>
                <td className={`${COMPACT_CELL_CLASS} border-r-0`}>
                  <button type="button" className="soft-admin-action" data-variant="subtle" onClick={() => setOpenInteractionId(interaction.id)}>
                    Открыть
                  </button>
                  {openInteractionId === interaction.id ? (
                    <InteractionAuditModal interaction={interaction} formatCost={formatCost} onClose={() => setOpenInteractionId(null)} />
                  ) : null}
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
