"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, LoaderCircle, MapPin } from "lucide-react";
import type { RussianLocality } from "@/lib/russian-localities";

export function LocationSuggestInput({
  value,
  selected,
  onChange,
  onSelect,
  disabled = false,
}: {
  value: string;
  selected: RussianLocality | null;
  onChange: (value: string) => void;
  onSelect: (value: RussianLocality | null) => void;
  disabled?: boolean;
}) {
  const listboxId = useId();
  const [results, setResults] = useState<RussianLocality[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const requestSequence = useRef(0);

  useEffect(() => {
    const query = value.trim();
    if (disabled || selected || query.length < 2 || /^-?\d{1,2}(?:[.,]\d+)?\s*[,;/]\s*-?\d{1,3}/u.test(query)) {
      return;
    }
    const sequence = ++requestSequence.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      fetch(`/api/locations/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error("location search failed")))
        .then((payload: { results?: RussianLocality[] }) => {
          if (requestSequence.current !== sequence) return;
          const next = Array.isArray(payload.results) ? payload.results : [];
          setResults(next);
          setOpen(next.length > 0);
          setActiveIndex(next.length > 0 ? 0 : -1);
        })
        .catch(() => {
          if (requestSequence.current === sequence) {
            setResults([]);
            setOpen(false);
          }
        })
        .finally(() => {
          if (requestSequence.current === sequence) setLoading(false);
        });
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [disabled, selected, value]);

  function choose(locality: RussianLocality) {
    onChange(`${locality.name}, ${locality.region}`);
    onSelect(locality);
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
  }

  return (
    <div className="relative" data-testid="horary-location-picker">
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
        <input
          id="horary-location"
          value={value}
          onChange={(event) => {
            onChange(event.target.value.slice(0, 120));
            onSelect(null);
            setResults([]);
            setOpen(false);
            setLoading(false);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(results.length > 0)}
          onBlur={() => window.setTimeout(() => setOpen(false), 120)}
          onKeyDown={(event) => {
            if (!open || results.length === 0) return;
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setActiveIndex((index) => (index + 1) % results.length);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              setActiveIndex((index) => (index - 1 + results.length) % results.length);
            } else if (event.key === "Enter" && activeIndex >= 0) {
              event.preventDefault();
              choose(results[activeIndex]);
            } else if (event.key === "Escape") {
              setOpen(false);
            }
          }}
          placeholder="Ивантеевка, Московская область"
          className="soft-question-input product-question-input product-line-input pl-11 pr-11"
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={open}
          aria-activedescendant={open && activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          autoComplete="off"
          data-testid="horary-location"
        />
        {loading && <LoaderCircle className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 animate-spin text-[var(--soft-ink-faint)]" aria-label="Ищем населённый пункт" />}
        {!loading && selected && <Check className="pointer-events-none absolute right-4 top-1/2 size-4 -translate-y-1/2 text-[var(--soft-sage)]" aria-label="Населённый пункт выбран" />}
      </div>

      {open && (
        <div id={listboxId} role="listbox" className="surname-location-results absolute inset-x-0 top-[calc(100%+0.4rem)] z-30 overflow-hidden rounded-[16px] bg-[var(--soft-paper-card)] p-1.5 shadow-[0_24px_64px_rgba(91,64,45,0.18)]">
          {results.map((locality, index) => (
            <button
              key={locality.id}
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className="flex min-h-12 w-full items-start gap-3 rounded-[12px] px-3 py-2.5 text-left transition-colors hover:bg-[var(--soft-paper-deep)] focus-visible:bg-[var(--soft-paper-deep)]"
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => choose(locality)}
            >
              <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block font-medium text-[var(--soft-ink)]">{locality.name}</span>
                <span className="block text-xs leading-relaxed text-[var(--soft-ink-soft)]">{locality.region}, Россия</span>
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="mt-2 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
        {selected ? `Выбрано: ${selected.label}` : "Начните вводить город и выберите вариант с регионом. Можно также указать координаты."}
        {" "}<a href="https://www.geonames.org/" target="_blank" rel="noreferrer" className="underline decoration-[var(--soft-paper-edge)] underline-offset-2">Данные GeoNames</a>.
      </p>
    </div>
  );
}
