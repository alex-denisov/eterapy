// B388 — SVG-визуализация эзотерических результатов: колесо натальной карты /
// совместимости и карты Таро. Чистые презентационные компоненты (детерминированные
// данные приходят из lib/esoteric-chart + drawTarotSpread), работают и в печатной
// версии (PDF-маршрут), и на странице услуги.

import { ZODIAC_SIGNS, type NatalWheel, type SynastryWheel, type ChartPlacement } from "@/lib/esoteric-chart";
import type { TarotCard } from "@/lib/symbolic-products";

const TWO_PI = Math.PI * 2;

function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number) {
  // 0° = верх, по часовой стрелке
  const a = (angleDeg / 360) * TWO_PI;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

function PlacementGlyphs({ placements, radius, color }: { placements: ChartPlacement[]; radius: number; color: string }) {
  return (
    <>
      {placements.map((p, i) => {
        const { x, y } = pointOnCircle(180, 180, radius, p.angle);
        return (
          <text
            key={`${p.luminary}-${i}`}
            x={x}
            y={y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="13"
            fill={color}
          >
            {p.glyph}
          </text>
        );
      })}
    </>
  );
}

function ZodiacRing({ innerR, outerR }: { innerR: number; outerR: number }) {
  const labelR = (innerR + outerR) / 2;
  return (
    <g>
      <circle cx={180} cy={180} r={outerR} fill="none" stroke="var(--soft-paper-edge, #e7dccb)" strokeWidth={1.2} />
      <circle cx={180} cy={180} r={innerR} fill="none" stroke="var(--soft-paper-edge, #e7dccb)" strokeWidth={1} />
      {ZODIAC_SIGNS.map((sign, i) => {
        const sectorStart = i * 30;
        const edge = pointOnCircle(180, 180, outerR, sectorStart);
        const innerEdge = pointOnCircle(180, 180, innerR, sectorStart);
        const label = pointOnCircle(180, 180, labelR, sectorStart + 15);
        return (
          <g key={sign.key}>
            <line x1={innerEdge.x} y1={innerEdge.y} x2={edge.x} y2={edge.y} stroke="var(--soft-paper-edge, #e7dccb)" strokeWidth={0.8} />
            <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central" fontSize="14" fill="var(--soft-terracotta-dark, #b5623f)">
              {sign.glyph}
            </text>
          </g>
        );
      })}
    </g>
  );
}

export function ZodiacWheel({ wheel }: { wheel: NatalWheel }) {
  return (
    <figure className="esoteric-wheel" data-testid="natal-wheel">
      <svg viewBox="0 0 360 360" role="img" aria-label={`Колесо карты: Солнце в знаке ${wheel.sunSign.name}`} className="mx-auto block w-full max-w-[320px]">
        <ZodiacRing innerR={108} outerR={158} />
        <circle cx={180} cy={180} r={88} fill="none" stroke="var(--soft-paper-edge, #e7dccb)" strokeWidth={0.8} strokeDasharray="2 4" />
        <PlacementGlyphs placements={wheel.placements} radius={88} color="var(--soft-ink, #2d2a26)" />
        <text x={180} y={172} textAnchor="middle" fontSize="26" fill="var(--soft-terracotta-dark, #b5623f)">
          {wheel.sunSign.glyph}
        </text>
        <text x={180} y={196} textAnchor="middle" fontSize="11" fill="var(--soft-ink, #2d2a26)">
          {wheel.sunSign.name}
        </text>
      </svg>
      <figcaption className="mt-2 text-center text-xs text-[var(--soft-muted,#7a7068)]">
        Солнце в знаке {wheel.sunSign.name} · асцендент {wheel.ascendant.name} · структура тем, не прогноз
      </figcaption>
    </figure>
  );
}

export function SynastryWheel({ wheel }: { wheel: SynastryWheel }) {
  return (
    <figure className="esoteric-wheel" data-testid="synastry-wheel">
      <svg viewBox="0 0 360 360" role="img" aria-label={`Колесо совместимости: ${wheel.a.sunSign.name} и ${wheel.b.sunSign.name}`} className="mx-auto block w-full max-w-[320px]">
        <ZodiacRing innerR={120} outerR={158} />
        {wheel.aspects.map((aspect, i) => {
          const from = pointOnCircle(180, 180, 96, aspect.from);
          const to = pointOnCircle(180, 180, 96, aspect.to);
          return (
            <line
              key={i}
              x1={from.x}
              y1={from.y}
              x2={to.x}
              y2={to.y}
              stroke={aspect.harmony === "flow" ? "var(--soft-sage, #7d9b7a)" : "var(--soft-terracotta-dark, #b5623f)"}
              strokeWidth={1.1}
              strokeDasharray={aspect.harmony === "tension" ? "3 3" : undefined}
            />
          );
        })}
        <PlacementGlyphs placements={wheel.a.placements} radius={104} color="var(--soft-terracotta-dark, #b5623f)" />
        <PlacementGlyphs placements={wheel.b.placements} radius={80} color="var(--soft-ink, #2d2a26)" />
        <text x={180} y={184} textAnchor="middle" fontSize="13" fill="var(--soft-muted,#7a7068)">
          {wheel.a.sunSign.glyph} · {wheel.b.sunSign.glyph}
        </text>
      </svg>
      <figcaption className="mt-2 text-center text-xs text-[var(--soft-muted,#7a7068)]">
        {wheel.a.sunSign.name} + {wheel.b.sunSign.name} · сплошные линии — где течёт, пунктир — где трение
      </figcaption>
    </figure>
  );
}

function TarotCardFace({ card }: { card: TarotCard }) {
  const glyph = card.glyph ?? (card.arcana === "major" ? "A" : "M");
  const titleParts = card.name.split(" ");
  const titleTop = titleParts.slice(0, -1).join(" ") || card.name;
  const titleBottom = titleParts.length > 1 ? titleParts[titleParts.length - 1] : "";
  return (
    <div className="flex flex-col items-center" data-testid="tarot-card">
      <svg viewBox="0 0 120 180" className="tarot-card-face-svg w-full max-w-[120px]" role="img" aria-label={`${card.position}: ${card.name}${card.reversed ? ", перевёрнутая" : ""}`}>
        <rect x={3} y={3} width={114} height={174} rx={10} fill="#4A3E5E" stroke="#D6B779" strokeWidth={1.4} />
        <rect x={9} y={9} width={102} height={162} rx={7} fill="#5B4D72" stroke="#F1DFB9" strokeWidth={0.75} opacity={0.74} />
        <g transform={card.reversed ? "rotate(180 60 90)" : undefined}>
          <text x={60} y={34} textAnchor="middle" fontSize="13" fill="#F1DFB9" letterSpacing="0">
            {card.arcana === "major" ? "СТАРШИЙ АРКАН" : card.suit?.toUpperCase()}
          </text>
          <text x={60} y={93} textAnchor="middle" dominantBaseline="central" fontSize={card.arcana === "major" ? "34" : "42"} fill="#F7EFE5">
            {glyph}
          </text>
          <path d="M30 118 C42 111, 78 111, 90 118" fill="none" stroke="#F1DFB9" strokeWidth="0.9" opacity="0.7" />
        </g>
        <text x={60} y={144} textAnchor="middle" fontSize="9.5" fill="#F7EFE5">
          {titleTop}
        </text>
        {titleBottom && <text x={60} y={157} textAnchor="middle" fontSize="9.5" fill="#F7EFE5">{titleBottom}</text>}
      </svg>
      <p className="mt-1 text-[10px] uppercase tracking-widest text-[var(--soft-muted,#7a7068)]">{card.position}</p>
      {card.reversed && <p className="text-[10px] text-[var(--soft-muted,#7a7068)]">перевёрнутая</p>}
    </div>
  );
}

export function TarotSpreadCards({ cards }: { cards: TarotCard[] }) {
  const count = Math.min(cards.length, 10);
  return (
    <div
      className="tarot-spread-grid mt-3 grid gap-3"
      data-card-count={count}
      data-testid="tarot-spread"
    >
      {cards.map((card) => (
        <TarotCardFace key={card.position} card={card} />
      ))}
    </div>
  );
}
