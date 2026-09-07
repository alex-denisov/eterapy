"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, RotateCcw, Sliders } from "lucide-react";
import type { PlaybookOverrideResult } from "@/lib/marketing/playbook-settings";

export function MarketingPlatformPlaybooks({
  initialPlaybooks,
}: {
  initialPlaybooks: Record<string, PlaybookOverrideResult>;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [playbooks, setPlaybooks] = useState(initialPlaybooks);
  const [editingPlatform, setEditingPlatform] = useState<string | null>(null);
  const [jsonText, setJsonText] = useState("");
  const [saving, setSaving] = useState(false);

  function startEditing(platform: string) {
    const current = playbooks[platform];
    const overridesOnly: Record<string, unknown> = {};
    for (const field of current.overridden) {
      overridesOnly[field] = (current.contract as unknown as Record<string, unknown>)[field];
    }
    setEditingPlatform(platform);
    setJsonText(JSON.stringify(overridesOnly, null, 2));
  }

  async function handleSave(platform: string) {
    setSaving(true);
    try {
      let parsed: Record<string, unknown> = {};
      if (jsonText.trim()) {
        try {
          parsed = JSON.parse(jsonText);
        } catch {
          toast.error("Некорректный JSON в поле переопределений");
          setSaving(false);
          return;
        }
      }

      const response = await fetch("/api/admin/marketing/agent/playbooks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, override: parsed }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        toast.error(data?.error ?? `Ошибка сохранения для ${platform}`);
        setSaving(false);
        return;
      }

      toast.success(`${platform}: контракт обновлен`);
      setPlaybooks((prev) => ({
        ...prev,
        [platform]: data.result,
      }));
      setEditingPlatform(null);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  async function handleReset(platform: string) {
    if (!confirm(`Сбросить все переопределения для ${platform} к значениям по умолчанию в коде?`)) {
      return;
    }
    setSaving(true);
    try {
      const response = await fetch("/api/admin/marketing/agent/playbooks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, override: null }),
      });

      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        toast.error(data?.error ?? `Ошибка сброса для ${platform}`);
        setSaving(false);
        return;
      }

      toast.success(`${platform}: сброшено к умолчаниям в коде`);
      setPlaybooks((prev) => ({
        ...prev,
        [platform]: data.result,
      }));
      setEditingPlatform(null);
      startTransition(() => router.refresh());
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
      {Object.entries(playbooks).map(([platform, overrideResult]) => {
        const { contract, overridden, rejected } = overrideResult;
        const isEditing = editingPlatform === platform;

        return (
          <div
            key={platform}
            className="flex flex-col justify-between rounded-xl border border-[var(--soft-paper-edge)] bg-white p-4 text-xs shadow-sm transition hover:shadow-md"
          >
            <div>
              <div className="flex items-center justify-between gap-2 border-b border-[var(--soft-paper-edge)] pb-2.5">
                <div className="flex items-center gap-2">
                  <span className="font-bold uppercase tracking-wider text-[var(--soft-ink-strong)]">
                    {platform}
                  </span>
                  {overridden.length > 0 ? (
                    <span className="soft-admin-status-pill" data-tone="ok">
                      изменено: {overridden.length}
                    </span>
                  ) : (
                    <span className="soft-admin-status-pill" data-tone="neutral">
                      по коду
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => (isEditing ? setEditingPlatform(null) : startEditing(platform))}
                  className="inline-flex items-center gap-1 text-[var(--soft-ink-soft)] hover:text-[var(--soft-ink-strong)]"
                  title="Настроить контракт"
                >
                  <Sliders className="size-3.5" />
                  <span>{isEditing ? "Закрыть" : "Правка"}</span>
                </button>
              </div>

              {rejected.length > 0 && (
                <div className="mt-2.5 rounded-lg border border-red-200 bg-red-50 p-2 text-red-700">
                  <div className="flex items-center gap-1.5 font-semibold text-[0.7rem]">
                    <AlertTriangle className="size-3" />
                    <span>Отклоненные значения:</span>
                  </div>
                  <ul className="mt-1 list-disc pl-4 space-y-0.5 text-[0.68rem]">
                    {rejected.map((rej, idx) => (
                      <li key={idx}>
                        <code>{rej.field}</code>: {rej.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isEditing ? (
                <div className="mt-3 space-y-2">
                  <p className="text-[0.68rem] text-[var(--soft-ink-soft)]">
                    JSON-переопределение параметров (например,{" "}
                    <code>{`{"maxCharacters": 520, "maxEmoji": 2}`}</code>):
                  </p>
                  <textarea
                    value={jsonText}
                    onChange={(e) => setJsonText(e.target.value)}
                    rows={6}
                    className="w-full rounded-md border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-subtle)] p-2 font-mono text-[0.7rem] text-[var(--soft-ink-strong)] focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleReset(platform)}
                      className="inline-flex items-center gap-1 text-red-600 hover:text-red-800 disabled:opacity-50"
                    >
                      <RotateCcw className="size-3" />
                      Сброс
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSave(platform)}
                      className="rounded bg-blue-600 px-3 py-1 font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? "Сохранение..." : "Применить"}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-x-2 gap-y-1.5 text-[0.72rem] text-[var(--soft-ink-soft)]">
                  <div>
                    <span className="opacity-70">Символов:</span>{" "}
                    <span className={`font-mono font-medium ${overridden.includes("maxCharacters") ? "text-blue-700" : "text-[var(--soft-ink-strong)]"}`}>
                      {contract.minCharacters}–{contract.maxCharacters ?? "∞"}
                    </span>
                  </div>
                  <div>
                    <span className="opacity-70">Хук (симв.):</span>{" "}
                    <span className="font-mono text-[var(--soft-ink-strong)]">
                      {contract.hookCharacters}
                    </span>
                  </div>
                  <div>
                    <span className="opacity-70">CTA политика:</span>{" "}
                    <span className={`font-mono font-medium ${overridden.includes("ctaPolicy") ? "text-blue-700" : "text-[var(--soft-ink-strong)]"}`}>
                      {contract.ctaPolicy}
                    </span>
                  </div>
                  <div>
                    <span className="opacity-70">Макс. эмодзи:</span>{" "}
                    <span className={`font-mono font-medium ${overridden.includes("maxEmoji") ? "text-blue-700" : "text-[var(--soft-ink-strong)]"}`}>
                      {contract.maxEmoji}
                    </span>
                  </div>
                  <div>
                    <span className="opacity-70">Хэштеги:</span>{" "}
                    <span className="font-mono text-[var(--soft-ink-strong)]">
                      {contract.minHashtags}–{contract.maxHashtags}
                    </span>
                  </div>
                  <div>
                    <span className="opacity-70">Ссылки:</span>{" "}
                    <span className="font-mono text-[var(--soft-ink-strong)]">
                      {contract.maxLinks} {contract.linksClickable ? "(клик)" : "(текст)"}
                    </span>
                  </div>
                  <div>
                    <span className="opacity-70">Тире «—»:</span>{" "}
                    <span className="font-mono text-[var(--soft-ink-strong)]">
                      {contract.emDashAllowed ? "разрешено" : "запрещено"}
                    </span>
                  </div>
                  <div>
                    <span className="opacity-70">Медиа-бриф:</span>{" "}
                    <span className="font-mono text-[var(--soft-ink-strong)]">
                      {contract.mediaBriefRequired ? "обязателен" : "нет"}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-3 flex items-center justify-between border-t border-[var(--soft-paper-edge)] pt-2 text-[0.65rem] text-[var(--soft-ink-faint)]">
              <span>Параметров: 18</span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="size-3 text-emerald-600" />
                валидатор активен
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
