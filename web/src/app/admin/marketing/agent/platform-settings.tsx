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
    <div className="grid gap-4 lg:grid-cols-2">
      {configs.map((config) => {
        const draft = drafts[config.platform];
        return (
          <form
            key={config.platform}
            className="rounded-xl border border-[var(--soft-paper-edge)] bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void save(config.platform);
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-[var(--soft-ink-strong)]">{config.platform}</h3>
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
            </div>
            <div className="mt-3 grid gap-3">
              {config.fields.map((field) => (
                <label key={field.key} className="grid gap-1 text-xs text-[var(--soft-ink-soft)]">
                  <span>{field.label}</span>
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
                </label>
              ))}
            </div>
            <button className="soft-admin-action mt-4" data-variant="primary" type="submit" disabled={pending}>
              Сохранить и применить
            </button>
          </form>
        );
      })}
    </div>
  );
}
