"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";

function useDebounce<T>(value: T, delay: number): T {
  const [deb, setDeb] = useState(value);
  useEffect(() => { const t = setTimeout(() => setDeb(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return deb;
}
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";

interface Practitioner {
  id: string;
  slug: string;
  name: string;
  title: string;
  bio: string;
  specialties: string[];
  tags: string[];
  experience: string;
  pricePerSession: number;
  minDuration: number;
  languages: string[];
  verified: boolean;
  founding: boolean;
  rating: number;
  reviewCount: number;
  sessionCount: number;
}

const DURATION_LABELS: Record<number, string> = {
  15: "15 мин", 30: "30 мин", 45: "45 мин",
  60: "1 час", 90: "1.5 ч", 120: "2 ч",
};

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-[var(--soft-bordeaux)]">★</span>
      <span className="text-sm font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}

export function CabinetPractitionersCatalog({
  practitioners,
  specialtyLabels,
}: {
  practitioners: Practitioner[];
  specialtyLabels: Record<string, string>;
}) {
  const router = useRouter();
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounce(searchInput, 250);
  const [specialty, setSpecialty] = useState("all");
  const [sortBy, setSortBy] = useState<"rating" | "reviews">("rating");
  const [sortPrice, setSortPrice] = useState<"default" | "asc" | "desc">("default");

  const allSpecialties = useMemo(() => {
    const s = new Set<string>();
    practitioners.forEach(p => p.specialties.forEach(sp => s.add(sp)));
    return Array.from(s);
  }, [practitioners]);

  const filtered = useMemo(() => {
    let list = [...practitioners];
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.title.toLowerCase().includes(q) ||
        p.bio.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    if (specialty !== "all") list = list.filter(p => p.specialties.includes(specialty));
    // Сортировка по рейтингу / отзывам
    if (sortBy === "reviews") list.sort((a, b) => b.reviewCount - a.reviewCount);
    else list.sort((a, b) => b.rating - a.rating);
    // Сортировка по цене
    if (sortPrice === "asc") list.sort((a, b) => a.pricePerSession - b.pricePerSession);
    else if (sortPrice === "desc") list.sort((a, b) => b.pricePerSession - a.pricePerSession);
    return list;
  }, [practitioners, search, specialty, sortBy, sortPrice]);

  return (
    <div>
      {/* Фильтры */}
      <div className="flex flex-wrap gap-3 mb-6 items-center">
        <Input
          placeholder="Поиск по имени, специализации..."
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          className="bg-card/50 max-w-xs"
        />
        <select value={specialty} onChange={e => setSpecialty(e.target.value)}
          className="rounded-lg border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.015)] px-3 py-2 text-sm focus:bg-white/5 focus:outline-none">
          <option value="all">Все специализации</option>
          {allSpecialties.map(s => (
            <option key={s} value={s}>{specialtyLabels[s] ?? s}</option>
          ))}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-lg border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.015)] px-3 py-2 text-sm focus:bg-white/5 focus:outline-none"
          aria-label="Сортировка по рейтингу">
          <option value="rating">По рейтингу</option>
          <option value="reviews">По отзывам</option>
        </select>
        <select value={sortPrice} onChange={e => setSortPrice(e.target.value as typeof sortPrice)}
          className="rounded-lg border border-[var(--soft-paper-edge)] bg-[rgba(255,255,255,0.015)] px-3 py-2 text-sm focus:bg-white/5 focus:outline-none"
          aria-label="Сортировка по стоимости">
          <option value="default">По стоимости</option>
          <option value="asc">Сначала дешевле</option>
          <option value="desc">Сначала дороже</option>
        </select>
        <span className="text-xs text-[var(--soft-ink-soft)] ml-auto">{filtered.length} практиков</span>
      </div>

      {/* Список */}
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map(p => (
          <div key={p.id}
            onClick={() => router.push(`/cabinet/practitioners/${p.slug}`)}
            className="group cursor-pointer bg-[var(--paper-card)] border border-[var(--paper-edge)] rounded-[var(--r-lg)] p-[22px] flex gap-[18px] transition-[0.2s] hover:border-[var(--terracotta)] hover:shadow-[var(--shadow-md)] hover:-translate-y-[2px]">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(140deg,_var(--rose),_var(--apricot))] text-xl font-bold text-[var(--bordeaux)] ring-1 ring-[rgba(255,255,255,0.5)]">
                {p.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-heading font-semibold">{p.name}</h3>
                  {p.verified && <span className="text-[var(--soft-bordeaux)] text-xs">✦</span>}
                  {p.founding && <span className="text-[10px] text-[var(--soft-bordeaux)] border border-primary/30 rounded px-1.5 py-0.5">Основатель</span>}
                </div>
                <p className="text-sm text-[var(--soft-ink-soft)] mt-0.5">{p.title}</p>
                <div className="mt-1 flex items-center gap-3">
                  <StarRating rating={p.rating} />
                  <span className="text-xs text-[var(--soft-ink-soft)]">{p.reviewCount} отзывов</span>
                  <span className="text-xs text-[var(--soft-ink-soft)]">Опыт: {p.experience}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.specialties.slice(0, 3).map(s => (
                <Badge key={s} className="bg-[var(--paper-card)] border border-[var(--paper-edge)] text-[var(--ink-soft)] text-xs">
                  {specialtyLabels[s] ?? s}
                </Badge>
              ))}
            </div>

            <p className="mt-2 line-clamp-2 text-xs text-[var(--soft-ink-soft)] leading-relaxed">{p.bio}</p>

            <div className="mt-3 flex items-center justify-between border-t border-border/20 pt-3">
              <div>
                <span className="font-semibold text-[var(--soft-bordeaux)]">{p.pricePerSession.toLocaleString("ru")} ₽</span>
                <span className="text-xs text-[var(--soft-ink-soft)] ml-1">за {DURATION_LABELS[p.minDuration] ?? `${p.minDuration} мин`}</span>
              </div>
              <span className="text-xs text-[var(--soft-bordeaux)] opacity-0 group-hover:opacity-100 transition-opacity">
                Записаться →
              </span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-[var(--soft-ink-soft)]">
          <p>Практики не найдены</p>
          <button onClick={() => { setSearchInput(""); setSpecialty("all"); }}
            className="mt-2 text-sm text-[var(--soft-bordeaux)] hover:underline">
            Сбросить фильтры
          </button>
        </div>
      )}
    </div>
  );
}
