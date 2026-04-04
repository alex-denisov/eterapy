"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToolLoading } from "@/components/tool-loading";
import { sessionCounter } from "@/lib/session-counter";

interface TarotCard {
  name: string;
  nameEn: string;
  position: string;
  reversed: boolean;
  keywords: string[];
}

interface TarotResult {
  cards: TarotCard[];
  interpretation: string;
}

const POSITION_COLORS = ["text-blue-400", "text-primary", "text-purple-400"];

export default function TarotPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TarotResult | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    // Проверяем лимит
    if (!sessionCounter.increment()) {
      setError("Лимит сессий исчерпан на этот месяц. Зарегистрируйтесь чтобы продолжить.");
      return;
    }
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await fetch("/api/ai/tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка сервера");
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-heading text-3xl font-bold md:text-4xl">🃏 Расклад Таро</h1>
      <p className="mt-2 text-muted-foreground">
        Три карты · Прошлое, Настоящее, Будущее · Колода Райдера-Уэйта
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex gap-3">
        <Input
          placeholder="Ваш вопрос — чем конкретнее, тем точнее..."
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          className="flex-1 bg-card/50"
        />
        <Button type="submit" disabled={loading || !question.trim()}>
          Разложить
        </Button>
      </form>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {loading && <ToolLoading message="Раскладываем карты..." />}

      {result && (
        <div className="mt-10 space-y-6">
          {/* Три карты */}
          <div className="grid gap-4 md:grid-cols-3">
            {result.cards.map((card, i) => (
              <Card key={card.nameEn} className="border-primary/20 bg-card/50 overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-primary/40 to-primary/10" />
                <CardContent className="p-5 text-center">
                  <p className={`text-xs font-semibold uppercase tracking-wider ${POSITION_COLORS[i]}`}>
                    {card.position}
                  </p>
                  <div className="my-4 text-4xl">
                    {["🌅", "🌕", "🌟"][i]}
                  </div>
                  <p className="font-heading text-lg font-semibold">{card.name}</p>
                  <Badge
                    variant="secondary"
                    className={`mt-2 text-xs ${card.reversed ? "bg-rose-500/10 text-rose-400" : "bg-primary/10 text-primary"}`}
                  >
                    {card.reversed ? "↓ Перевёрнута" : "↑ Прямая"}
                  </Badge>
                  <div className="mt-3 flex flex-wrap justify-center gap-1">
                    {card.keywords.slice(0, 3).map((kw) => (
                      <span key={kw} className="text-xs text-muted-foreground/70">{kw}</span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Интерпретация */}
          <Card className="border-primary/20 bg-card/30">
            <CardContent className="p-6">
              <h3 className="mb-4 font-heading text-lg font-semibold text-primary">✦ Интерпретация</h3>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {result.interpretation}
              </div>
            </CardContent>
          </Card>

          <Button variant="outline" className="border-border/40 text-muted-foreground"
            onClick={() => { setResult(null); setQuestion(""); }}>
            Новый расклад
          </Button>
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground/50">
        Расклад носит развлекательный и ознакомительный характер.
      </p>
    </div>
  );
}
