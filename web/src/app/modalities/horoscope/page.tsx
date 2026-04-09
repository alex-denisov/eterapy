"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Card, CardContent } from "@/components/ui/card";
import { ToolLoading } from "@/components/tool-loading";
import { AuthModal } from "@/components/auth-modal";
import { AIShareButton } from "@/components/ai-share-button";
import { PaywallScreen } from "@/components/paywall-screen";

const SIGNS = [
  { name: "Овен",      emoji: "♈", dates: "21.03–19.04" },
  { name: "Телец",     emoji: "♉", dates: "20.04–20.05" },
  { name: "Близнецы",  emoji: "♊", dates: "21.05–20.06" },
  { name: "Рак",       emoji: "♋", dates: "21.06–22.07" },
  { name: "Лев",       emoji: "♌", dates: "23.07–22.08" },
  { name: "Дева",      emoji: "♍", dates: "23.08–22.09" },
  { name: "Весы",      emoji: "♎", dates: "23.09–22.10" },
  { name: "Скорпион",  emoji: "♏", dates: "23.10–21.11" },
  { name: "Стрелец",   emoji: "♐", dates: "22.11–21.12" },
  { name: "Козерог",   emoji: "♑", dates: "22.12–19.01" },
  { name: "Водолей",   emoji: "♒", dates: "20.01–18.02" },
  { name: "Рыбы",      emoji: "♓", dates: "19.02–20.03" },
];

const PERIODS = [
  { key: "daily", label: "На сегодня" },
  { key: "weekly", label: "На неделю" },
  { key: "monthly", label: "На месяц" },
] as const;

export default function HoroscopePage() {
  const { data: session, status } = useSession();
  const [sign, setSign] = useState<typeof SIGNS[0] | null>(null);
  const [period, setPeriod] = useState<"daily" | "weekly" | "monthly">("daily");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [pendingSign, setPendingSign] = useState<typeof SIGNS[0] | null>(null);
  const [isLimited, setIsLimited] = useState(false);

  async function fetchHoroscope(s: typeof SIGNS[0], p: typeof period) {
    setLoading(true);
    setError("");
    setShowAuth(false);
    setResult(null);
    setIsLimited(false);
    try {
      const res = await fetch("/api/modalities/horoscope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sign: s.name, period: p }),
      });
      if (res.status === 429) { setIsLimited(true); return; }
      if (!res.ok) throw new Error((await res.json()).error);
      setResult((await res.json()).horoscope);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  function handleSelect(s: typeof SIGNS[0]) {
    setSign(s);
    setResult(null);
    if (!session && status !== "loading") {
      setPendingSign(s);
      setShowAuth(true);
      return;
    }
    fetchHoroscope(s, period);
  }

  function handlePeriodChange(p: typeof period) {
    setPeriod(p);
    if (sign && result) fetchHoroscope(sign, p);
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <AuthModal
        open={showAuth}
        toolName="Гороскоп"
        onSuccess={() => pendingSign && fetchHoroscope(pendingSign, period)}
        onClose={() => setShowAuth(false)}
      />

      <h1 className="font-heading text-3xl font-bold">🌙 Гороскоп</h1>
      <p className="mt-2 text-muted-foreground">Персонализированный прогноз для вашего знака.</p>

      <div className="mt-6 inline-flex rounded-xl border border-border/40 bg-card/30 p-1 gap-1">
        {PERIODS.map((p) => (
          <button key={p.key} onClick={() => handlePeriodChange(p.key)}
            className={`rounded-lg px-4 py-1.5 text-sm transition-colors ${
              period === p.key ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:text-foreground"
            }`}>{p.label}</button>
        ))}
      </div>

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

      {isLimited && <PaywallScreen onReset={() => { setIsLimited(false); setSign(null); setResult(null); }} />}
      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      {loading && sign && <ToolLoading message={`Составляем прогноз для ${sign.name}...`} />}

      {result && sign && !loading && (
        <Card className="mt-8 border-primary/20 bg-card/30">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <span className="text-3xl">{sign.emoji}</span>
              <h2 className="font-heading text-xl font-semibold">{sign.name}</h2>
              <span className="text-sm text-muted-foreground">{PERIODS.find(p => p.key === period)?.label.toLowerCase()}</span>
            </div>
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {result.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")}
            </div>
          </CardContent>
        </Card>
      )}
      {result && sign && !loading && (
        <AIShareButton
          tool="HOROSCOPE"
          title={`Гороскоп для ${sign.name} ${PERIODS.find(p => p.key === period)?.label.toLowerCase() ?? ""}`}
          resultText={result}
        />
      )}

      {!sign && !loading && (
        <p className="mt-8 text-center text-sm text-muted-foreground">Выберите знак зодиака ↑</p>
      )}
    </div>
  );
}
