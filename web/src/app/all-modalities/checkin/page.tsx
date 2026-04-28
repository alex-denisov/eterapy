"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AIShareButton } from "@/components/ai-share-button";
import { PaywallScreen } from "@/components/paywall-screen";
import { DialogueShell } from "@/components/dialogue/dialogue-shell";
import { Disclaimer } from "@/components/ui/disclaimer";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { getFullReadingPriceKopecks } from "@/lib/tool-limit";
import { persistGuestResultDraftToAccount, saveGuestResultDraft } from "@/lib/guest-result-cache";
import { buttonVariants } from "@/lib/button-variants";
import { cn } from "@/lib/utils";

const questions = [
  "Что сейчас занимает ваши мысли больше всего?",
  "Какую эмоцию вы чувствуете чаще всего в последнее время?",
  "Если бы вы могли изменить одну вещь в ближайшие 30 дней, что бы это было?",
  "Что даёт вам силы, когда трудно?",
  "Что вы откладываете, но знаете что это важно?",
];

export default function CheckinPage() {
  const { status } = useSession();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<string[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [isLimited, setIsLimited] = useState(false);
  const [tier, setTier] = useState<"quick" | "full">("quick");
  const [balanceKopecks, setBalanceKopecks] = useState<number | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const FULL_PRICE_KOPECKS = getFullReadingPriceKopecks();

  const submitAnswers = useCallback(async (finalAnswers: string[]) => {
    setLoading(true);
    setError("");
    setIsLimited(false);
    try {
      const res = await fetch("/api/modalities/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: finalAnswers, tier }),
      });
      const data = await res.json();
      if (res.status === 429) {
        if (data.balanceKopecks == null) {
          setError(data.error || "Для этого действия нужна регистрация");
          return;
        }
        setBalanceKopecks(data.balanceKopecks ?? null);
        setIsLimited(true);
        return;
      }
      if (!res.ok) throw new Error(data.error || "Ошибка сервера");
      setResult(data.result);
      setSaveState("idle");
      saveGuestResultDraft({
        tool: "CHECKIN",
        title: tier === "full" ? "Полная рефлексия" : "Первичный ответ",
        prompt: finalAnswers.map((answer, index) => `${index + 1}. ${questions[index]}\n${answer}`).join("\n\n"),
        result: data.result,
      });
      if (data.balanceKopecks != null) setBalanceKopecks(data.balanceKopecks);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }, [tier]);

  function handleNext() {
    if (!currentAnswer.trim()) return;
    const updated = [...answers, currentAnswer.trim()];
    setAnswers(updated);
    setCurrentAnswer("");

    const isFinal = step >= 4;
    if (isFinal) {
      submitAnswers(updated);
    } else {
      setStep(step + 1);
    }
  }

  function handleSkip() {
    if (answers.length >= 3) {
      submitAnswers(answers);
    }
  }

  function reset() {
    setStep(0); setAnswers([]); setCurrentAnswer(""); setResult(null); setError(""); setIsLimited(false); setTier("quick"); setBalanceKopecks(null); setSaveState("idle");
  }

  async function handleSaveToAccount() {
    setSaveState("saving");
    const persisted = await persistGuestResultDraftToAccount();
    setSaveState(persisted.saved ? "saved" : "error");
  }

  if (loading) {
    return (
      <DialogueShell
        title={tier === "full" ? "Проводим глубинный анализ" : "Собираю отражение"}
        description="Ответ появится здесь автоматически."
      >
        <div className="flex min-h-64 flex-col items-center justify-center text-center">
          <div className="h-14 w-14 animate-pulse rounded-full bg-[radial-gradient(circle,var(--dialogue-halo-core),transparent_68%)] shadow-[var(--shadow-halo-soft)]" />
          <p className="mt-4 text-lg text-muted-foreground">
            {tier === "full" ? "Сопоставляю ответы и контекст..." : "Анализирую ваши ответы..."}
          </p>
        </div>
      </DialogueShell>
    );
  }

  return (
    <DialogueShell
      title={result ? "Ваше отражение" : "Рефлексия"}
      description={!result && (
        tier === "quick"
          ? "Ответьте на вопросы и получите краткое отражение состояния."
          : "Развёрнутый анализ с рекомендациями и более глубокими связями между ответами."
      )}
      progress={!result ? { current: step + 1, total: questions.length } : undefined}
    >
      <PublicJsonLd route="/all-modalities/checkin" />
      {isLimited && <PaywallScreen balanceKopecks={balanceKopecks ?? undefined} fullPriceKopecks={FULL_PRICE_KOPECKS} onClose={() => setIsLimited(false)} />}

      {/* Быстрый / Полный переключатель */}
      {!result && <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setTier("quick")}
          className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
            tier === "quick"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/40 bg-card/30 text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="text-base font-semibold">⚡ Быстрый</div>
          <div className="mt-0.5 text-xs text-muted-foreground">Бесплатно · 3/мес</div>
        </button>
        <button
          type="button"
          onClick={() => setTier("full")}
          className={`flex-1 rounded-xl border px-4 py-3 text-sm font-medium transition-all ${
            tier === "full"
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border/40 bg-card/30 text-muted-foreground hover:text-foreground"
          }`}
        >
          <div className="text-base font-semibold">🔮 Полный</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{FULL_PRICE_KOPECKS / 100} ₽ · Детальный анализ</div>
        </button>
      </div>}

      {!result && <Card className="mt-6 border-border/40 bg-card/50">
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
      </Card>}

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {result && (
        <div>
          {tier === "full" && (
            <Badge className="mt-4 bg-primary/10 text-primary text-xs">🔮 Полный расклад</Badge>
          )}
          <Card className="mt-8 border-primary/20 bg-card/30">
            <CardContent className="p-6">
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {result.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")}
              </div>
            </CardContent>
          </Card>
          <AIShareButton tool="CHECKIN" title="Рефлексия" resultText={result} />
          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            {status === "authenticated" ? (
              <Button onClick={handleSaveToAccount} disabled={saveState === "saving" || saveState === "saved"} data-testid="save-result-authenticated">
                {saveState === "saved" ? "Сохранено в кабинете" : saveState === "saving" ? "Сохраняем..." : "Сохранить в кабинет"}
              </Button>
            ) : (
              <Link href="/register?intent=save-result" className={cn(buttonVariants())} data-testid="save-result-register">
                Сохранить ответ
              </Link>
            )}
            <Button onClick={reset} variant="outline" className="border-border/40 text-muted-foreground">Пройти заново</Button>
          </div>
          {status !== "authenticated" && (
            <p className="mt-3 text-sm text-muted-foreground">
              Ответ сохранится после регистрации. Уже есть аккаунт?{" "}
              <Link href="/login?intent=save-result" className="text-primary hover:underline">
                Войти
              </Link>
            </p>
          )}
          {saveState === "error" && <p className="mt-3 text-sm text-destructive">Не удалось сохранить. Попробуйте еще раз.</p>}
          <Disclaimer className="mt-8" tone="info" title="Ограничение">
            Носит рефлексивный характер, не является психологической консультацией.
          </Disclaimer>
        </div>
      )}
    </DialogueShell>
  );
}
