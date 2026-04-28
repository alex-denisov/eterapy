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
import { PublicJsonLd } from "@/components/seo/public-json-ld";

interface TarotCard { name: string; nameEn: string; position: string; reversed: boolean; keywords: string[]; }
interface TarotResult { cards: TarotCard[]; interpretation: string; tier: string; balanceKopecks?: number; fullPriceKopecks?: number; }

const FULL_PRICE_RUB = 299;
const POSITION_COLORS = ["text-blue-400", "text-primary", "text-purple-400", "text-emerald-400", "text-amber-400"];
const POSITION_ICONS = ["🌅", "🌕", "🌟", "💫", "✨"];

export default function TarotPage() {
  const { data: session, status } = useSession();
  const [question, setQuestion] = useState("");
  const [tier, setTier] = useState<"quick" | "full">("quick");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TarotResult | null>(null);
  const [error, setError] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [isLimited, setIsLimited] = useState(false);
  const [balanceKopecks, setBalanceKopecks] = useState<number | null>(null);

  async function doSubmit() {
    setLoading(true);
    setError("");
    setResult(null);
    setShowAuth(false);
    setIsLimited(false);
    try {
      const res = await fetch("/api/modalities/tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, tier }),
      });
      const data = await res.json();
      console.log("[tarot] response:", res.status, data.error, data.balanceKopecks);
      if (res.status === 429) {
        console.log("[tarot] Setting isLimited=true");
        setBalanceKopecks(data.balanceKopecks ?? null);
        setIsLimited(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Ошибка сервера");
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
    if (!question.trim()) return;
    if (!session && status !== "loading") { setShowAuth(true); return; }
    doSubmit();
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <PublicJsonLd route="/all-modalities/tarot" />
      <AuthModal open={showAuth} toolName="Расклад Таро" onSuccess={doSubmit} onClose={() => setShowAuth(false)} />

      <h1 className="font-heading text-3xl font-bold md:text-4xl">🃏 Расклад Таро</h1>

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
          <div className="mt-0.5 text-xs text-muted-foreground">3 карты · Бесплатно · 3/мес</div>
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
          <div className="mt-0.5 text-xs text-muted-foreground">5 карт · {FULL_PRICE_RUB} ₽ · Детальный анализ</div>
        </button>
      </div>

      <p className="mt-3 text-muted-foreground">
        {tier === "quick"
          ? "Три карты · Прошлое, Настоящее, Будущее"
          : "Пять карт · Кельтский мини-крест · 5 сфер жизни + рекомендации"}
      </p>

      <form onSubmit={handleSubmit} className="mt-6 flex gap-3">
        <Input placeholder="Ваш вопрос — чем конкретнее, тем точнее..."
          value={question} onChange={(e) => setQuestion(e.target.value)}
          maxLength={500} className="flex-1 bg-card/50" />
        <Button type="submit" disabled={loading || !question.trim()}>
          {tier === "full" ? `Полный расклад (${FULL_PRICE_RUB} ₽)` : "Разложить"}
        </Button>
      </form>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {loading && <ToolLoading message={tier === "full" ? "Проводим глубинный расклад..." : "Раскладываем карты..."} />}

      {isLimited && (
        <PaywallScreen
          balanceKopecks={balanceKopecks ?? undefined}
          fullPriceKopecks={29900}
          onClose={() => setIsLimited(false)}
        />
      )}

      {result && (
        <div className="mt-10 space-y-6">
          {result.tier === "full" && (
            <Badge className="bg-primary/10 text-primary text-xs">🔮 Полный расклад</Badge>
          )}
          <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-5">
            {result.cards.map((card, i) => (
              <Card key={card.nameEn || i} className="border-primary/20 bg-card/50 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-primary/40 to-primary/10" />
                <CardContent className="p-4 text-center">
                  <p className={`text-[10px] font-semibold uppercase tracking-wider ${POSITION_COLORS[i] || POSITION_COLORS[2]}`}>{card.position}</p>
                  <div className="my-3 text-3xl">{POSITION_ICONS[i] || POSITION_ICONS[2]}</div>
                  <p className="font-heading text-sm font-semibold">{card.name}</p>
                  <Badge variant="secondary" className={`mt-1.5 text-[10px] ${card.reversed ? "bg-rose-500/10 text-rose-400" : "bg-primary/10 text-primary"}`}>
                    {card.reversed ? "↓ Перевёрнута" : "↑ Прямая"}
                  </Badge>
                  {card.keywords?.length > 0 && (
                    <div className="mt-2 flex flex-wrap justify-center gap-0.5">
                      {card.keywords.slice(0, 3).map((kw) => (
                        <span key={kw} className="text-[10px] text-muted-foreground/70">{kw}</span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-primary/20 bg-card/30">
            <CardContent className="p-6">
              <h3 className="mb-4 font-heading text-lg font-semibold text-primary">
                {result.tier === "full" ? "✦ Детальная интерпретация" : "✦ Интерпретация"}
              </h3>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {result.interpretation.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")}
              </div>
            </CardContent>
          </Card>
          <AIShareButton
            tool="TAROT"
            title="Расклад Таро"
            resultText={result.cards.map((c) => `${c.position}: ${c.name}${c.reversed ? " (перевёрнута)" : ""}`).join("\n") + "\n\n" + result.interpretation}
          />
          <Button variant="outline" className="mt-4 border-border/40 text-muted-foreground"
            onClick={() => { setResult(null); setQuestion(""); }}>
            Новый расклад
          </Button>
        </div>
      )}
      <p className="mt-8 text-xs text-muted-foreground/50">Носит развлекательный и ознакомительный характер.</p>
    </div>
  );
}
