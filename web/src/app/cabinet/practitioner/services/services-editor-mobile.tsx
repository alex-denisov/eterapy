"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  Brain,
  ChevronLeft,
  ChevronRight,
  Plus,
  Scale,
  SlidersHorizontal,
  Sparkles,
  Target,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  CATEGORIES,
  categoryIdForDirection,
  categoryLabel,
  directionLabel,
  directionsForCategories,
  specialtiesForDirections,
  tasksForCategories,
} from "@/lib/practitioner-taxonomy";
import { SESSION_FORMATS, normalizeOfferedFormats } from "@/lib/session-formats";

export interface InitialServicesData {
  categories: string[];
  directions: string[];
  tags: string[];
  formats: string[];
}

const CATEGORY_ICON: Record<string, typeof Brain> = {
  psychology: Brain,
  coaching: Target,
  legal: Scale,
  finance: Wallet,
  esoteric: Sparkles,
  joint: Users,
};

function eq(a: string, b: string) {
  return a.toLocaleLowerCase("ru-RU") === b.toLocaleLowerCase("ru-RU");
}

/**
 * B466 R9 P5 — мобильный экран «Услуги и направления» кокпита практика,
 * 1-в-1 по approved mockup practitioner-more-services. pcab-native редактор
 * таксономии (специализация → направления → темы) + форматов сессий.
 *
 * НЕ обёртка десктопных `PractitionerTaxonomyFields`/`SessionFormatsField`
 * (другой дизайн-язык). Сохраняет через **JSON** PATCH /api/practitioner/profile
 * только таксономию — partial-safe маршрут не трогает title/bio/experience/
 * languages/avatar (в JSON-ветке undefined-поля пропускаются условными спредами).
 * Цены/длительности живут в «Календарь → Доступность» (гласит note макета).
 */
