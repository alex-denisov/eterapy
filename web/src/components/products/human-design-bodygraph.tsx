// B387 (M26) — динамический бодиграф «Дизайна человека». Чистый презентационный
// SVG: рисуется ИЗ рассчитанного чарта (определённые центры окрашены, определённые
// каналы выделены) — то есть картинка отражает реальный результат, а не шаблон.
// Работает и на странице услуги, и в печатной (PDF) версии.

import { HD_BODIES, HD_CENTERS, HD_CHANNELS, HD_GATE_TO_CENTER, type HDCenterKey, type HumanDesignChart } from "@/lib/human-design-data";

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

function gateChannelKey(a: number, b: number): string {
  return [a, b].sort((left, right) => left - right).join("-");
}

function polar(cx: number, cy: number, r: number, angleDeg: number): Pt {
  const angle = (angleDeg / 360) * Math.PI * 2;
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

const CENTER_GATE_RADIUS: Record<HDCenterKey, number> = {
  head: 36,
  ajna: 40,
  throat: 38,
  g: 44,
  heart: 34,
  spleen: 44,
  solar: 44,
  sacral: 40,
  root: 42,
};

function gatePoint(gate: number): Pt {
  const center = HD_GATE_TO_CENTER[gate];
  const gates = HD_CENTERS[center].gates;
  const idx = Math.max(0, gates.indexOf(gate));
  const denom = Math.max(1, gates.length - 1);
  const startByCenter: Record<HDCenterKey, number> = {
    head: -62,
    ajna: 242,
    throat: 212,
    g: -145,
    heart: 238,
    spleen: -36,
    solar: -144,
    sacral: 206,
    root: -154,
  };
  const spanByCenter: Record<HDCenterKey, number> = {
    head: 124,
    ajna: 236,
    throat: 296,
    g: 290,
    heart: 112,
    spleen: 152,
    solar: 152,
    sacral: 294,
    root: 308,
  };
  return polar(CENTROID[center].x, CENTROID[center].y, CENTER_GATE_RADIUS[center], startByCenter[center] + (spanByCenter[center] * idx) / denom);
}

const BODY_LABEL = new Map(HD_BODIES.map((body) => [body.key, body.glyph]));

function ActivationList({ title, items }: { title: string; items: HumanDesignChart["personality"] }) {
  return (
    <div className="rounded-[12px] bg-[var(--soft-paper-deep)] px-3 py-2">
      <p className="soft-eyebrow text-[0.58rem]">{title}</p>
      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] leading-snug text-[var(--soft-ink-soft)]">
        {items.slice(0, 8).map((item) => (
          <span key={`${title}-${item.body}-${item.gate}-${item.line}`} title={item.label}>
            {BODY_LABEL.get(item.body) ?? item.glyph} {item.gate}.{item.line}
          </span>
        ))}
      </div>
    </div>
  );
}

export function HumanDesignBodygraph({ chart }: { chart: HumanDesignChart }) {
  const definedCenters = new Set(chart.definedCenters);
  const activeGates = new Set(chart.activeGates);
  const definedGateChannels = new Set(chart.definedChannels.map((c) => gateChannelKey(c.gates[0], c.gates[1])));
  const allChannelGates = Array.from(new Set(HD_CHANNELS.flatMap(([a, b]) => [a, b]))).sort((left, right) => left - right);

  return (
    <figure className="hd-bodygraph" data-testid="hd-bodygraph">
      <svg viewBox="0 0 420 540" role="img" aria-label={`Бодиграф: тип ${chart.typeName}, ${definedCenters.size} из 9 центров определены`} className="mx-auto block w-full max-w-[360px]">
        <g transform="translate(60 18)">
          <path
            d="M150 8 C108 24 92 70 102 118 C72 143 61 196 81 242 C37 285 21 354 50 420 C72 468 108 488 150 488 C192 488 228 468 250 420 C279 354 263 285 219 242 C239 196 228 143 198 118 C208 70 192 24 150 8Z"
            fill="rgba(246, 236, 217, 0.58)"
            stroke="var(--soft-paper-edge, #d9cdb8)"
            strokeWidth="1.2"
          />

          {/* Все 36 каналов: бледный контур, висячие ворота и полностью определённые каналы. */}
          {HD_CHANNELS.map(([aGate, bGate]) => {
            const pa = gatePoint(aGate);
            const pb = gatePoint(bGate);
            const defined = definedGateChannels.has(gateChannelKey(aGate, bGate));
            const hanging = activeGates.has(aGate) || activeGates.has(bGate);
            return (
              <line
                key={`ch-${aGate}-${bGate}`}
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={defined ? "var(--soft-bordeaux, #7a1f3d)" : hanging ? "var(--soft-terracotta-dark, #b5623f)" : "var(--soft-paper-edge, #e7dccb)"}
                strokeWidth={defined ? 4.2 : hanging ? 2.4 : 1.15}
                strokeLinecap="round"
                strokeDasharray={defined ? undefined : hanging ? "7 5" : undefined}
                opacity={defined ? 0.92 : hanging ? 0.78 : 0.62}
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
            const textFill = center.defined ? "#fff8f1" : "var(--soft-muted, #7a7068)";
            const stroke = center.defined ? "var(--soft-bordeaux, #7a1f3d)" : "var(--soft-paper-edge, #d9cdb8)";
            const centroid = CENTROID[center.key];
            return (
              <g key={center.key} data-defined={center.defined}>
                {shape.kind === "rect" ? (
                  <rect x={shape.x} y={shape.y} width={shape.w} height={shape.h} rx={6} fill={fill} stroke={stroke} strokeWidth={1.7} />
                ) : (
                  <polygon points={shape.pts} fill={fill} stroke={stroke} strokeWidth={1.7} strokeLinejoin="round" />
                )}
                <text x={centroid.x} y={centroid.y} textAnchor="middle" dominantBaseline="central" fontSize="8.5" fontWeight={center.defined ? 700 : 500} fill={textFill}>
                  {SHORT_LABEL[center.key]}
                </text>
              </g>
            );
          })}

          {/* Номера ворот: активные ворота читаются сразу, остальные дают каноничную сетку. */}
          {allChannelGates.map((gate) => {
            const p = gatePoint(gate);
            const active = activeGates.has(gate);
            return (
              <g key={`gate-${gate}`}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={active ? 6.6 : 5.1}
                  fill={active ? "var(--soft-bordeaux, #7a1f3d)" : "var(--soft-paper-card, #fbf5ea)"}
                  stroke={active ? "var(--soft-bordeaux, #7a1f3d)" : "var(--soft-paper-edge, #d9cdb8)"}
                  strokeWidth={1}
                />
                <text x={p.x} y={p.y + 0.4} textAnchor="middle" dominantBaseline="central" fontSize={gate > 9 ? "5.3" : "6.1"} fontWeight={active ? 700 : 500} fill={active ? "#fff8f1" : "var(--soft-muted, #7a7068)"}>
                  {gate}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
      <figcaption className="mt-3 text-center text-xs text-[var(--soft-muted,#7a7068)]">
        {chart.typeName} · {chart.definition.toLowerCase()} · закрашены {definedCenters.size} из 9 центров · показаны ворота и 36 каналов
      </figcaption>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" data-testid="hd-activation-table">
        <ActivationList title="личность" items={chart.personality} />
        <ActivationList title="дизайн" items={chart.design} />
      </div>
    </figure>
  );
}
