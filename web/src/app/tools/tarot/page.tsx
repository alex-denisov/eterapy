"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface TarotResult {
  cards: Array<{
    name: string;
    nameEn: string;
    position: string;
    reversed: boolean;
    keywords: string[];
  }>;
  interpretation: string;
  model: string;
  provider: string;
}

export default function TarotPage() {
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<TarotResult | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    setLoading(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/ai/tarot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Ошибка сервера");
      }

      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-heading text-3xl font-bold md:text-4xl">
        🃏 Расклад Таро
      </h1>
      <p className="mt-2 text-muted-foreground">
        Три карты: Прошлое · Настоящее · Будущее. Интерпретация в контексте
        вашего вопроса.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex gap-3">
        <Input
          placeholder="Задайте вопрос (например: Что мне стоит знать о моей ситуации?)"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={500}
          className="flex-1 bg-card/50"
        />
        <Button type="submit" disabled={loading || !question.trim()}>
          {loading ? "Расклад..." : "Разложить"}
        </Button>
      </form>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {result && (
        <div className="mt-8 space-y-6">
          {/* Карты */}
          <div className="grid gap-4 md:grid-cols-3">
            {result.cards.map((card) => (
              <Card
                key={card.nameEn}
                className="border-primary/20 bg-card/50"
              >
                <CardContent className="p-5 text-center">
                  <p className="text-xs text-muted-foreground">
                    {card.position}
                  </p>
                  <p className="mt-2 font-heading text-lg font-semibold">
                    {card.name}
                  </p>
                  <Badge
                    variant="secondary"
                    className={`mt-2 text-xs ${
                      card.reversed
                        ? "bg-destructive/10 text-destructive"
                        : "bg-primary/10 text-primary"
                    }`}
                  >
                    {card.reversed ? "Перевёрнута" : "Прямая"}
                  </Badge>
                  <div className="mt-3 flex flex-wrap justify-center gap-1">
                    {card.keywords.map((kw) => (
                      <span
                        key={kw}
                        className="text-xs text-muted-foreground"
                      >
                        {kw}
                      </span>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Интерпретация */}
          <Card className="border-primary/20 bg-card/30">
            <CardContent className="p-6">
              <h3 className="mb-3 font-heading text-lg font-semibold">
                ✦ Интерпретация
              </h3>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {result.interpretation}
              </div>
              <p className="mt-4 text-xs text-muted-foreground/60">
                Модель: {result.model} ({result.provider})
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <p className="mt-8 text-xs text-muted-foreground/60">
        Расклад носит развлекательный и ознакомительный характер и не является
        руководством к действию.
      </p>
    </div>
  );
}
