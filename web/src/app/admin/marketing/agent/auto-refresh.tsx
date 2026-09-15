"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * B746 — ПАНЕЛЬ КОНВЕЙЕРА ОБНОВЛЯЕТСЯ САМА.
 *
 * Владелец 2026-09-15: «счётчики контента в конвейере кажется не обновляются
 * динамически». И не обновлялись: страница серверная (`force-dynamic`), числа
 * верны на момент открытия и меняются только по перезагрузке вкладки.
 *
 * Обновление — серверное (`router.refresh()`), тем же путём, что и после
 * нажатия кнопок кокпита: счётчики считает база, клиент лишь просит новый
 * снимок. Раз в минуту, а не чаще: такт линии — минуты, и более частый опрос
 * мерил бы шум. Отметка времени последнего снимка — чтобы «0» читался как
 * «ноль на 14:32», а не как «страница зависла».
 */
const REFRESH_MS = 60_000;

export function ConveyorAutoRefresh({ renderedAt }: { renderedAt: string }) {
  const router = useRouter();
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, REFRESH_MS);
    return () => clearInterval(timer);
  }, [paused, router]);

  const stamp = new Date(renderedAt).toLocaleTimeString("ru-RU", {
    timeZone: "Europe/Moscow",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <span className="inline-flex items-center gap-2 text-xs text-slate-500" data-testid="conveyor-auto-refresh">
      <span>снимок {stamp} МСК</span>
      <button
        type="button"
        onClick={() => setPaused((value) => !value)}
        className="rounded border border-slate-200 px-2 py-0.5 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-50"
      >
        {paused ? "автообновление выкл" : "автообновление раз в минуту"}
      </button>
    </span>
  );
}
