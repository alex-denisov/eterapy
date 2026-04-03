"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { practitioners, SPECIALTY_LABELS, type Specialty } from "@/data/practitioners";

const ALL_SPECIALTIES = Object.keys(SPECIALTY_LABELS) as Specialty[];

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-primary">★</span>
      <span className="text-sm font-medium">{rating.toFixed(1)}</span>
    </span>
  );
}

function PractitionerCard({ p }: { p: (typeof practitioners)[0] }) {
  return (
    <Link href={`/practitioners/${p.id}`} className="group block">
      <Card className="h-full border-border/40 bg-card/50 transition-all duration-200 group-hover:border-primary/40 group-hover:bg-card/70">
        <CardContent className="p-5">
          {/* Шапка */}
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 text-3xl ring-1 ring-primary/20">
              {p.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="font-heading font-semibold leading-tight">{p.name}</h3>
                {p.verified && (
                  <span className="text-primary" title="Проверен ETerapy">✦</span>
                )}
                {p.online && (
                  <span className="h-2 w-2 rounded-full bg-green-500" title="Онлайн" />
                )}
              </div>
              <p className="mt-0.5 text-sm text-muted-foreground">{p.title}</p>
              <div className="mt-1 flex items-center gap-3">
                <StarRating rating={p.rating} />
                <span className="text-xs text-muted-foreground">{p.reviewCount} отзывов</span>
                <span className="text-xs text-muted-foreground">{p.sessionCount} сессий</span>
              </div>
            </div>
          </div>

          {/* Теги */}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {p.specialties.map((s) => (
              <Badge key={s} variant="secondary" className="bg-primary/10 text-xs text-primary">
                {SPECIALTY_LABELS[s]}
              </Badge>
            ))}
          </div>

          {/* Биография */}
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground line-clamp-2">
            {p.bio}
          </p>

          {/* Теги тематики */}
          <div className="mt-3 flex flex-wrap gap-1">
            {p.tags.map((tag) => (
              <span key={tag} className="rounded-full bg-border/30 px-2 py-0.5 text-xs text-muted-foreground">
                {tag}
              </span>
            ))}
          </div>

          {/* Футер карточки */}
          <div className="mt-4 flex items-center justify-between border-t border-border/30 pt-4">
            <div>
              <p className="text-lg font-semibold text-primary">
                {p.pricePerSession.toLocaleString("ru")} ₽
              </p>
              <p className="text-xs text-muted-foreground">за сессию</p>
            </div>
            <div className="text-right">
              {p.nextSlot ? (
                <>
                  <p className="text-sm font-medium text-green-400">{p.nextSlot}</p>
                  <p className="text-xs text-muted-foreground">ближайший слот</p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Слотов нет</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

export default function PractitionersPage() {
  const [search, setSearch] = useState("");
  const [selectedSpecialty, setSelectedSpecialty] = useState<Specialty | "all">("all");
  const [sortBy, setSortBy] = useState<"rating" | "price_asc" | "price_desc" | "reviews">("rating");
  const [onlineOnly, setOnlineOnly] = useState(false);

  const filtered = useMemo(() => {
    let list = [...practitioners];

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.bio.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    }

    if (selectedSpecialty !== "all") {
      list = list.filter((p) => p.specialties.includes(selectedSpecialty));
    }

    if (onlineOnly) {
      list = list.filter((p) => p.online);
    }

    list.sort((a, b) => {
      if (sortBy === "rating") return b.rating - a.rating;
      if (sortBy === "reviews") return b.reviewCount - a.reviewCount;
      if (sortBy === "price_asc") return a.pricePerSession - b.pricePerSession;
      if (sortBy === "price_desc") return b.pricePerSession - a.pricePerSession;
      return 0;
    });

    return list;
  }, [search, selectedSpecialty, sortBy, onlineOnly]);

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      {/* Заголовок */}
      <div className="mb-8">
        <h1 className="font-heading text-3xl font-bold md:text-4xl">Каталог практиков</h1>
        <p className="mt-2 text-muted-foreground">
          {practitioners.length} верифицированных специалиста · Фиксированная цена · Реальные отзывы
        </p>
      </div>

      {/* Фильтры */}
      <div className="mb-8 space-y-4">
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
              selectedSpecialty === "all"
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/40 text-muted-foreground hover:border-primary/40"
            }`}
          >
            Все
          </button>
          {ALL_SPECIALTIES.map((s) => (
            <button
              key={s}
              onClick={() => setSelectedSpecialty(s)}
              className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                selectedSpecialty === s
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border/40 text-muted-foreground hover:border-primary/40"
              }`}
            >
              {SPECIALTY_LABELS[s]}
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
            <input
              type="checkbox"
              checked={onlineOnly}
              onChange={(e) => setOnlineOnly(e.target.checked)}
              className="accent-primary"
            />
            <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-green-500" />
              Только онлайн
            </span>
          </label>
        </div>
      </div>

      {/* Результаты */}
      {filtered.length === 0 ? (
        <div className="py-20 text-center text-muted-foreground">
          Никого не найдено. Попробуйте изменить фильтры.
        </div>
      ) : (
        <>
          <p className="mb-4 text-sm text-muted-foreground">
            Найдено: {filtered.length}
          </p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filtered.map((p) => (
              <PractitionerCard key={p.id} p={p} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
