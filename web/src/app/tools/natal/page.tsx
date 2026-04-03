"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function NatalPage() {
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sunSign: string; interpretation: string; model: string } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/natal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ birthDate, birthTime, birthPlace }),
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
      <h1 className="font-heading text-3xl font-bold">⭐ Натальная карта</h1>
      <p className="mt-2 text-muted-foreground">Описание вашей натальной карты по дате рождения.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Дата рождения *</label>
          <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required className="bg-card/50" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Время рождения (для точного расчёта)</label>
          <Input type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} className="bg-card/50" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-muted-foreground">Место рождения</label>
          <Input placeholder="Город" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} className="bg-card/50" />
        </div>
        <Button type="submit" disabled={loading || !birthDate}>{loading ? "Рассчитываем..." : "Построить карту"}</Button>
      </form>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {result && (
        <Card className="mt-8 border-primary/20 bg-card/30">
          <CardContent className="p-6">
            <h3 className="font-heading text-xl font-semibold">☀️ Солнце в знаке {result.sunSign}</h3>
            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{result.interpretation}</div>
            <p className="mt-4 text-xs text-muted-foreground/60">Модель: {result.model}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
