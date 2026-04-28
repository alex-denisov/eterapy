"use client";

import { useState, useTransition } from "react";
import { AIProvider } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export function AIControlCenter({
  providers,
  policies,
  usage,
}: {
  providers: ProviderRow[];
  policies: PolicyRow[];
  usage: UsageRow[];
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

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
                <CheckboxSwitch name="enabled" defaultChecked={provider.enabled} label={`Enable ${provider.displayName}`} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input name="priority" type="number" defaultValue={provider.priority} placeholder="Priority" />
                <Input name="timeoutMs" type="number" defaultValue={provider.timeoutMs} placeholder="Timeout ms" />
                <Input name="defaultModel" defaultValue={provider.defaultModel ?? ""} placeholder="Default model" className="sm:col-span-2" />
                <Input name="baseUrl" defaultValue={provider.baseUrl ?? ""} placeholder="Base URL override" className="sm:col-span-2" />
                <Input name="inputTokenCostMicros" type="number" defaultValue={provider.inputTokenCostMicros ?? ""} placeholder="Input cost / 1K tokens" />
                <Input name="outputTokenCostMicros" type="number" defaultValue={provider.outputTokenCostMicros ?? ""} placeholder="Output cost / 1K tokens" />
              </div>
              <Button type="submit" size="sm" className="mt-4" disabled={isPending}>Сохранить</Button>
            </form>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1fr_0.8fr]">
        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Routing policies</h2>
          <form action={submitPolicy} className="mb-4 rounded-lg border border-border/30 bg-card/30 p-4" data-testid="ai-policy-form">
            <div className="mb-4 flex items-center justify-between gap-3">
              <Input name="feature" placeholder="feature, например dialogue-primary-answer" required />
              <CheckboxSwitch name="enabled" defaultChecked label="Enable policy" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="providerOrder" defaultValue="OPENROUTER,OPENAI,ANTHROPIC,FIREWORKS" placeholder="Provider order" className="sm:col-span-2" />
              <Input name="maxTokens" type="number" placeholder="Max tokens" />
              <Input name="temperature" type="number" step="0.1" placeholder="Temperature" />
              <Input name="timeoutMs" type="number" placeholder="Timeout ms" />
              <Input name="dailyTokenBudget" type="number" placeholder="Feature daily budget" />
              <Input name="perUserDailyTokenBudget" type="number" placeholder="User daily budget" />
            </div>
            <Button type="submit" size="sm" className="mt-4" disabled={isPending}>Создать / обновить</Button>
          </form>
          <div className="overflow-hidden rounded-lg border border-border/30 bg-card/30 divide-y divide-border/10">
            {policies.length === 0 ? (
              <p className="px-4 py-3 text-sm text-muted-foreground">Routing policies еще не настроены</p>
            ) : policies.map((policy) => (
              <div key={policy.feature} className="px-4 py-3" data-testid={`ai-policy-${policy.feature}`}>
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">{policy.feature}</p>
                  <span className={policy.enabled ? "text-xs text-emerald-300" : "text-xs text-amber-300"}>{policy.enabled ? "enabled" : "disabled"}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{policy.providerOrder.join(" -> ") || "default order"}</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Usage today</h2>
          <div className="overflow-hidden rounded-lg border border-border/30 bg-card/30 divide-y divide-border/10">
            {usage.slice(0, 12).map((row) => (
              <div key={`${row.scopeType}:${row.scopeKey}`} className="px-4 py-3" data-testid={`ai-usage-${row.scopeType}-${row.scopeKey}`}>
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{row.scopeType}:{row.scopeKey}</span>
                  <span className="text-primary">{row.tokens.toLocaleString("ru")} tok</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{row.requestCount} requests · {row.costMicros.toLocaleString("ru")} micros</p>
              </div>
            ))}
            {usage.length === 0 && <p className="px-4 py-3 text-sm text-muted-foreground">Usage ledger пуст</p>}
          </div>
        </div>
      </section>
    </div>
  );
}
