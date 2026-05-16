"use client";

import { useEffect } from "react";
import { appUrl } from "@/lib/subdomain";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void error.digest;
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="soft-card mx-auto w-full max-w-md border-[var(--soft-terracotta)] p-8 text-center">
        <p className="text-4xl mb-4">⚠️</p>
        <h2 className="soft-h3 mb-2 font-semibold">Что-то пошло не так</h2>
        <p className="mb-6 text-[15px]" style={{ color: "var(--soft-ink-soft)" }}>
          Произошла ошибка при загрузке страницы. Попробуйте обновить.
        </p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="soft-button soft-button-primary font-semibold"
          >
            Попробовать снова
          </button>
          <a
            href={appUrl("/cabinet")}
            className="soft-button soft-button-ghost"
            style={{ color: "var(--soft-ink-soft)" }}
          >
            В начало
          </a>
        </div>
      </div>
    </div>
  );
}
