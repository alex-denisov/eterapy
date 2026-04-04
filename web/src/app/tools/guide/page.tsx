"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { ToolLoading } from "@/components/tool-loading";
import { AuthModal } from "@/components/auth-modal";
import { AIShareButton } from "@/components/ai-share-button";
import { PaywallScreen } from "@/components/paywall-screen";

const TOPICS = [
  "Как справиться с неопределённостью",
  "Отношения и границы",
  "Карьерная развилка",
  "Поиск своего пути",
  "Внутренний конфликт",
  "Новый этап жизни",
];

export default function GuidePage() {
  const { data: session, status } = useSession();
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showAuth, setShowAuth] = useState(false);
  const [isLimited, setIsLimited] = useState(false);

  async function doSubmit() {
    setLoading(true);
    setError("");
    setShowAuth(false);
    setIsLimited(false);
    try {
      const res = await fetch("/api/ai/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, context }),
      });
      if (res.status === 429) { setIsLimited(true); return; }
      if (!res.ok) throw new Error((await res.json()).error);
      setResult((await res.json()).guide);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session && status !== "loading") { setShowAuth(true); return; }
    doSubmit();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {showAuth && <AuthModal toolName="Личный гид" onSuccess={doSubmit} onClose={() => setShowAuth(false)} />}

      <h1 className="font-heading text-3xl font-bold">📖 Личный гид</h1>
      <p className="mt-2 text-muted-foreground">Персональный текст по теме вашего запроса.</p>

      {!result && !loading && (
        <form onSubmit={handleSubmit} className="mt-8 space-y-5">
          <div>
            <label className="mb-2 block text-sm text-muted-foreground">Выберите тему или напишите свою *</label>
            <div className="mb-3 flex flex-wrap gap-2">
              {TOPICS.map((t) => (
                <button key={t} type="button" onClick={() => setTopic(t)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    topic === t ? "border-primary bg-primary/10 text-primary" : "border-border/40 text-muted-foreground hover:border-primary/40"
                  }`}>{t}</button>
              ))}
            </div>
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Или напишите свою тему..." maxLength={300} className="bg-card/50" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Дополнительный контекст <span className="text-xs text-muted-foreground/60">(необязательно)</span></label>
            <textarea value={context} onChange={(e) => setContext(e.target.value)}
              placeholder="Что именно вас беспокоит? Чем больше деталей — тем точнее гид."
              className="w-full resize-none rounded-lg border border-border/40 bg-card/50 p-3 text-sm focus:border-primary focus:outline-none"
              rows={3} maxLength={500} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!topic.trim()} className="w-full">Создать гид</Button>
        </form>
      )}

      {loading && <ToolLoading message="Составляем персональный гид..." />}

      {isLimited && <PaywallScreen onReset={() => { setIsLimited(false); setTopic(""); setContext(""); }} />}

      {result && (
        <div className="mt-8">
          <Card className="border-primary/20 bg-card/30">
            <CardContent className="p-6">
              <p className="mb-3 text-sm font-medium text-primary">✦ {topic}</p>
              <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {result.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")}
              </div>
            </CardContent>
          </Card>
          <AIShareButton tool="GUIDE" title={`Личный гид — ${topic}`} resultText={result} />
          <Button variant="outline" className="mt-4 border-border/40 text-muted-foreground"
            onClick={() => { setResult(null); setTopic(""); setContext(""); }}>
            Новый гид
          </Button>
        </div>
      )}
    </div>
  );
}
