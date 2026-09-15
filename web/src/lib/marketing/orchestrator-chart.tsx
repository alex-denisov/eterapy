/**
 * B746 — ГРАФИК ТРЕНДА ДЛЯ ОТЧЁТА ОРКЕСТРАТОРА.
 *
 * Владелец 2026-09-15: «хочу чтоб в отчётах оркестратора видно было какую-то
 * тенденцию (графики или что-то визуальное)». Картинка рисуется тем же
 * Satori (`next/og`), что и обложки постов, — маршрутом
 * `/api/marketing/orchestrator/trend`: воркер (отдельный процесс на `tsx`)
 * сам не рендерит, он подписывает ряд, просит картинку у сайта и отдаёт байты
 * в Telegram. Так рендер живёт в одном месте, и его можно открыть глазами.
 *
 * Подпись — HMAC от полезной нагрузки на `AUTH_SECRET`, общем у сайта и
 * воркера. Без подписи маршрут был бы бесплатным рендер-сервисом для кого
 * угодно; с подписью он рисует только то, что собрал оркестратор.
 *
 * ⚠ Только те стили, что понимает Satori: flex, абсолютное позиционирование,
 * без grid и без SVG-путей с текстом. Каждый ряд — столбики, а не линия: у
 * столбиков нуль виден как отсутствие, у линии — как провал.
 */

import {
  TREND_CHART_HEIGHT,
  TREND_CHART_WIDTH,
  type TrendChartPayload,
} from "@/lib/marketing/orchestrator-chart-sign";

const INK = "#1f2937";
const MUTED = "#6b7280";
const GRID = "#e5e7eb";
const SERIES = ["#2563eb", "#7c3aed", "#059669", "#d97706"] as const;

interface Panel {
  title: string;
  color: string;
  values: Array<number | null>;
  /** Второй ряд поверх первого (уже, светлее): например «разных заголовков» поверх «постов». */
  overlay?: Array<number | null>;
  overlayLabel?: string;
}

function dayLabel(day: string): string {
  return day.slice(8, 10);
}

function PanelView({ panel, days }: { panel: Panel; days: string[] }) {
  const max = Math.max(1, ...panel.values.map((value) => value ?? 0), ...(panel.overlay ?? []).map((value) => value ?? 0));
  const barArea = 150;
  const total = panel.values.reduce<number>((sum, value) => sum + (value ?? 0), 0);
  return (
    <div style={{ display: "flex", flexDirection: "column", width: 560, height: 250, padding: "12px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 22, fontWeight: 700, color: INK }}>{panel.title}</span>
        <span style={{ fontSize: 16, color: MUTED }}>
          {`за 14 дней: ${total}`}{panel.overlayLabel ? ` · ${panel.overlayLabel}` : ""}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", height: barArea, marginTop: 14, borderBottom: `2px solid ${GRID}` }}>
        {panel.values.map((value, index) => {
          const height = value === null ? 0 : Math.round(((value ?? 0) / max) * (barArea - 8));
          const overlay = panel.overlay?.[index] ?? null;
          const overlayHeight = overlay === null ? 0 : Math.round((overlay / max) * (barArea - 8));
          return (
            <div key={days[index]} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", width: 528 / days.length, height: barArea }}>
              <div style={{ display: "flex", alignItems: "flex-end", height: barArea - 8, position: "relative", width: 24 }}>
                <div style={{ position: "absolute", bottom: 0, left: 0, width: 24, height, backgroundColor: panel.color, opacity: 0.35, borderRadius: 3 }} />
                {panel.overlay ? (
                  <div style={{ position: "absolute", bottom: 0, left: 5, width: 14, height: overlayHeight, backgroundColor: panel.color, borderRadius: 3 }} />
                ) : (
                  <div style={{ position: "absolute", bottom: 0, left: 0, width: 24, height, backgroundColor: panel.color, borderRadius: 3 }} />
                )}
                {value === null ? (
                  <div style={{ position: "absolute", bottom: 0, left: 10, width: 4, height: 4, backgroundColor: GRID, borderRadius: 2 }} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", marginTop: 6 }}>
        {days.map((day) => (
          <div key={day} style={{ display: "flex", justifyContent: "center", width: 528 / days.length, fontSize: 13, color: MUTED }}>
            {dayLabel(day)}
          </div>
        ))}
      </div>
    </div>
  );
}

function DeltaRow({ delta }: { delta: TrendChartPayload["weeks"][number] }) {
  const same = delta.current === delta.previous;
  const improved = delta.better === "up" ? delta.current > delta.previous : delta.current < delta.previous;
  const color = same ? MUTED : improved ? "#059669" : "#dc2626";
  const mark = same ? "=" : improved ? "▲" : "▼";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 18, color: INK }}>
      <span style={{ display: "flex", width: 22, color, fontWeight: 700 }}>{mark}</span>
      <span style={{ display: "flex", width: 230, color: MUTED }}>{delta.label}</span>
      <span style={{ display: "flex", fontWeight: 700 }}>{`${delta.current}${delta.unit}`}</span>
      <span style={{ display: "flex", color: MUTED }}>{`← ${delta.previous}${delta.unit}`}</span>
    </div>
  );
}

export function TrendChart({ payload }: { payload: TrendChartPayload }) {
  const days = payload.days.map((day) => day.day);
  const panels: Panel[] = [
    {
      title: "Постов вышло",
      color: SERIES[0],
      values: payload.days.map((day) => day.posts),
      overlay: payload.days.map((day) => day.distinctTitles),
      overlayLabel: "тёмное — разных заголовков",
    },
    { title: "Просмотры постов дня", color: SERIES[1], values: payload.days.map((day) => day.views) },
    { title: "Страниц Библиотеки", color: SERIES[2], values: payload.days.map((day) => day.seoPages) },
    {
      title: "Показы в поиске",
      color: SERIES[3],
      values: payload.days.map((day) => day.impressions),
      overlay: payload.days.map((day) => day.clicks),
      overlayLabel: "тёмное — клики",
    },
  ];
  const at = new Date(payload.at).toLocaleString("ru-RU", { timeZone: "Europe/Moscow", dateStyle: "short", timeStyle: "short" });
  return (
    <div style={{ display: "flex", flexDirection: "column", width: TREND_CHART_WIDTH, height: TREND_CHART_HEIGHT, backgroundColor: "#ffffff", padding: "20px 24px", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <span style={{ fontSize: 28, fontWeight: 800, color: INK }}>Тренд контура SMM и SEO · 14 дней</span>
        <span style={{ fontSize: 16, color: MUTED }}>{`${at} МСК`}</span>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", marginTop: 6 }}>
        {panels.map((panel) => <PanelView key={panel.title} panel={panel} days={days} />)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 10, paddingLeft: 16 }}>
        <span style={{ fontSize: 16, color: MUTED, marginBottom: 2 }}>Неделя к неделе</span>
        <div style={{ display: "flex", flexWrap: "wrap", columnGap: 40, rowGap: 4 }}>
          {payload.weeks.map((delta) => <DeltaRow key={delta.label} delta={delta} />)}
        </div>
      </div>
    </div>
  );
}
