"use client";

import { useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AuthModal } from "@/components/auth-modal";
import { AIShareButton } from "@/components/ai-share-button";
import { PaywallScreen } from "@/components/paywall-screen";

const questions = [
  "Что сейчас занимает ваши мысли больше всего?",
  "Какую эмоцию вы чувствуете чаще всего в последнее время?",
  "Если бы вы могли изменить одну вещь в ближайшие 30 дней, что бы это было?",
  "Что даёт вам силы, когда трудно?",
  "Что вы откладываете, но знаете что это важно?",
];

export default function CheckinPage() {
  const { data: session, status } = useSession();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [pendingAnswers, setPendingAnswers] = useState<string[] | null>(null);
  const [isLimited, setIsLimited] = useState(false);

  const submitAnswers = useCallback(async (finalAnswers: string[]) => {
    setLoading(true);
    setError("");
    setShowAuth(false);
    setIsLimited(false);
    try {
      const res = await fetch("/api/ai/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: finalAnswers }),
      });
      if (res.status === 429) { setIsLimited(true); return; }
      if (!res.ok) throw new Error((await res.json()).error || "Ошибка сервера");
      const data = await res.json();
      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, []);

  function handleNext() {
    if (!currentAnswer.trim()) return;
    const updated = [...answers, currentAnswer.trim()];
    setAnswers(updated);
    setCurrentAnswer("");

    const isFinal = step >= 4;
    if (isFinal) {
      if (!session && status !== "loading") {
        setPendingAnswers(updated);
        setShowAuth(true);
      } else {
        submitAnswers(updated);
      }
    } else {
      setStep(step + 1);
    }
  }

  function handleSkip() {
    if (answers.length >= 3) {
      if (!session && status !== "loading") {
        setPendingAnswers(answers);
        setShowAuth(true);
      } else {
        submitAnswers(answers);
      }
    }
  }

  function reset() {
    setStep(0); setAnswers([]); setCurrentAnswer(""); setResult(null); setError(""); setPendingAnswers(null); setIsLimited(false);
  }

  if (loading) {
    return (
      <div className="mx-auto flex max-w-2xl flex-col items-center px-4 py-20 text-center">
        <div className="text-4xl animate-pulse">✦</div>
        <p className="mt-4 text-lg text-muted-foreground">Анализирую ваши ответы...</p>
      </div>
    );
  }

  if (isLimited) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-heading text-3xl font-bold">💬 Рефлексия</h1>
        <PaywallScreen onReset={reset} />
      </div>
    );
  }

  if (result) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="font-heading text-3xl font-bold">💬 Ваше отражение</h1>
        <Card className="mt-8 border-primary/20 bg-card/30">
          <CardContent className="p-6">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {result.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")}
            </div>
          </CardContent>
        </Card>
        <AIShareButton tool="CHECKIN" title="Рефлексия" resultText={result} />
        <div className="mt-6 flex gap-3">
          <Button onClick={reset} variant="outline" className="border-border/40 text-muted-foreground">Пройти заново</Button>
        </div>
        <p className="mt-8 text-xs text-muted-foreground/60">Носит рефлексивный характер, не является психологической консультацией.</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      <AuthModal
        open={showAuth}
        toolName="Рефлексия"
        onSuccess={() => pendingAnswers && submitAnswers(pendingAnswers)}
        onClose={() => setShowAuth(false)}
      />

      <h1 className="font-heading text-3xl font-bold md:text-4xl">💬 Рефлексия</h1>
      <p className="mt-2 text-muted-foreground">Ответьте на несколько вопросов — получите структурированное отражение вашего состояния.</p>

      <div className="mt-8 flex gap-1">
        {questions.map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i < step ? "bg-primary" : i === step ? "bg-primary/50" : "bg-border/40"}`} />
        ))}
      </div>

      <Card className="mt-6 border-border/40 bg-card/50">
        <CardContent className="p-6">
          <p className="text-xs text-muted-foreground">Вопрос {step + 1} из {questions.length}</p>
          <h2 className="mt-2 font-heading text-xl font-semibold">{questions[step]}</h2>
          <textarea value={currentAnswer} onChange={(e) => setCurrentAnswer(e.target.value)}
            placeholder="Напишите то, что приходит в голову..."
            className="mt-4 w-full resize-none rounded-lg border border-border/40 bg-background/50 p-3 text-sm focus:border-primary focus:outline-none"
            rows={4} />
          <div className="mt-4 flex items-center justify-between">
            {step >= 3 && (
              <Button variant="ghost" size="sm" onClick={handleSkip} className="text-muted-foreground">Получить результат</Button>
            )}
            <div className="ml-auto">
              <Button onClick={handleNext} disabled={!currentAnswer.trim()}>
                {step >= 4 ? "Завершить" : "Далее →"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
    </div>
  );
}
