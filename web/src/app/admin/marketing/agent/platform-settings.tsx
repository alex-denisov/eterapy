"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { MarketingPlatformAdminConfig } from "@/lib/marketing/platform-settings";

export function MarketingPlatformSettings({ configs }: { configs: MarketingPlatformAdminConfig[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState(() => Object.fromEntries(configs.map((config) => [
    config.platform,
    {
      enabled: config.enabled,
      values: Object.fromEntries(config.fields.map((field) => [field.key, field.value])),
    },
  ])));

  async function save(platform: MarketingPlatformAdminConfig["platform"]) {
    const response = await fetch("/api/admin/marketing/agent/platforms", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ platform, ...drafts[platform] }),
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      toast.error(body?.error ?? `Не удалось сохранить ${platform}`);
      return;
    }
    toast.success(`${platform}: настройки сохранены и применены`);
    startTransition(() => router.refresh());
  }

  return (
    // B626: шесть всегда раскрытых форм занимали высоту нескольких экранов, а
    // открыты одновременно они не нужны никогда — площадку настраивают по
    // одной. Свёрнутая строка показывает главное (активна ли, сколько полей не
    // заполнено), а форма открывается по клику.
    <div className="grid gap-2 lg:grid-cols-2 xl:grid-cols-3">
      {configs.map((config) => {
        const draft = drafts[config.platform];
        // B652: раньше незаполненным считалось ЛЮБОЕ поле, поэтому рабочий
        // канал Дзена показывался как «не задано: 2» — за необязательные
        // слепок браузерной сессии и отметку владельца о ленте.
        const blank = (field: (typeof config.fields)[number]) => (
          !field.configured && !draft.values[field.key]?.trim()
        );
        const missingRequired = config.fields.filter((field) => field.requirement === "required" && blank(field));
        const awaitingOauth = config.fields.filter((field) => field.requirement === "oauth" && blank(field));
        const optionalFields = config.fields.filter((field) => field.requirement === "optional");
        const optionalFilled = optionalFields.filter((field) => !blank(field)).length;
        const status = !draft.enabled
          ? { tone: "neutral" as const, label: "выключена" }
          : missingRequired.length > 0
            ? { tone: "warn" as const, label: `нет обязательного: ${missingRequired.length}` }
            : awaitingOauth.length > 0
              ? { tone: "warn" as const, label: "ждёт OAuth" }
              : { tone: "ok" as const, label: "активна" };
        return (
          <details
            key={config.platform}
            className="rounded-lg border border-[var(--soft-paper-edge)] bg-white"
          >
            <summary className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm">
              <span className="font-semibold text-[var(--soft-ink-strong)]">{config.platform}</span>
              <span className="flex items-center gap-2">
                {optionalFields.length > 0 && (
                  <span className="text-[0.68rem] text-[var(--soft-ink-soft)]">
                    доп. {optionalFilled}/{optionalFields.length}
                  </span>
                )}
                <span className="soft-admin-status-pill" data-tone={status.tone}>{status.label}</span>
              </span>
            </summary>
          <form
            className="border-t border-[var(--soft-paper-edge)] p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void save(config.platform);
            }}
          >
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={draft.enabled}
                onChange={(event) => setDrafts((current) => ({
                  ...current,
                  [config.platform]: { ...current[config.platform], enabled: event.target.checked },
                }))}
              />
              Активна
            </label>
            <div className="mt-3 grid gap-2">
              {config.fields.map((field) => (
                <label key={field.key} className="grid gap-1 text-xs text-[var(--soft-ink-soft)]">
                  <span>
                    {field.label}
                    {field.requirement === "optional" && <span className="opacity-60"> · необязательное</span>}
                    {field.requirement === "oauth" && <span className="opacity-60"> · заполняет OAuth</span>}
                  </span>
                  {field.multiline ? (
                    <textarea
                      className="soft-input min-h-28 resize-y font-mono text-[11px]"
                      autoComplete="off"
                      placeholder={field.secret && field.configured ? "•••••••• (оставьте пустым, чтобы сохранить)" : ""}
                      value={draft.values[field.key] ?? ""}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [config.platform]: {
                          ...current[config.platform],
                          values: { ...current[config.platform].values, [field.key]: event.target.value },
                        },
                      }))}
                    />
                  ) : (
                    <input
                      className="soft-input"
                      type={field.secret ? "password" : "text"}
                      autoComplete="off"
                      placeholder={field.secret && field.configured ? "•••••••• (оставьте пустым, чтобы сохранить)" : ""}
                      value={draft.values[field.key] ?? ""}
                      onChange={(event) => setDrafts((current) => ({
                        ...current,
                        [config.platform]: {
                          ...current[config.platform],
                          values: { ...current[config.platform].values, [field.key]: event.target.value },
                        },
                      }))}
                    />
                  )}
                </label>
              ))}
            </div>
            <button className="soft-admin-action mt-3" data-variant="primary" type="submit" disabled={pending}>
              Сохранить и применить
            </button>
          </form>
          </details>
        );
      })}
    </div>
  );
}