export function PractitionerServicesEditorMobile({
  initialData,
  backHref = "/cabinet/practitioner/more",
}: {
  initialData: InitialServicesData;
  backHref?: string;
}) {
  const [categories, setCategories] = useState<string[]>(initialData.categories);
  const [directions, setDirections] = useState<string[]>(initialData.directions);
  const [tasks, setTasks] = useState<string[]>(initialData.tags);
  const [formats, setFormats] = useState<string[]>(normalizeOfferedFormats(initialData.formats));
  const [saving, setSaving] = useState(false);

  const [catOpen, setCatOpen] = useState(false);
  const [dirOpen, setDirOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [taskDraft, setTaskDraft] = useState("");

  const availableDirections = directionsForCategories(categories);
  const addableDirections = availableDirections.filter((d) => !directions.includes(d.id));
  const suggestedTasks = tasksForCategories(categories).filter((t) => !tasks.some((x) => eq(x, t)));

  function toggleCategory(id: string) {
    const has = categories.includes(id);
    const next = has ? categories.filter((c) => c !== id) : [...categories, id];
    setCategories(next);
    if (has) {
      // отцепляем направления, чьей категории больше нет среди выбранных
      setDirections((prev) =>
        prev.filter((d) => {
          const cat = categoryIdForDirection(d);
          return cat ? next.includes(cat) : true;
        }),
      );
    }
  }

  function addDirection(id: string) {
    setDirections((prev) => (prev.includes(id) ? prev : [...prev, id]));
  }
  function removeDirection(id: string) {
    setDirections((prev) => prev.filter((d) => d !== id));
  }

  function addTask(t: string) {
    setTasks((prev) => (prev.some((x) => eq(x, t)) ? prev : [...prev, t]));
  }
  function removeTask(t: string) {
    setTasks((prev) => prev.filter((x) => x !== t));
  }
  function commitTaskDraft() {
    const parts = taskDraft.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length === 0) return;
    setTasks((prev) => {
      const merged = [...prev];
      for (const p of parts) if (!merged.some((x) => eq(x, p))) merged.push(p);
      return merged;
    });
    setTaskDraft("");
  }

  function toggleFormat(id: string) {
    if (id === "individual") return; // «Индивидуальная» доступна всегда (locked on)
    setFormats((prev) => (prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id]));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/practitioner/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories,
          directions,
          // зеркалим эзотерические направления в legacy Specialty enum
          specialties: specialtiesForDirections(directions),
          tags: tasks,
          formats,
        }),
      });
      const d = await res.json();
      if (d.ok) toast.success("Услуги обновлены");
      else toast.error(d.error ?? "Ошибка");
    } catch {
      toast.error("Ошибка");
    } finally {
      setSaving(false);
    }
  }

  const primaryCat = categories[0];
  const CatIcon = (primaryCat && CATEGORY_ICON[primaryCat]) || SlidersHorizontal;
  const catLabel = categories.length
    ? categories.map((c) => categoryLabel(c)).join(" · ")
    : "Выберите специализацию";

  return (
    <form
      onSubmit={handleSave}
      className="pcab-screen md:hidden"
      data-pcab-top
      data-testid="practitioner-services-mobile"
    >
      <div className="pcab-topbar">
        <Link href={backHref} className="pcab-roundbtn" aria-label="Назад">
          <ChevronLeft width={19} height={19} aria-hidden="true" />
        </Link>
        <span className="pcab-topbar-title">Услуги и направления</span>
        <button
          type="submit"
          className="pcab-save-link"
          disabled={saving}
          data-testid="practitioner-services-save-mobile"
        >
          {saving ? "Сохранение…" : "Сохранить"}
        </button>
      </div>

      {/* Специализация — карточка-раскрытие (мокап рисует один cat-row) */}
      <div className="pcab-flabel">Специализация</div>
      <button
        type="button"
        className="pcab-cat"
        aria-expanded={catOpen}
        onClick={() => setCatOpen((o) => !o)}
        data-testid="practitioner-services-cat-row"
      >
        <span className="pcab-cat-ic">
          <CatIcon width={17} height={17} aria-hidden="true" />
        </span>
        <span className="pcab-cat-label">{catLabel}</span>
        <ChevronRight
          className="pcab-cat-chev"
          width={18}
          height={18}
          aria-hidden="true"
          style={catOpen ? { transform: "rotate(90deg)" } : undefined}
        />
      </button>
      {catOpen && (
        <div className="pcab-svc-chips" data-testid="practitioner-services-cat-picker">
          {CATEGORIES.map((c) => {
            const on = categories.includes(c.id);
            return (
              <button
                key={c.id}
                type="button"
                className={`pcab-svc-chip${on ? " on" : ""}`}
                aria-pressed={on}
                onClick={() => toggleCategory(c.id)}
              >
                {c.label}
                {on && (
                  <span className="pcab-svc-x" aria-hidden="true">
                    <X width={12} height={12} />
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Направления / методы */}
      <div className="pcab-flabel">Направления / методы</div>
      <div className="pcab-svc-chips">
        {directions.map((id) => (
          <span key={id} className="pcab-svc-chip on">
            {directionLabel(id)}
            <button
              type="button"
              className="pcab-svc-x"
              aria-label={`Убрать ${directionLabel(id)}`}
              onClick={() => removeDirection(id)}
            >
              <X width={12} height={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="pcab-svc-chip add"
          onClick={() => setDirOpen((o) => !o)}
          data-testid="practitioner-services-dir-add"
        >
          <Plus width={13} height={13} aria-hidden="true" /> добавить
        </button>
      </div>
      {dirOpen && (
        <div className="pcab-svc-picker" data-testid="practitioner-services-dir-picker">
          {categories.length === 0 ? (
            <p className="pcab-svc-hint">Сначала выберите специализацию.</p>
          ) : addableDirections.length === 0 ? (
            <p className="pcab-svc-hint">Все направления добавлены.</p>
          ) : (
            <div className="pcab-svc-chips" style={{ marginTop: 0 }}>
              {addableDirections.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className="pcab-svc-chip"
                  onClick={() => addDirection(d.id)}
                >
                  {d.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* С чем работаю (темы) */}
      <div className="pcab-flabel">
        С чем работаю <small>(темы для подбора клиентов)</small>
      </div>
      <div className="pcab-svc-chips">
        {tasks.map((t) => (
          <span key={t} className="pcab-svc-chip">
            {t}
            <button
              type="button"
              className="pcab-svc-x"
              aria-label={`Убрать ${t}`}
              onClick={() => removeTask(t)}
            >
              <X width={12} height={12} aria-hidden="true" />
            </button>
          </span>
        ))}
        <button
          type="button"
          className="pcab-svc-chip add"
          onClick={() => setTaskOpen((o) => !o)}
          data-testid="practitioner-services-task-add"
        >
          <Plus width={13} height={13} aria-hidden="true" /> добавить
        </button>
      </div>
      {taskOpen && (
        <div className="pcab-svc-picker" data-testid="practitioner-services-task-picker">
          {suggestedTasks.length > 0 && (
            <div className="pcab-svc-chips" style={{ marginTop: 0 }}>
              {suggestedTasks.map((t) => (
                <button key={t} type="button" className="pcab-svc-chip" onClick={() => addTask(t)}>
                  {t}
                </button>
              ))}
            </div>
          )}
          <div className="pcab-svc-add-row">
            <input
              value={taskDraft}
              onChange={(e) => setTaskDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  commitTaskDraft();
                }
              }}
              onBlur={commitTaskDraft}
              placeholder="Своя тема…"
              aria-label="Добавить свою тему"
              className="pcab-inline-input"
            />
            <button
              type="button"
              className="pcab-svc-addbtn"
              aria-label="Добавить тему"
              onClick={commitTaskDraft}
            >
              <Plus width={16} height={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Форматы сессий (individual заблокирован «включённым» — как на десктопе) */}
      <div className="pcab-flabel">Форматы сессий</div>
      {SESSION_FORMATS.map((f) => {
        const locked = f.id === "individual";
        const on = locked || formats.includes(f.id);
        return (
          <div key={f.id} className="pcab-fmt">
            <div className="pcab-fmt-t">
              {f.label}
              {locked ? " · всегда" : ""}
              <small>{f.hint}</small>
            </div>
            <button
              type="button"
              className={`pcab-toggle${on ? "" : " off"}`}
              role="switch"
              aria-checked={on}
              aria-disabled={locked}
              disabled={locked}
              aria-label={locked ? "Индивидуальные сессии доступны всегда" : `Формат «${f.label}»`}
              onClick={() => toggleFormat(f.id)}
              data-testid={`practitioner-services-format-${f.id}`}
            >
              <span className="knob" />
            </button>
          </div>
        );
      })}

      <div className="pcab-note">
        <b>Цены и длительности</b> сессий — в разделе{" "}
        <b>Календарь → Доступность</b>. Здесь — про что вы и какими методами работаете
        (это помогает клиентам вас найти).
      </div>
    </form>
  );
}
