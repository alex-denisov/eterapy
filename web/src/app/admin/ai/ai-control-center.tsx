"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const AIProvider = {
  OPENAI: "OPENAI",
  ANTHROPIC: "ANTHROPIC",
  FIREWORKS: "FIREWORKS",
  OPENROUTER: "OPENROUTER",
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
};

type PolicyRow = {
  feature: string;
  enabled: boolean;
  providerOrder: AIProvider[];
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

type CredentialRow = {
  id: string;
  provider: AIProvider;
  label: string;
  apiKeyPreview: string;
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
};

type ModelsByProvider = Partial<Record<string, ModelRow[]>>;

const PROVIDERS = Object.values(AIProvider);

function toNumber(value: FormDataEntryValue | null) {
  if (!value || String(value).trim() === "") return null;
  return Number(value);
}

async function patchAIControl(payload: unknown) {
  const response = await fetch("/api/admin/ai/control", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error("AI config update failed");
}

function CheckboxSwitch({ name, defaultChecked, label }: { name: string; defaultChecked?: boolean; label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <input name={name} type="checkbox" defaultChecked={defaultChecked} aria-label={label} className="peer sr-only" />
      <span className="relative inline-flex h-5 w-10 shrink-0 rounded-full bg-muted/40 transition-colors after:absolute after:left-1 after:top-0.5 after:h-4 after:w-4 after:rounded-full after:bg-white after:shadow after:transition-transform peer-checked:bg-primary peer-checked:after:translate-x-5" />
    </label>
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
      className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      <option value="__none__">{placeholder ?? "Модель по умолчанию"}</option>
      {models.length === 0 && <option value="" disabled>Список моделей пуст — нажмите «Обновить»</option>}
      {models.map((model) => (
        <option key={model.modelId} value={model.modelId}>
          {model.isFree ? "Бесплатная · " : ""}
          {model.modelId}
          {model.displayName ? ` — ${model.displayName}` : ""}
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
  disabled,
}: {
  credential: CredentialRow;
  models: ModelRow[];
  onUpdate: (payload: Record<string, unknown>, msg: string) => Promise<void> | void;
  onDelete: () => Promise<void> | void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState({
    label: credential.label,
    apiKey: "",
    priority: credential.priority,
    modelOverride: credential.modelOverride ?? "",
    baseUrlOverride: credential.baseUrlOverride ?? "",
  });

  const cooldownActive = credential.cooldownUntil && new Date(credential.cooldownUntil) > new Date();
  const status = !credential.enabled
    ? { label: "выключен", color: "text-muted-foreground" }
    : credential.regionBlocked
      ? { label: "регион заблокирован", color: "text-red-300" }
      : cooldownActive
        ? { label: "пауза после ошибки", color: "text-amber-300" }
        : { label: "активен", color: "text-emerald-300" };

  return (
    <div className="px-4 py-3 space-y-3" data-testid={`ai-credential-${credential.id}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">{credential.label}</p>
          <p className="text-xs text-muted-foreground">
            <span className={status.color}>{status.label}</span>
            {credential.lastSuccessAt && <> · последний успех {new Date(credential.lastSuccessAt).toLocaleString("ru")}</>}
            {credential.lastErrorCode && <> · последняя ошибка {credential.lastErrorCode}</>}
            {credential.consecutiveFailures > 0 && <> · ошибок подряд {credential.consecutiveFailures}</>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onUpdate({ enabled: !credential.enabled }, credential.enabled ? "Ключ выключен" : "Ключ включён")}
          >
            {credential.enabled ? "Выключить" : "Включить"}
          </Button>
          {(credential.regionBlocked || cooldownActive || credential.consecutiveFailures > 0) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={disabled}
              onClick={() => onUpdate({ resetFailureState: true }, "Состояние ошибок сброшено")}
            >
              Сбросить статус
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={disabled}
            onClick={() => onDelete()}
          >
            Удалить
          </Button>
        </div>
      </div>
      <div className="grid gap-2 sm:grid-cols-[120px_1fr_1fr_1fr_auto]">
        <Input
          value={draft.label}
          onChange={(event) => setDraft({ ...draft, label: event.target.value })}
          placeholder="Метка"
        />
        <Input
          value={draft.apiKey}
          onChange={(event) => setDraft({ ...draft, apiKey: event.target.value })}
          placeholder={`${credential.apiKeyPreview} — введите новый ключ для замены`}
          type="password"
          spellCheck={false}
          autoComplete="off"
        />
        <ModelSelect
          value={draft.modelOverride}
          models={models}
          onChange={(value) => setDraft({ ...draft, modelOverride: value })}
          placeholder="Модель по умолчанию или override"
        />
        <Input
          value={draft.baseUrlOverride}
          onChange={(event) => setDraft({ ...draft, baseUrlOverride: event.target.value })}
          placeholder="Переопределение Base URL"
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
            if (draft.apiKey.trim()) payload.apiKey = draft.apiKey.trim();
            void onUpdate(payload, `Ключ ${draft.label} сохранён`);
            setDraft({ ...draft, apiKey: "" });
          }}
        >
          Сохранить
        </Button>
      </div>
    </div>
  );
}

type CloudflareGatewayState =
  | { configured: true; accountId: string; gatewayId: string; hasToken: boolean; openaiUrl: string }
  | { configured: false };

export function AIControlCenter({
  providers,
  policies,
  usage,
  credentials,
  models,
  encryptionConfigured,
  cloudflareGateway,
}: {
  providers: ProviderRow[];
  policies: PolicyRow[];
  usage: UsageRow[];
  credentials: CredentialRow[];
  models: ModelsByProvider;
  encryptionConfigured: boolean;
  cloudflareGateway: CloudflareGatewayState;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState<AIProvider | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  async function refreshProviderModels(provider: AIProvider) {
    setRefreshing(provider);
    setMessage(null);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/admin/ai/models?provider=${provider}`, { method: "POST" });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setErrorMessage(body?.error ?? body?.message ?? `Не удалось обновить список моделей ${provider}`);
        return;
      }
      const body = await response.json();
      setMessage(`Каталог моделей ${provider} обновлён: ${body.count} (удалено ${body.removed})`);
      router.refresh();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Не удалось обновить список моделей");
    } finally {
      setRefreshing(null);
    }
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
      }).then(() => setMessage("Настройки провайдера сохранены"));
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
      }).then(() => setMessage("Routing policy сохранена"));
    });
  }

  return (
    <div className="space-y-6" data-testid="admin-ai-control-center">
      {message && (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200" data-testid="ai-control-toast">
          {message}
        </div>
      )}
      {errorMessage && (
        <div className="rounded-lg border border-red-500/25 bg-red-500/10 px-4 py-3 text-sm text-red-200" data-testid="ai-control-error">
          {errorMessage}
        </div>
      )}
      {!encryptionConfigured && (
        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-200" data-testid="ai-encryption-warning">
          AI_CREDENTIAL_KEY не настроен на сервере. Управление ключами недоступно — добавьте 32-байтный ключ в env (см. DEPLOY.md).
        </div>
      )}
      {cloudflareGateway.configured ? (
        <div className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200" data-testid="ai-cf-gateway-info">
          <div className="font-medium">Cloudflare AI Gateway настроен</div>
          <p className="mt-1 text-xs text-emerald-200/80">
            Gateway: <code className="font-mono">{cloudflareGateway.gatewayId}</code> · аккаунт <code className="font-mono">{cloudflareGateway.accountId.slice(0, 8)}…</code> · токен авторизации: {cloudflareGateway.hasToken ? "присутствует" : "отсутствует (Authenticated Gateway отключён)"}
          </p>
          <p className="mt-1 text-xs text-emerald-200/80">
            Чтобы прокинуть OpenAI через CF Gateway, создайте отдельный ключ c этим переопределением Base URL:
          </p>
          <code className="mt-1 block break-all rounded bg-black/30 px-2 py-1 font-mono text-xs">
            {cloudflareGateway.openaiUrl}
          </code>
        </div>
      ) : (
        <div className="rounded-lg border border-sky-500/25 bg-sky-500/10 px-4 py-3 text-xs text-sky-200" data-testid="ai-cf-gateway-missing">
          Cloudflare AI Gateway не настроен. Чтобы обойти региональную блокировку OpenAI на VPS, выставите CF_AI_GATEWAY_ACCOUNT_ID, CF_AI_GATEWAY_ID и (опционально) CF_AI_GATEWAY_TOKEN в env (см. DEPLOY.md).
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Провайдеры</h2>
        <div className="grid gap-4 lg:grid-cols-2">
          {providers.map((provider) => (
            <form key={provider.provider} action={submitProvider} className="rounded-lg border border-border/30 bg-card/30 p-4" data-testid={`ai-provider-${provider.provider}`}>
              <input type="hidden" name="provider" value={provider.provider} />
              <div className="mb-4 flex items-center justify-between gap-3">
                <div>
                  <h3 className="font-semibold">{provider.displayName}</h3>
                  <p className="text-xs text-muted-foreground">{provider.provider}</p>
                </div>
                <CheckboxSwitch name="enabled" defaultChecked={provider.enabled} label={`Включить ${provider.displayName}`} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input name="priority" type="number" defaultValue={provider.priority} placeholder="Приоритет" />
                <Input name="timeoutMs" type="number" defaultValue={provider.timeoutMs} placeholder="Таймаут, мс" />
                <Input name="defaultModel" defaultValue={provider.defaultModel ?? ""} placeholder="Модель по умолчанию" className="sm:col-span-2" />
                <Input name="baseUrl" defaultValue={provider.baseUrl ?? ""} placeholder="Переопределение Base URL" className="sm:col-span-2" />
                <Input name="inputTokenCostMicros" type="number" defaultValue={provider.inputTokenCostMicros ?? ""} placeholder="Стоимость входа / 1K токенов" />
                <Input name="outputTokenCostMicros" type="number" defaultValue={provider.outputTokenCostMicros ?? ""} placeholder="Стоимость выхода / 1K токенов" />
              </div>
              <Button type="submit" size="sm" className="mt-4" disabled={isPending}>Сохранить</Button>
            </form>
          ))}
        </div>
      </section>

      <section data-testid="admin-ai-credentials">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">API ключи (по провайдерам)</h2>
        <p className="mb-4 text-xs text-muted-foreground">
          Несколько ключей на провайдера. Маршрутизация выбирает наименее недавно использованный активный ключ. При HTTP_403 (region) переключаемся на другого провайдера; при 401/402/429 — на следующий ключ того же провайдера после cooldown.
        </p>
        <div className="space-y-6">
          {PROVIDERS.map((provider) => {
            const providerCredentials = credentials.filter((credential) => credential.provider === provider);
            const providerModels = models[provider] ?? [];
            const lastFetchedAt = providerModels[0]?.fetchedAt ?? null;
            const allowsCredentialless = provider === AIProvider.OPENROUTER;
            const refreshDisabled = refreshing === provider || isPending
              || (!allowsCredentialless && providerCredentials.filter((c) => c.enabled).length === 0);
            return (
              <div key={provider} className="rounded-lg border border-border/30 bg-card/30 p-4" data-testid={`ai-credentials-${provider}`}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{provider}</h3>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span data-testid={`ai-models-count-${provider}`}>
                      моделей в каталоге: {providerModels.length}
                      {lastFetchedAt && <> · обновлено {new Date(lastFetchedAt).toLocaleString("ru")}</>}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={refreshDisabled}
                      onClick={() => { void refreshProviderModels(provider); }}
                      data-testid={`ai-models-refresh-${provider}`}
                    >
                      {refreshing === provider ? "Обновляем…" : "Обновить список"}
                    </Button>
                  </div>
                </div>
                <div className="overflow-hidden rounded-lg border border-border/20 divide-y divide-border/10">
                  {providerCredentials.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">Ключи не настроены</p>
                  ) : providerCredentials.map((credential) => (
                    <CredentialRowEditor
                      key={credential.id}
                      credential={credential}
                      models={providerModels}
                      onUpdate={(payload, msg) => patchCredential(credential.id, payload, msg)}
                      onDelete={() => deleteCredentialById(credential.id, credential.label)}
                      disabled={!encryptionConfigured || isPending}
                    />
                  ))}
                </div>
                <form
                  className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr_1fr_1fr_auto]"
                  action={(formData) => {
                    startTransition(() => { void createCredential(formData); });
                  }}
                  data-testid={`ai-credentials-${provider}-create`}
                >
                  <input type="hidden" name="provider" value={provider} />
                  <Input name="label" placeholder="Метка (Аккаунт 1)" required />
                  <Input name="apiKey" placeholder="API ключ" type="password" required />
                  <select
                    name="modelOverride"
                    defaultValue=""
                    className="flex h-9 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  >
                    <option value="">Модель по умолчанию</option>
                    {providerModels.map((model) => (
                      <option key={model.modelId} value={model.modelId}>
                        {model.isFree ? "Бесплатная · " : ""}{model.modelId}
                      </option>
                    ))}
                  </select>
                  <Input name="baseUrlOverride" placeholder="Переопределение Base URL" />
                  <Button type="submit" size="sm" disabled={!encryptionConfigured || isPending}>Добавить ключ</Button>
                </form>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Политики маршрутизации</h2>
          <form action={submitPolicy} className="mb-4 rounded-lg border border-border/30 bg-card/30 p-4" data-testid="ai-policy-form">
            <div className="mb-4 flex items-center justify-between gap-3">
              <Input name="feature" placeholder="Фича, например dialogue-primary-answer" required />
              <CheckboxSwitch name="enabled" defaultChecked label="Включить политику" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="providerOrder" defaultValue="OPENROUTER,OPENAI,ANTHROPIC,FIREWORKS" placeholder="Порядок провайдеров" className="sm:col-span-2" />
              <Input name="maxTokens" type="number" placeholder="Максимум токенов" />
              <Input name="temperature" type="number" step="0.1" placeholder="Температура" />
              <Input name="timeoutMs" type="number" placeholder="Таймаут, мс" />
              <Input name="dailyTokenBudget" type="number" placeholder="Дневной бюджет фичи" />
              <Input name="perUserDailyTokenBudget" type="number" placeholder="Дневной бюджет пользователя" />
            </div>
            <Button type="submit" size="sm" className="mt-4" disabled={isPending}>Создать / обновить</Button>
          </form>
          <div className="overflow-hidden rounded-lg border border-border/30 bg-card/30 divide-y divide-border/10">
            {policies.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Политики маршрутизации еще не настроены</p>
            ) : policies.map((policy) => (
              <div key={policy.feature} className="px-4 py-3" data-testid={`ai-policy-${policy.feature}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{policy.feature}</p>
                  <span className={policy.enabled ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>{policy.enabled ? "включено" : "выключено"}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{policy.providerOrder.join(" -> ") || "порядок по умолчанию"}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Использование сегодня</h2>
          <div className="overflow-hidden rounded-lg border border-border/30 bg-card/30 divide-y divide-border/10">
            {usage.slice(0, 12).map((row) => (
              <div key={`${row.scopeType}:${row.scopeKey}`} className="px-4 py-3" data-testid={`ai-usage-${row.scopeType}-${row.scopeKey}`}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{row.scopeType}:{row.scopeKey}</span>
                  <span className="text-primary">{row.tokens.toLocaleString("ru")} токенов</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{row.requestCount} запросов · {row.costMicros.toLocaleString("ru")} микросписаний</p>
              </div>
            ))}
            {usage.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Журнал использования пуст</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
