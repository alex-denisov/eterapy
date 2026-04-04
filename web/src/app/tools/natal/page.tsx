"use client";
import { sessionCounter } from "@/lib/session-counter";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ToolLoading } from "@/components/tool-loading";

export default function NatalPage() {
  const [birthDate, setBirthDate] = useState("");
  const [birthTime, setBirthTime] = useState("");
  const [birthPlace, setBirthPlace] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ sunSign: string; interpretation: string } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!sessionCounter.increment()) { setError("Лимит сессий исчерпан на этот месяц."); return; }
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
    <div className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-heading text-3xl font-bold">⭐ Натальная карта</h1>
      <p className="mt-2 text-muted-foreground">
        Описание вашей натальной карты по дате, времени и месту рождения.
      </p>

      {!result && !loading && (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Дата рождения *</label>
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required className="bg-card/50" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">
              Время рождения
              <span className="ml-1 text-xs text-muted-foreground/60">(влияет на точность расчёта)</span>
            </label>
            <Input type="time" value={birthTime} onChange={(e) => setBirthTime(e.target.value)} className="bg-card/50" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Место рождения</label>
            <Input placeholder="Город, страна" value={birthPlace} onChange={(e) => setBirthPlace(e.target.value)} className="bg-card/50" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!birthDate} className="w-full">Построить карту</Button>
        </form>
      )}

      {loading && <ToolLoading message="Строим натальную карту..." />}

      {result && (
        <div className="mt-8">
          <Card className="border-primary/20 bg-card/30">
            <CardContent className="p-6">
              <h2 className="font-heading text-xl font-semibold">☀️ Солнце в знаке {result.sunSign}</h2>
              <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{result.interpretation}</div>
            </CardContent>
          </Card>
          <Button variant="outline" className="mt-4 border-border/40 text-muted-foreground"
            onClick={() => { setResult(null); setBirthDate(""); setBirthTime(""); setBirthPlace(""); }}>
            Новый расчёт
          </Button>
        </div>
      )}
    </div>
  );
}
