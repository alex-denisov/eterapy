"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { PractitionerData } from "@/lib/types";

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-primary">★</span>
      <span className="text-sm font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}

function PractitionerCard({ p, specialtyLabels }: { p: PractitionerData; specialtyLabels: Record<string, string> }) {
  const router = useRouter();
  const href = `/practitioners/${p.id}`;

  return (
    <div
      role="article"
      onClick={() => router.push(href)}
      className="group block cursor-pointer"
    >
      <Card className="h-full border-border/40 bg-card/50 transition-all duration-200 group-hover:border-primary/40 group-hover:bg-card/70">
        <CardContent className="p-5">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-2xl font-bold text-primary ring-1 ring-primary/20">
              {p.name.charAt(0)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-semibold leading-tight">{p.name}</h3>
                {p.verified && <span className="text-primary text-xs" title="Проверен ETerapy">✦</span>}
                {p.online && <span className="h-2 w-2 rounded-full bg-green-500" title="Онлайн" />}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{p.title}</p>
              <div className="mt-1 flex items-center gap-3">
                <StarRating rating={p.rating} />
                <span className="text-xs text-muted-foreground">{p.reviewCount} отзывов</span>
                <span className="text-xs text-muted-foreground">{p.sessionCount} сессий</span>
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.specialties.map((s) => (
              <Badge key={s} variant="secondary" className="bg-primary/10 text-xs text-primary">
                {specialtyLabels[s] ?? s}
              </Badge>
            ))}
          </div>

          <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground">{p.bio}</p>

          <div className="mt-3 flex flex-wrap gap-1">
            {p.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-border/30 px-2 py-0.5 text-xs text-muted-foreground">{tag}</span>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border/30 pt-4">
            <div>
              <p className="text-base font-semibold text-primary">
                {p.pricePerSession.toLocaleString("ru")} ₽
              </p>
              <p className="text-xs text-muted-foreground">
                за {(p as unknown as { minDuration?: number }).minDuration ?? 60} минут
              </p>
            </div>
            <div className="text-right">
              {p.nextSlot ? (
                <>
                  <p className="text-sm font-medium text-green-400">{p.nextSlot}</p>
                  <p className="text-xs text-muted-foreground">ближайший слот</p>
                </>
              ) : (
                <span className="text-sm text-primary">Смотреть профиль →</span>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface Props {
  initialPractitioners: PractitionerData[];
  specialtyLabels: Record<string, string>;
}

export function PractitionersCatalog({ initialPractitioners, specialtyLabels }: Props) {
  const [search, setSearch] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"rating" | "price_asc" | "price_desc" | "reviews">("rating");
  const [onlineOnly, setOnlineOnly] = useState(false);

  const allSpecialties = Object.keys(specialtyLabels);

  const filtered = useMemo(() => {
    let list = [...initialPractitioners];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) => p.name.toLowerCase().includes(q) || p.bio.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (selectedSpecialty !== "all") {
      list = list.filter((p) => p.specialties.includes(selectedSpecialty));
    }
    if (onlineOnly) list = list.filter((p) => p.online);

    list.sort((a, b) => {
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "reviews") return b.reviewCount - a.reviewCount;
      if (sortBy === "price_asc") return a.pricePerSession - b.pricePerSession;
      if (sortBy === "price_desc") return b.pricePerSession - a.pricePerSession;
      return 0;
    });
    return list;
  }, [initialPractitioners, search, selectedSpecialty, sortBy, onlineOnly]);

  return (
    <div className="space-y-6">
      {/* Поиск */}
      <input
        type="text"
        placeholder="Поиск по имени, теме или специализации..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full rounded-lg border border-border/40 bg-card/50 px-4 py-2.5 text-sm focus:border-primary focus:outline-none"
      />

      {/* Специализация */}
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedSpecialty("all")}
          className={`rounded-full border px-3 py-1 text-sm transition-colors ${
            selectedSpecialty === "all" ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:border-primary/40"
          }`}
        >
          Все
        </button>
        {allSpecialties.map((s) => (
          <button
            key={s}
            onClick={() => setSelectedSpecialty(s)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              selectedSpecialty === s ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:border-primary/40"
            }`}
          >
            {specialtyLabels[s]}
          </button>
        ))}
      </div>

      {/* Сортировка + онлайн */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Сортировка:</span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="rounded-lg border border-border/40 bg-card/50 px-3 py-1.5 text-sm focus:border-primary focus:outline-none"
          >
            <option value="rating">По рейтингу</option>
            <option value="reviews">По отзывам</option>
            <option value="price_asc">Сначала дешевле</option>
            <option value="price_desc">Сначала дороже</option>
          </select>
        </div>
        <label className="flex cursor-pointer items-center gap-2">
          <input type="checkbox" checked={onlineOnly} onChange={(e) => setOnlineOnly(e.target.checked)} className="accent-primary" />
          <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <span className="h-2 w-2 rounded-full bg-green-500" /> Только онлайн
          </span>
        </label>
      </div>

      {/* Результаты */}
      <p className="text-sm text-muted-foreground">Найдено: {filtered.length}</p>

      {filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">Никого не найдено. Попробуйте изменить фильтры.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((p) => (
            <PractitionerCard key={p.id} p={p} specialtyLabels={specialtyLabels} />
          ))}
        </div>
      )}
    </div>
  );
}
