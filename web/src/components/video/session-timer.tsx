"use client";

import { useState, useEffect } from "react";

interface SessionTimerProps {
  startedAt: Date | null;
  durationMin: number; // запланированная длительность в минутах
}

export function SessionTimer({ startedAt, durationMin }: SessionTimerProps) {
  const [elapsed, setElapsed] = useState(0); // секунды прошло

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startedAt.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  if (!startedAt) return null;

  const totalSec = durationMin * 60;
  const remaining = Math.max(0, totalSec - elapsed);
  const progress = Math.min(1, elapsed / totalSec);

  function fmt(sec: number) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  }

  const isWarning = remaining > 0 && remaining <= 5 * 60; // последние 5 минут
  const isOver = remaining === 0;

  return (
    <div className={`flex items-center gap-3 rounded-xl px-4 py-2 ${
      isOver ? "bg-red-500/20 border border-red-500/30" :
      isWarning ? "bg-yellow-500/10 border border-yellow-500/20" :
      "bg-white/5 border border-white/10"
    }`}>
      {/* Прогресс-бар */}
      <div className="w-24 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            isOver ? "bg-red-400" : isWarning ? "bg-yellow-400" : "bg-primary"
          }`}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Время */}
      <div className="text-sm font-mono">
        <span className="text-muted-foreground text-xs">+</span>
        <span className={isWarning ? "text-yellow-400" : "text-foreground"}>{fmt(elapsed)}</span>
        {durationMin > 0 && (
          <span className="text-muted-foreground text-xs ml-1">
            / {isOver
              ? <span className="text-red-400">+{fmt(elapsed - totalSec)}</span>
              : <span className={isWarning ? "text-yellow-400" : ""}>{fmt(remaining)} ост.</span>
            }
          </span>
        )}
      </div>

      {isWarning && !isOver && (
        <span className="text-xs text-yellow-400 animate-pulse">⚡ Скоро конец</span>
      )}
      {isOver && (
        <span className="text-xs text-red-400 animate-pulse">⏰ Время вышло</span>
      )}
    </div>
  );
}
