"use client";

import { useState } from "react";
import { useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ToolLoading } from "@/components/tool-loading";
import { AuthModal } from "@/components/auth-modal";

export default function NumerologyPage() {
  const { data: session, status } = useSession();
  const [birthDate, setBirthDate] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    lifePathNumber: number; archetype: string; keywords: string[]; interpretation: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [showAuth, setShowAuth] = useState(false);

  async function doSubmit() {
    setLoading(true);
    setError("");
    setShowAuth(false);
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

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!session && status !== "loading") { setShowAuth(true); return; }
    doSubmit();
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-12">
      {showAuth && <AuthModal toolName="Нумерология" onSuccess={doSubmit} onClose={() => setShowAuth(false)} />}

      <h1 className="font-heading text-3xl font-bold">🔢 Нумерология</h1>
      <p className="mt-2 text-muted-foreground">Число жизненного пути по системе Пифагора.</p>

      {!result && !loading && (
        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Дата рождения *</label>
            <Input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required className="bg-card/50" />
          </div>
          <div>
            <label className="mb-1 block text-sm text-muted-foreground">Имя <span className="text-xs text-muted-foreground/60">(необязательно)</span></label>
            <Input placeholder="Ваше имя" value={name} onChange={(e) => setName(e.target.value)} className="bg-card/50" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={!birthDate} className="w-full">Рассчитать</Button>
        </form>
      )}

      {loading && <ToolLoading message="Считаем число жизненного пути..." />}

      {result && (
        <div className="mt-8">
          <Card className="border-primary/20 bg-card/30">
            <CardContent className="p-6">
              <div className="flex items-center gap-5">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20">
                  <span className="font-heading text-4xl font-bold text-primary">{result.lifePathNumber}</span>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Число жизненного пути</p>
                  <h2 className="font-heading text-2xl font-bold">{result.archetype}</h2>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {result.keywords.map((kw) => (
                      <Badge key={kw} variant="secondary" className="bg-primary/10 text-xs text-primary">{kw}</Badge>
                    ))}
                  </div>
                </div>
              </div>
              <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                {result.interpretation.replace(/\*\*(.*?)\*\*/g, "$1").replace(/\*(.*?)\*/g, "$1")}
              </div>
            </CardContent>
          </Card>
          <Button variant="outline" className="mt-4 border-border/40 text-muted-foreground"
            onClick={() => { setResult(null); setBirthDate(""); setName(""); }}>
            Новый расчёт
          </Button>
        </div>
      )}
    </div>
  );
}
