"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function NumerologyPage() {
  const [birthDate, setBirthDate] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    lifePathNumber: number;
    archetype: string;
    keywords: string[];
    interpretation: string;
    model: string;
  } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/numerology", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate, name }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      setResult(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <h1 className="font-heading text-3xl font-bold">🔢 Нумерология</h1>
      <p className="mt-2 text-muted-foreground">
        Число жизненного пути по системе Пифагора.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required className="bg-card/50" />
        <Input placeholder="Ваше имя (необязательно)" value={name} onChange={(e) => setName(e.target.value)} className="bg-card/50" />
        <Button type="submit" disabled={loading || !birthDate}>{loading ? "Считаем..." : "Рассчитать"}</Button>
      </form>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {result && (
        <Card className="mt-8 border-primary/20 bg-card/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <span className="font-heading text-5xl font-bold text-primary">{result.lifePathNumber}</span>
              <div>
                <h3 className="font-heading text-xl font-semibold">{result.archetype}</h3>
                <div className="mt-1 flex flex-wrap gap-1">
                  {result.keywords.map((kw) => (
                    <Badge key={kw} variant="secondary" className="bg-primary/10 text-xs text-primary">{kw}</Badge>
                  ))}
                </div>
              </div>
            </div>
            <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{result.interpretation}</div>
            <p className="mt-4 text-xs text-muted-foreground/60">Модель: {result.model}</p>
          </CardContent>
        </Card>
      )}

      <p className="mt-8 text-xs text-muted-foreground/60">
        Нумерологический расчёт носит развлекательный и ознакомительный характер.
      </p>
    </div>
  );
}
