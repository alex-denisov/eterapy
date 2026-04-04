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
      <span className="text-primary">★</span>
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
  const [sortBy, setSortBy] = useState<"rating" | "price_asc" | "price_desc">("rating");

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
    if (sortBy === "price_asc") list.sort((a, b) => a.pricePerSession - b.pricePerSession);
    else if (sortBy === "price_desc") list.sort((a, b) => b.pricePerSession - a.pricePerSession);
    else list.sort((a, b) => b.rating - a.rating);
    return list;
  }, [practitioners, search, specialty, sortBy]);

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
          className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
          <option value="all">Все специализации</option>
          {allSpecialties.map(s => (
            <option key={s} value={s}>{specialtyLabels[s] ?? s}</option>
          ))}
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="rounded-lg border border-border/40 bg-background/50 px-3 py-2 text-sm focus:border-primary focus:outline-none">
          <option value="rating">По рейтингу</option>
          <option value="price_asc">Сначала дешевле</option>
          <option value="price_desc">Сначала дороже</option>
        </select>
        <span className="text-xs text-muted-foreground ml-auto">{filtered.length} практиков</span>
      </div>

      {/* Список */}
      <div className="grid gap-4 md:grid-cols-2">
        {filtered.map(p => (
          <div key={p.id}
            onClick={() => router.push(`/practitioners/${p.id}`)}
            className="group cursor-pointer rounded-xl border border-border/40 bg-card/40 p-5 transition-all hover:border-primary/40 hover:bg-card/60">
            <div className="flex items-start gap-3">
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xl font-bold text-primary ring-1 ring-primary/20">
                {p.name[0]}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-heading font-semibold">{p.name}</h3>
                  {p.verified && <span className="text-primary text-xs">✦</span>}
                  {p.founding && <span className="text-[10px] text-primary border border-primary/30 rounded px-1.5 py-0.5">Основатель</span>}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{p.title}</p>
                <div className="mt-1 flex items-center gap-3">
                  <StarRating rating={p.rating} />
                  <span className="text-xs text-muted-foreground">{p.reviewCount} отзывов</span>
                  <span className="text-xs text-muted-foreground">Опыт: {p.experience}</span>
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.specialties.slice(0, 3).map(s => (
                <Badge key={s} variant="secondary" className="bg-primary/10 text-xs text-primary">
                  {specialtyLabels[s] ?? s}
                </Badge>
              ))}
            </div>

            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground leading-relaxed">{p.bio}</p>

            <div className="mt-3 flex items-center justify-between border-t border-border/20 pt-3">
              <div>
                <span className="font-semibold text-primary">{p.pricePerSession.toLocaleString("ru")} ₽</span>
                <span className="text-xs text-muted-foreground ml-1">за {DURATION_LABELS[p.minDuration] ?? `${p.minDuration} мин`}</span>
              </div>
              <span className="text-xs text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                Записаться →
              </span>
            </div>
          </div>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          <p>Практики не найдены</p>
          <button onClick={() => { setSearchInput(""); setSpecialty("all"); }}
            className="mt-2 text-sm text-primary hover:underline">
            Сбросить фильтры
          </button>
        </div>
      )}
    </div>
  );
}
