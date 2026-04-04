"use client";
import { useSession } from "next-auth/react";
import { sessionCounter } from "@/lib/session-counter";

import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ToolLoading } from "@/components/tool-loading";
import { AuthRequiredBlock, LimitExceededBlock } from "@/components/tool-auth-gate";

const SIGNS = [
  { name: "Овен", emoji: "♈", dates: "21.03–19.04" },
  { name: "Телец", emoji: "♉", dates: "20.04–20.05" },
  { name: "Близнецы", emoji: "♊", dates: "21.05–20.06" },
  { name: "Рак", emoji: "♋", dates: "21.06–22.07" },
  { name: "Лев", emoji: "♌", dates: "23.07–22.08" },
  { name: "Дева", emoji: "♍", dates: "23.08–22.09" },
  { name: "Весы", emoji: "♎", dates: "23.09–22.10" },
  { name: "Скорпион", emoji: "♏", dates: "23.10–21.11" },
  { name: "Стрелец", emoji: "♐", dates: "22.11–21.12" },
  { name: "Козерог", emoji: "♑", dates: "22.12–19.01" },
  { name: "Водолей", emoji: "♒", dates: "20.01–18.02" },
  { name: "Рыбы", emoji: "♓", dates: "19.02–20.03" },
];

const PERIODS = [
  { key: "daily", label: "На сегодня" },
  { key: "weekly", label: "На неделю" },
  { key: "monthly", label: "На месяц" },
] as const;

export default function HoroscopePage() {
  const [sign, setSign] = useState<typeof SIGNS[0] | null>(null);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function handleSelect(s: typeof SIGNS[0]) {
    setSign(s);
    setResult(null);
    if (!sessionCounter.increment()) {
      setError("Лимит сессий исчерпан на этот месяц.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/horoscope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sign: s.name, period }),
      });
      if (!res.ok) throw new Error((await res.json()).error);
      const data = await res.json();
      setResult(data.horoscope);
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

      {/* Период */}
      <div className="mt-6 inline-flex rounded-xl border border-border/40 bg-card/30 p-1 gap-1">
        {PERIODS.map((p) => (
          <button key={p.key}
            onClick={() => { setPeriod(p.key); if (sign) handleSelect(sign); }}
            className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
              period === p.key ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* Знаки зодиака */}
      <div className="mt-6 grid grid-cols-4 gap-2 sm:grid-cols-6">
        {SIGNS.map((s) => (
          <button key={s.name} onClick={() => handleSelect(s)} disabled={loading}
            className={`flex flex-col items-center rounded-xl border p-3 text-center transition-all ${
              sign?.name === s.name
                ? "border-primary bg-primary/10 shadow-[0_0_12px_rgba(201,168,76,0.15)]"
                : "border-border/40 bg-card/30 hover:border-primary/40"
            }`}>
            <span className="text-xl">{s.emoji}</span>
            <p className="mt-1 text-xs font-medium">{s.name}</p>
            <p className="text-[10px] text-muted-foreground/60">{s.dates}</p>
          </button>
        ))}
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {loading && sign && <ToolLoading message={`Составляем прогноз для ${sign.name}...`} />}

      {result && sign && !loading && (
        <Card className="mt-8 border-primary/20 bg-card/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{sign.emoji}</span>
              <h2 className="font-heading text-xl font-semibold">{sign.name}</h2>
              <span className="text-sm text-muted-foreground">
                {PERIODS.find(p => p.key === period)?.label.toLowerCase()}
              </span>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{result}</div>
          </CardContent>
        </Card>
      )}

      {!sign && !loading && (
        <p className="mt-8 text-center text-sm text-muted-foreground">Выберите знак зодиака ↑</p>
      )}
    </div>
  );
}
