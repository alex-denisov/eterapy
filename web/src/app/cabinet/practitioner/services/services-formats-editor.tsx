"use client";

import { useState } from "react";
import { toast } from "sonner";
import { SessionFormatsField } from "@/components/practitioner/session-formats-field";
import { normalizeOfferedFormats } from "@/lib/session-formats";
import type { InitialServicesData } from "./services-editor-mobile";

/**
 * B466 R9-5 — «Форматы сессий» (individual/couple/family) на экране «Услуги».
 *
 * Owner: «форматы-доставки правятся на Профиле → свести при пересборке Профиля».
 * При переводе Профиля на -profile-v2 (личные поля + «Статус и проверки») форматы
 * сессий переехали сюда, к остальным услугам. Autosave — тот же partial-safe
 * `PATCH /api/practitioner/profile`, что и направления: категории/направления/темы
 * отправляются как есть, чтобы не затереть правки с других экранов.
 */
export function ServicesFormatsEditor({ initial }: { initial: InitialServicesData }) {
  const [formats, setFormats] = useState<string[]>(normalizeOfferedFormats(initial.formats));
  const [saving, setSaving] = useState(false);

  async function persist(next: string[]) {
    const prev = formats;
    setFormats(next);
    setSaving(true);
    try {
      const res = await fetch("/api/practitioner/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: initial.categories,
          directions: initial.directions,
          tags: initial.tags,
          formats: next,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(typeof data.error === "string" ? data.error : "Не удалось сохранить");
      }
      toast.success("Форматы сессий обновлены");
    } catch (err) {
      setFormats(prev);
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div data-testid="practitioner-services-formats" aria-busy={saving}>
      <SessionFormatsField value={formats} onChange={persist} />
    </div>
  );
}
