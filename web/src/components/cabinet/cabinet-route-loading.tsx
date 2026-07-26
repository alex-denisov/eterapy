/**
 * Экран загрузки ВНУТРИ кабинета.
 *
 * INC-085 (владелец 2026-07-27): при переходе между страницами кабинета
 * появлялся общий `RouteLoading` — оверлей `position: fixed; inset: 0`. Он
 * закрывал весь вьюпорт целиком: и сайдбар, и шапку, и таб-бар, то есть ровно
 * ту навигацию, которая при переходе никуда не девается. Визуально это читалось
 * как «приложение перезагружается», а не «грузится страница», и рамка заведомо
 * не совпадала с областью `app-shell-main`, внутри которой меняется контент.
 *
 * Здесь фолбэк живёт в потоке главной колонки: он занимает её ширину и разумную
 * высоту, оболочка остаётся на месте. Распорка на весь экран тоже не нужна —
 * причина, по которой она стоит в публичном `RouteLoading` (прыжок футера при
 * стриме, B549), в кабинете отсутствует: футера здесь нет.
 */
export function CabinetRouteLoading() {
  return (
    <div
      className="flex w-full flex-col items-center justify-center gap-4 px-4"
      style={{ minHeight: "min(60svh, 26rem)" }}
      role="status"
      aria-live="polite"
    >
      <span
        style={{
          display: "inline-block",
          width: 44,
          height: 44,
          flexShrink: 0,
          borderRadius: "999px",
          background: [
            "radial-gradient(circle at 35% 35%, #fff, transparent 38%)",
            "conic-gradient(from 30deg, #f4c9a8, #e8b8d1, #d9c9e8, #f4c9a8)",
          ].join(","),
          boxShadow: "0 0 0 1px rgba(60,30,20,0.07), 0 4px 14px -4px rgba(214,117,88,0.38)",
          animation: "softHaloBreathe 5s ease-in-out infinite",
        }}
        aria-hidden="true"
      />
      <p style={{ fontSize: "0.875rem", color: "#8a7e76", margin: 0 }}>Загрузка…</p>
    </div>
  );
}
