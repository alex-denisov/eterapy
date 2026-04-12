"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToolLoading } from "@/components/tool-loading";
import { AuthModal } from "@/components/auth-modal";
import { AIShareButton } from "@/components/ai-share-button";
import { PaywallScreen } from "@/components/paywall-screen";
import { validateBirthDate, formatDateForServer } from "@/lib/date-utils";
import { getFullReadingPriceKopecks } from "@/lib/tool-limit";

export default function NumerologyPage() {
  const { data: session, status } = useSession();
  const [birthDate, setBirthDate] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    lifePathNumber: number; archetype: string; keywords: string[]; interpretation: string; tier?: string; balanceKopecks?: number;
  } | null>(null);
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
      const isoDate = formatDateForServer(birthDate);
      const res = await fetch("/api/modalities/numerology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate: isoDate, name, tier }),
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
      <AuthModal open={showAuth} toolName="Нумерология" onSuccess={doSubmit} onClose={() => setShowAuth(false)} />

      <h1 className="font-heading text-3xl font-bold">🔢 Нумерология</h1>

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
          ? "Число жизненного пути по системе Пифагора — краткий архетип."
          : "Развёрнутый нумерологический портрет с интерпретацией всех чисел."}
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
            <label className="mb-1 block text-sm text-muted-foreground">Имя <span className="text-xs text-muted-foreground/60">(необязательно)</span></label>
            <Input placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} className="bg-card/50" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!birthDate || !!dateError} className="w-full">Рассчитать</Button>
        </form>
      )}

      {loading && <ToolLoading message={tier === "full" ? "Проводим глубинный нумерологический анализ..." : "Считаем число жизненного пути..."} />}

      <PaywallScreen open={isLimited} balanceKopecks={balanceKopecks ?? undefined} fullPriceKopecks={29900} onReset={() => { setIsLimited(false); }} />

      {result && (
        <div className="mt-8">
          {result.tier === "full" && (
            <Badge className="mb-4 bg-primary/10 text-primary text-xs">🔮 Полный расклад</Badge>
          )}
          <Card className="border-primary/20 bg-card/30">
            <CardContent className="p-6">
              <div className="flex items-center gap-5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20">
                  <span className="font-heading text-4xl font-bold text-primary">{result.lifePathNumber}</span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Число жизненного пути</p>
                  <h2 className="font-heading text-2xl font-bold">{result.archetype}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {result.keywords.map((kw) => (
                      <Badge key={kw} variant="secondary" className="bg-primary/10 text-xs text-primary">{kw}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {result.interpretation.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")}
              </div>
            </CardContent>
          </Card>
          <AIShareButton
            tool="NUMEROLOGY"
            title={`Нумерология — Число ${result.lifePathNumber} «${result.archetype}»`}
            resultText={`Число жизненного пути: ${result.lifePathNumber}\n${result.archetype}\n\n${result.interpretation}`}
          />
          <Button variant="outline" className="mt-4 border-border/40 text-muted-foreground"
            onClick={() => { setResult(null); setBirthDate(""); setName(""); }}>
            Новый расчёт
          </Button>
        </div>
      )}
    </div>
  );
}
