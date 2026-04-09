"use client";

import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Admin error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-md rounded-2xl border border-destructive/30 bg-card/50 p-8 text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <h2 className="font-heading text-xl font-semibold mb-2">Ошибка в панели администратора</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Произошла ошибка. Попробуйте обновить страницу или вернитесь в начало.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-navy hover:bg-primary/90 transition-colors"
          >
            Попробовать снова
          </button>
          <a
            href="/admin"
            className="rounded-lg border border-border/40 px-4 py-2.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            В начало
          </a>
        </div>
      </div>
    </div>
  );
}
