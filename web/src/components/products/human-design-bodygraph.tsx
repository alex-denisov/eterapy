// B387 (M26) — динамический бодиграф «Дизайна человека». Чистый презентационный
// SVG: рисуется ИЗ рассчитанного чарта (определённые центры окрашены, определённые
// каналы выделены) — то есть картинка отражает реальный результат, а не шаблон.
// Работает и на странице услуги, и в печатной (PDF) версии.

import { HD_CHANNELS, HD_GATE_TO_CENTER, type HDCenterKey, type HumanDesignChart } from "@/lib/human-design-data";

type Pt = { x: number; y: number };

// Центроиды 9 центров на каноничной вертикальной компоновке бодиграфа.
const CENTROID: Record<HDCenterKey, Pt> = {
  head: { x: 150, y: 50 },
  ajna: { x: 150, y: 112 },
  throat: { x: 150, y: 172 },
  g: { x: 150, y: 250 },
  heart: { x: 214, y: 256 },
  spleen: { x: 60, y: 330 },
  solar: { x: 240, y: 330 },
  sacral: { x: 150, y: 344 },
  root: { x: 150, y: 452 },
};

// Геометрия фигур каждого центра (полигон или прямоугольник).
const SHAPES: Record<HDCenterKey, { kind: "poly"; pts: string } | { kind: "rect"; x: number; y: number; w: number; h: number }> = {
  head: { kind: "poly", pts: "150,20 120,74 180,74" },
  ajna: { kind: "poly", pts: "150,150 120,90 180,90" },
  throat: { kind: "rect", x: 126, y: 150, w: 48, h: 44 },
  g: { kind: "poly", pts: "150,218 182,250 150,282 118,250" },
  heart: { kind: "poly", pts: "232,238 232,274 196,256" },
  spleen: { kind: "poly", pts: "40,300 40,360 88,330" },
  solar: { kind: "poly", pts: "260,300 260,360 212,330" },
  sacral: { kind: "rect", x: 126, y: 320, w: 48, h: 46 },
  root: { kind: "rect", x: 126, y: 430, w: 48, h: 46 },
};

const SHORT_LABEL: Record<HDCenterKey, string> = {
  head: "Голова",
  ajna: "Аджна",
  throat: "Горло",
  g: "Самость",
  heart: "Воля",
  spleen: "Селезёнка",
  solar: "Эмоции",
  sacral: "Сакрал",
  root: "Корень",
};

function channelKey(a: HDCenterKey, b: HDCenterKey): string {
  return [a, b].sort().join("-");
}

export function HumanDesignBodygraph({ chart }: { chart: HumanDesignChart }) {
  const definedCenters = new Set(chart.definedCenters);
  const definedPairs = new Set(chart.definedChannels.map((c) => channelKey(c.centers[0], c.centers[1])));

  // Скелет: уникальные пары центров среди всех 36 каналов (бледные линии).
  const skeleton = new Map<string, [HDCenterKey, HDCenterKey]>();
  for (const [a, b] of HD_CHANNELS) {
    const ca = HD_GATE_TO_CENTER[a];
    const cb = HD_GATE_TO_CENTER[b];
    if (ca === cb) continue;
    skeleton.set(channelKey(ca, cb), [ca, cb]);
  }

  return (
    <figure className="hd-bodygraph" data-testid="hd-bodygraph">
      <svg viewBox="0 0 300 496" role="img" aria-label={`Бодиграф: тип ${chart.typeName}, ${definedCenters.size} из 9 центров определены`} className="mx-auto block w-full max-w-[300px]">
        {/* Скелет каналов */}
        {[...skeleton.entries()].map(([key, [a, b]]) => {
          const defined = definedPairs.has(key);
          const pa = CENTROID[a];
          const pb = CENTROID[b];
          return (
            <line
              key={`sk-${key}`}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={defined ? "var(--soft-terracotta-dark, #b5623f)" : "var(--soft-paper-edge, #e7dccb)"}
              strokeWidth={defined ? 4 : 1.4}
              strokeLinecap="round"
              opacity={defined ? 0.9 : 0.7}
            />
          );
        })}

        {/* Центры поверх каналов */}
        {chart.centers.map((center) => {
          const shape = SHAPES[center.key];
          const fill = center.defined
            ? center.motor
              ? "var(--soft-terracotta-dark, #b5623f)"
              : "var(--soft-apricot, #e8a87c)"
            : "var(--soft-paper-card, #fbf5ea)";
          const textFill = center.defined ? "#fff" : "var(--soft-muted, #7a7068)";
          const stroke = center.defined ? "var(--soft-terracotta-dark, #b5623f)" : "var(--soft-paper-edge, #d9cdb8)";
          const centroid = CENTROID[center.key];
          return (
            <g key={center.key} data-defined={center.defined}>
              {shape.kind === "rect" ? (
                <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={6} fill={fill} stroke={stroke} strokeWidth={1.6} />
              ) : (
                <polygon points={shape.pts} fill={fill} stroke={stroke} strokeWidth={1.6} strokeLinejoin="round" />
              )}
              <text x={centroid.x} y={centroid.y} textAnchor="middle" dominantBaseline="central" fontSize="8.5" fontWeight={center.defined ? 600 : 400} fill={textFill}>
                {SHORT_LABEL[center.key]}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-3 text-center text-xs text-[var(--soft-muted,#7a7068)]">
        {chart.typeName} · {chart.definition.toLowerCase()} · закрашены {definedCenters.size} из 9 центров
      </figcaption>
    </figure>
  );
}
