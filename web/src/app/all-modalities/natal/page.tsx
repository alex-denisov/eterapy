"use client";

import { useState, useRef, useEffect } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ToolLoading } from "@/components/tool-loading";
import { AuthModal } from "@/components/auth-modal";
import { AIShareButton } from "@/components/ai-share-button";
import { PaywallScreen } from "@/components/paywall-screen";
import { searchCities } from "@/lib/cities";
import { validateBirthDate, formatDateForServer } from "@/lib/date-utils";
import { getFullReadingPriceKopecks } from "@/lib/tool-limit";
import { Badge } from "@/components/ui/badge";



function CityAutocomplete({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function handleInput(v: string) {
    onChange(v);
    if (v.length >= 2) {
      setSuggestions(searchCities(v, 8));
      setOpen(true);
    } else {
      setSuggestions([]);
      setOpen(false);
    }
  }

  return (
    <div ref={ref} className="relative">
      <Input
        placeholder="Город рождения (начните вводить...)"
        value={value}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => value.length >= 2 && setOpen(true)}
        className="bg-card/50"
      />
      {open && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded-lg border border-border/40 bg-navy/95 shadow-xl backdrop-blur-sm">
          {suggestions.map((city) => (
            <li key={city}>
              <button
                type="button"
                className="w-full px-4 py-2.5 text-left text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
                onClick={() => { onChange(city); setOpen(false); }}
              >
                {city}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function NatalPage() {
  const { data: session, status } = useSession();
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sunSign: string; interpretation: string; tier?: string; balanceKopecks?: number } | null>(null);
  const [error, setError] = useState("");
  const [dateError, setDateError] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [isLimited, setIsLimited] = useState(false);
  const [tier, setTier] = useState<"quick" | "full">("quick");
  const [balanceKopecks, setBalanceKopecks] = useState<number | null>(null);

  const FULL_PRICE_KOPECKS = getFullReadingPriceKopecks();

  const currentYear = new Date().getFullYear();

  async function doSubmit() {
    // Валидация даты
    if (birthDate) {
      const error = validateBirthDate(birthDate);
      if (error) {
        setDateError(error);
        setError("Исправьте дату рождения");
        return;
      }
    }

    setLoading(true);
    setError("");
    setShowAuth(false);
    setIsLimited(false);
    try {
      // Конвертируем DD.MM.YYYY в YYYY-MM-DD для API
      const isoDate = formatDateForServer(birthDate);
      const res = await fetch("/api/modalities/natal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          birthDate: isoDate,
          birthTime,
          birthPlace,
          tier,
        }),
      });
      const data = await res.json();
      if (res.status === 429) { setBalanceKopecks(data.balanceKopecks ?? null); setIsLimited(true); return; }
      if (!res.ok) throw new Error(data.error);
      setResult(data);
      if (data.balanceKopecks != null) setBalanceKopecks(data.balanceKopecks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session && status !== "loading") { setShowAuth(true); return; }
    doSubmit();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <AuthModal open={showAuth} toolName="Натальная карта" onSuccess={doSubmit} onClose={() => setShowAuth(false)} />
      <h1 className="font-heading text-3xl font-bold">⭐ Натальная карта</h1>

      {/* Быстрый / Полный переключатель */}
      <div className="mt-4 flex gap-2">
        <button
          type="button"
          onClick={() => setTier("quick")}
          className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
            tier === "quick"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/40 bg-card/30 text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="text-base font-semibold">⚡ Быстрый</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Бесплатно · 3/мес</div>
        </button>
        <button
          type="button"
          onClick={() => setTier("full")}
          className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
            tier === "full"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/40 bg-card/30 text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="text-base font-semibold">🔮 Полный</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{FULL_PRICE_KOPECKS / 100} ₽ · Детальный анализ</div>
        </button>
      </div>

      <p className="mt-3 text-muted-foreground">
        {tier === "quick"
          ? "Краткий расчёт по дате рождения — знак Солнца и базовое описание."
          : "Полная натальная карта с планетами, домами и аспектами."}
      </p>

      {!result && !loading && (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Дата рождения *</label>
            <Input
              placeholder="ДД.ММ.ГГГГ"
              value={birthDate}
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, "").slice(0, 8);
                let formatted = "";
                if (digits.length > 0) formatted += digits.slice(0, 2);
                if (digits.length > 2) formatted += "." + digits.slice(2, 4);
                if (digits.length > 4) formatted += "." + digits.slice(4, 8);
                setBirthDate(formatted);
                if (formatted.length === 10) {
                  const err = validateBirthDate(formatted);
                  setDateError(err || "");
                } else {
                  setDateError("");
                }
                setError("");
              }}
              required
              className={`bg-card/50 ${dateError ? "border-destructive" : ""}`}
            />
            {dateError && <p className="text-xs text-destructive mt-1">{dateError}</p>}
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              Время рождения
              <span className="ml-1 text-xs text-muted-foreground/60">(чем точнее, тем детальнее расчёт асцендента и домов)</span>
            </label>
            <Input type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} className="bg-card/50" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Место рождения</label>
            <CityAutocomplete value={birthPlace} onChange={setBirthPlace} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!birthDate || !!dateError} className="w-full">Построить карту</Button>
        </form>
      )}

      {loading && <ToolLoading message={tier === "full" ? "Проводим глубинный расчёт натальной карты..." : "Строим натальную карту..."} />}

      <PaywallScreen open={isLimited} balanceKopecks={balanceKopecks ?? undefined} fullPriceKopecks={29900} onReset={() => { setIsLimited(false); }} />

      {result && (
        <div className="mt-8">
          {result.tier === "full" && (
            <Badge className="mb-4 bg-primary/10 text-primary text-xs">🔮 Полный расклад</Badge>
          )}
          <Card className="border-primary/20 bg-card/30">
            <CardContent className="p-6">
              <h2 className="font-heading text-xl font-semibold">☀️ Солнце в знаке {result.sunSign}</h2>
              <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {result.interpretation.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")}
              </div>
            </CardContent>
          </Card>
          <AIShareButton
            tool="NATAL"
            title={`Натальная карта — Солнце в ${result.sunSign}`}
            resultText={result.interpretation}
          />
          <Button variant="outline" className="mt-4 border-border/40 text-muted-foreground"
            onClick={() => { setResult(null); setBirthDate(""); setBirthTime(""); setBirthPlace(""); }}>
            Новый расчёт
          </Button>
        </div>
      )}
    </div>
  );
}
