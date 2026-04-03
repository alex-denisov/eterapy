"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

const signs = ["Овен", "Телец", "Близнецы", "Рак", "Лев", "Дева", "Весы", "Скорпион", "Стрелец", "Козерог", "Водолей", "Рыбы"];
const signEmojis: Record<string, string> = { Овен: "♈", Телец: "♉", Близнецы: "♊", Рак: "♋", Лев: "♌", Дева: "♍", Весы: "♎", Скорпион: "♏", Стрелец: "♐", Козерог: "♑", Водолей: "♒", Рыбы: "♓" };

export default function HoroscopePage() {
  const [sign, setSign] = useState("");
  const [period, setPeriod] = useState("daily");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ horoscope: string; model: string } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(selectedSign: string) {
    setSign(selectedSign);
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/horoscope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sign: selectedSign, period }),
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
      <h1 className="font-heading text-3xl font-bold">🌙 Гороскоп</h1>
      <p className="mt-2 text-muted-foreground">Персонализированный прогноз для вашего знака.</p>

      <div className="mt-6 flex gap-2">
        {(["daily", "weekly", "monthly"] as const).map((p) => (
          <Button key={p} variant={period === p ? "default" : "outline"} size="sm" onClick={() => setPeriod(p)}
            className={period !== p ? "border-primary/30 text-primary" : ""}>
            {{ daily: "На сегодня", weekly: "На неделю", monthly: "На месяц" }[p]}
          </Button>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
        {signs.map((s) => (
          <button key={s} onClick={() => handleSubmit(s)} disabled={loading}
            className={`rounded-xl border p-3 text-center transition-colors hover:border-primary/50 ${sign === s ? "border-primary bg-primary/10" : "border-border/40 bg-card/30"}`}>
            <span className="text-2xl">{signEmojis[s]}</span>
            <p className="mt-1 text-xs">{s}</p>
          </button>
        ))}
      </div>

      {loading && <p className="mt-6 text-center text-muted-foreground">Составляем прогноз для {sign}...</p>}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {result && !loading && (
        <Card className="mt-8 border-primary/20 bg-card/30">
          <CardContent className="p-6">
            <h3 className="font-heading text-xl font-semibold">{signEmojis[sign]} {sign}</h3>
            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{result.horoscope}</div>
            <p className="mt-4 text-xs text-muted-foreground/60">Модель: {result.model}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
