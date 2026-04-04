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

interface TarotCard { name: string; nameEn: string; position: string; reversed: boolean; keywords: string[]; }
interface TarotResult { cards: TarotCard[]; interpretation: string; }

const POSITION_COLORS = ["text-blue-400", "text-primary", "text-purple-400"];
const POSITION_ICONS = ["🌅", "🌕", "🌟"];

export default function TarotPage() {
  const { data: session, status } = useSession();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TarotResult | null>(null);
  const [error, setError] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [isLimited, setIsLimited] = useState(false);

  async function doSubmit() {
    setLoading(true);
    setError("");
    setResult(null);
    setShowAuth(false);
    setIsLimited(false);
    try {
      const res = await fetch("/api/ai/tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (res.status === 429) { setIsLimited(true); return; }
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка сервера");
      setResult(await res.json());
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
      {showAuth && <AuthModal toolName="Расклад Таро" onSuccess={doSubmit} onClose={() => setShowAuth(false)} />}

      <h1 className="font-heading text-3xl font-bold md:text-4xl">🃏 Расклад Таро</h1>
      <p className="mt-2 text-muted-foreground">Три карты · Прошлое, Настоящее, Будущее · Колода Райдера-Уэйта</p>

      <form onSubmit={handleSubmit} className="mt-8 flex gap-3">
        <Input placeholder="Ваш вопрос — чем конкретнее, тем точнее..."
          value={question} onChange={(e) => setQuestion(e.target.value)}
          maxLength={500} className="flex-1 bg-card/50" />
        <Button type="submit" disabled={loading || !question.trim()}>Разложить</Button>
      </form>

      {isLimited && <PaywallScreen onReset={() => { setIsLimited(false); setQuestion(""); }} />}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {loading && <ToolLoading message="Раскладываем карты..." />}

      {result && (
        <div className="mt-10 space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {result.cards.map((card, i) => (
              <Card key={card.nameEn || i} className="border-primary/20 bg-card/50 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-primary/40 to-primary/10" />
                <CardContent className="p-5 text-center">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${POSITION_COLORS[i]}`}>{card.position}</p>
                  <div className="my-4 text-4xl">{POSITION_ICONS[i]}</div>
                  <p className="font-heading text-lg font-semibold">{card.name}</p>
                  <Badge variant="secondary" className={`mt-2 text-xs ${card.reversed ? "bg-rose-500/10 text-rose-400" : "bg-primary/10 text-primary"}`}>
                    {card.reversed ? "↓ Перевёрнута" : "↑ Прямая"}
                  </Badge>
                  {card.keywords?.length > 0 && (
                    <div className="mt-3 flex flex-wrap justify-center gap-1">
                      {card.keywords.slice(0, 3).map((kw) => (
                        <span key={kw} className="text-xs text-muted-foreground/70">{kw}</span>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
          <Card className="border-primary/20 bg-card/30">
            <CardContent className="p-6">
              <h3 className="mb-4 font-heading text-lg font-semibold text-primary">✦ Интерпретация</h3>
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
