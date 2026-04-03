"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export default function GuidePage() {
  const [topic, setTopic] = useState("");
  const [context, setContext] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ guide: string; model: string } | null>(null);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/ai/guide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, context }),
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
      <h1 className="font-heading text-3xl font-bold">📖 AI Мини-гид</h1>
      <p className="mt-2 text-muted-foreground">Персональный гид по теме вашего запроса. Глубже, чем гороскоп.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <Input placeholder="Тема (например: Как справиться с неопределённостью)" value={topic}
          onChange={(e) => setTopic(e.target.value)} required maxLength={300} className="bg-card/50" />
        <textarea value={context} onChange={(e) => setContext(e.target.value)}
          placeholder="Дополнительный контекст (необязательно)"
          className="w-full resize-none rounded-lg border border-border/40 bg-card/50 p-3 text-sm focus:border-primary focus:outline-none"
          rows={3} />
        <Button type="submit" disabled={loading || !topic.trim()}>{loading ? "Создаём гид..." : "Создать мини-гид"}</Button>
      </form>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {result && (
        <Card className="mt-8 border-primary/20 bg-card/30">
          <CardContent className="p-6">
            <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">{result.guide}</div>
            <p className="mt-4 text-xs text-muted-foreground/60">Модель: {result.model}</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
