"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";
import {
  directionLabel,
  directionsForCategories,
  specialtiesForDirections,
} from "@/lib/practitioner-taxonomy";
import type { InitialServicesData } from "./services-editor-mobile";

/**
 * B466 R9-5 desktop — редактор «Направления работы» на экране «Услуги».
 *
 * Утверждённый десктоп-макет practitioner-desktop-services-v2 показывает на
 * «Услугах» только направления (chips add/remove) — специализация/темы/форматы
 * доставки живут на других экранах. Механика 1-в-1 с мобильным редактором
 * `PractitionerServicesEditorMobile`: те же taxonomy-хелперы и тот же
 * partial-safe `PATCH /api/practitioner/profile`. Категории/темы/форматы
 * держатся неизменными и отправляются как есть, чтобы не затереть их правки с
 * других экранов (маршрут обновляет только переданные поля).
 */
export function ServicesDirectionsEditor({ initial }: { initial: InitialServicesData }) {
  const [directions, setDirections] = useState<string[]>(initial.directions);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const addable = directionsForCategories(initial.categories).filter(
    (d) => !directions.includes(d.id),
  );

  async function persist(next: string[]) {
    const prev = directions;
    setDirections(next);
    setSaving(true);
    try {
      const res = await fetch("/api/practitioner/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: initial.categories,
          directions: next,
          // зеркалим эзотерические направления в legacy Specialty enum
          specialties: specialtiesForDirections(next),
          tags: initial.tags,
          formats: initial.formats,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.ok === false) {
        throw new Error(typeof data.error === "string" ? data.error : "Не удалось сохранить");
      }
      toast.success("Направления обновлены");
    } catch (err) {
      setDirections(prev);
      toast.error(err instanceof Error ? err.message : "Не удалось сохранить");
    } finally {
      setSaving(false);
    }
  }

  function addDirection(id: string) {
    if (directions.includes(id)) return;
    void persist([...directions, id]);
  }
  function removeDirection(id: string) {
    void persist(directions.filter((d) => d !== id));
  }

  return (
    <div data-testid="practitioner-services-directions">
      <div className="flex flex-wrap gap-[7px]">
        {directions.map((id) => (
          <span
            key={id}
            className="inline-flex items-center gap-1.5 rounded-full bg-[var(--soft-paper-deep)] px-3 py-[6px] text-[12px] text-[var(--soft-ink-soft)]"
          >
            {directionLabel(id)}
            <button
              type="button"
              aria-label={`Убрать ${directionLabel(id)}`}
              disabled={saving}
              onClick={() => removeDirection(id)}
              className="grid h-[15px] w-[15px] place-items-center rounded-full text-[var(--soft-ink-faint)] transition hover:bg-[var(--soft-paper)] hover:text-[var(--soft-bordeaux)] disabled:opacity-50"
            >
              <X width={12} height={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        {directions.length === 0 && (
          <span className="text-[12.5px] text-[var(--soft-ink-faint)]">
            Пока не выбрано ни одного направления.
          </span>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen((o) => !o)}
          className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-[var(--soft-paper-edge)] bg-transparent px-3 py-[6px] text-[12px] font-medium text-[var(--soft-terracotta-dark)] transition hover:bg-[var(--soft-paper-deep)]"
          aria-expanded={pickerOpen}
          data-testid="practitioner-services-direction-add"
        >
          <Plus width={13} height={13} aria-hidden="true" /> направление
        </button>
      </div>

      {pickerOpen && (
        <div
          className="mt-3 rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-3"
          data-testid="practitioner-services-direction-picker"
        >
          {initial.categories.length === 0 ? (
            <p className="text-[12.5px] text-[var(--soft-ink-faint)]">
              Специализация подтверждается на верификации — направления появятся после неё.
            </p>
          ) : addable.length === 0 ? (
            <p className="text-[12.5px] text-[var(--soft-ink-faint)]">Все направления уже добавлены.</p>
          ) : (
            <div className="flex flex-wrap gap-[7px]">
              {addable.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  disabled={saving}
                  onClick={() => addDirection(d.id)}
                  className="rounded-full bg-[var(--soft-paper-deep)] px-3 py-[6px] text-[12px] text-[var(--soft-ink-soft)] transition hover:bg-[var(--soft-apricot,#f4d9c1)] hover:text-[var(--soft-bordeaux)] disabled:opacity-50"
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
