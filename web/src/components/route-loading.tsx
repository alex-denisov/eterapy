/**
 * Экран загрузки сегмента. Раньше жил как `app/loading.tsx` — на корне.
 *
 * INC-078: корневой `loading.tsx` создаёт Suspense-границу для КАЖДОГО
 * маршрута. Next начинает стримить ответ и фиксирует HTTP 200 до того, как
 * серверный компонент дойдёт до `notFound()`, — поэтому `/practitioners/…`,
 * `/p/…` и `/legal/…` отдавали «страницу не найдено» с кодом 200 и двумя
 * взаимоисключающими robots-тегами в теле. Для `/library` и `/products` это
 * закрывали обходом в proxy (списки слагов известны на сборке), но список
 * активных профилей живёт в БД и меняется в рантайме — обходом не лечится.
 *
 * Поэтому граница переехала на сегменты, где она нужна и безопасна: там, где
 * страница действительно долго стримит, а неизвестный слаг либо невозможен,
 * либо уже 404-ится в proxy до начала стрима.
 *
 * B549: оверлей ниже — `position: fixed` и места в потоке не занимает, поэтому
 * во время стрима футер оказывался внутри вьюпорта и прыгал вниз при приходе
 * контента (CLS 0.30 на страницах услуг). Распорка в потоке резервирует высоту
 * вьюпорта только на время фолбэка; финальная раскладка страницы не меняется.
 */
export function RouteLoading() {
  return (
    <>
      <div aria-hidden="true" style={{ minHeight: "100svh" }} />
      <div
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5"
        style={{ background: "#fbf6ee" }}
      >
        <span
          style={{
            display: "inline-block",
            width: 56,
            height: 56,
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
        <p style={{ fontSize: "0.875rem", color: "#8a7e76", margin: 0 }}>Загрузка...</p>
      </div>
    </>
  );
}
