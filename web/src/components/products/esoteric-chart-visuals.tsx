// B388 — SVG-визуализация эзотерических результатов: колесо натальной карты /
// совместимости и карты Таро. Чистые презентационные компоненты (детерминированные
// данные приходят из lib/esoteric-chart + drawTarotSpread), работают и в печатной
// версии (PDF-маршрут), и на странице услуги.

import { ZODIAC_SIGNS, type NatalWheel, type SynastryWheel, type ChartPlacement } from "@/lib/esoteric-chart";
import {
  astrologyAspectStroke,
  calculateNatalAspectLines,
  calculateSynastryAspectLines,
} from "@/lib/astrology-aspects";
import { tarotDeckCardByName, type TarotCard } from "@/lib/tarot-deck";

const TWO_PI = Math.PI * 2;
const WHEEL_CX = 210;
const WHEEL_CY = 210;

function pointOnCircle(cx: number, cy: number, r: number, angleDeg: number) {
  // 0° = верх, по часовой стрелке
  const a = (angleDeg / 360) * TWO_PI;
  return { x: cx + r * Math.sin(a), y: cy - r * Math.cos(a) };
}

const ELEMENT_FILL: Record<string, string> = {
  "огонь": "rgba(181, 98, 63, 0.12)",
  "земля": "rgba(125, 155, 122, 0.13)",
  "воздух": "rgba(111, 136, 169, 0.13)",
  "вода": "rgba(122, 112, 157, 0.13)",
};

function formatDegree(p: ChartPlacement) {
  return `${Math.round(p.degreeInSign).toString().padStart(2, "0")}°${p.signGlyph}`;
}

type CompactPlacementLayout = Map<string, { marker: { x: number; y: number }; label: { x: number; y: number } }>;

function compactPlacementLayout(placements: ChartPlacement[], radius: number, labelRadius: number): CompactPlacementLayout {
  const sorted = [...placements].sort((a, b) => a.angle - b.angle);
  let previous = -100;
  let lane = 0;
  return new Map(sorted.map((placement) => {
    lane = placement.angle - previous < 8 ? lane + 1 : 0;
    previous = placement.angle;
    const markerRadius = Math.max(radius - lane * 18, radius - 54);
    return [placement.luminary, {
      marker: pointOnCircle(WHEEL_CX, WHEEL_CY, markerRadius, placement.angle),
      label: pointOnCircle(WHEEL_CX, WHEEL_CY, labelRadius, placement.angle),
    }];
  }));
}

function PlacementGlyphs({
  placements,
  radius,
  color,
  labelRadius = radius + 18,
  markerFill = "var(--soft-paper-card, #fbf5ea)",
  layout,
}: {
  placements: ChartPlacement[];
  radius: number;
  color: string;
  labelRadius?: number;
  markerFill?: string;
  layout?: CompactPlacementLayout;
}) {
  return (
    <>
      {placements.map((p, i) => {
        const coordinates = layout?.get(p.luminary);
        const { x, y } = coordinates?.marker ?? pointOnCircle(WHEEL_CX, WHEEL_CY, radius, p.angle);
        const label = coordinates?.label ?? pointOnCircle(WHEEL_CX, WHEEL_CY, labelRadius, p.angle);
        return (
          <g key={`${p.luminary}-${i}`}>
            <circle cx={x} cy={y} r="10" fill={markerFill} stroke={color} strokeWidth="1" />
            <text x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize="13" fill={color}>
              {p.glyph}
            </text>
            <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central" fontSize="7.5" fill="var(--soft-muted,#7a7068)">
              {formatDegree(p)}
            </text>
          </g>
        );
      })}
    </>
  );
}

function ZodiacRing({ innerR, outerR }: { innerR: number; outerR: number }) {
  const labelR = (innerR + outerR) / 2;
  return (
    <g>
      <circle cx={WHEEL_CX} cy={WHEEL_CY} r={outerR} fill="var(--soft-paper-card, #fbf5ea)" stroke="var(--soft-paper-edge, #e7dccb)" strokeWidth={1.2} />
      <circle cx={WHEEL_CX} cy={WHEEL_CY} r={innerR} fill="var(--soft-paper-deep, #f6ecd9)" stroke="var(--soft-paper-edge, #e7dccb)" strokeWidth={1} />
      {ZODIAC_SIGNS.map((sign, i) => {
        const sectorStart = i * 30;
        const edge = pointOnCircle(WHEEL_CX, WHEEL_CY, outerR, sectorStart);
        const innerEdge = pointOnCircle(WHEEL_CX, WHEEL_CY, innerR, sectorStart);
        const label = pointOnCircle(WHEEL_CX, WHEEL_CY, labelR, sectorStart + 15);
        return (
          <g key={sign.key}>
            <path
              d={`M ${innerEdge.x} ${innerEdge.y} L ${edge.x} ${edge.y}`}
              stroke="var(--soft-paper-edge, #e7dccb)"
              strokeWidth={0.8}
            />
            <circle cx={label.x} cy={label.y} r="14" fill={ELEMENT_FILL[sign.element]} />
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

function HouseLines({ radius }: { radius: number }) {
  return (
    <g>
      {Array.from({ length: 12 }, (_, i) => i * 30).map((angle, i) => {
        const edge = pointOnCircle(WHEEL_CX, WHEEL_CY, radius, angle);
        const label = pointOnCircle(WHEEL_CX, WHEEL_CY, radius - 16, angle + 15);
        return (
          <g key={angle}>
            <line x1={WHEEL_CX} y1={WHEEL_CY} x2={edge.x} y2={edge.y} stroke="var(--soft-paper-edge, #d9cdb8)" strokeWidth={i % 3 === 0 ? 1.05 : 0.65} opacity={0.85} />
            <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central" fontSize="7" fill="var(--soft-ink-faint,#9a8f83)">
              {i + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function NatalAspectWeb({ placements, layout }: { placements: ChartPlacement[]; layout: CompactPlacementLayout }) {
  return (
    <g>
      {calculateNatalAspectLines(placements).map((line, i) => {
        const from = layout.get(line.from.luminary)?.marker;
        const to = layout.get(line.to.luminary)?.marker;
        if (!from || !to) return null;
        const stroke = astrologyAspectStroke(line.aspect);
        return (
          <line
            key={`${line.from.luminary}-${line.to.luminary}-${i}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={line.aspect.color}
            strokeWidth={stroke.width}
            strokeDasharray={line.aspect.dash}
            opacity={stroke.opacity}
            strokeLinecap="round"
          >
            <title>{`${line.from.label} — ${line.to.label}: ${line.aspect.label}, орбис ${line.aspect.orb.toFixed(1)}°`}</title>
          </line>
        );
      })}
    </g>
  );
}

function SynastryAspectWeb({ wheel, layoutA, layoutB }: { wheel: SynastryWheel; layoutA: CompactPlacementLayout; layoutB: CompactPlacementLayout }) {
  return (
    <g>
      {calculateSynastryAspectLines(wheel.a.placements, wheel.b.placements).map((line, i) => {
        const from = layoutA.get(line.from.luminary)?.marker;
        const to = layoutB.get(line.to.luminary)?.marker;
        if (!from || !to) return null;
        const stroke = astrologyAspectStroke(line.aspect);
        return (
          <line
            key={`${line.from.luminary}-${line.to.luminary}-${i}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={line.aspect.color}
            strokeWidth={stroke.width}
            strokeDasharray={line.aspect.dash}
            opacity={stroke.opacity}
            strokeLinecap="round"
          >
            <title>{`${line.from.label} — ${line.to.label}: ${line.aspect.label}, орбис ${line.aspect.orb.toFixed(1)}°`}</title>
          </line>
        );
      })}
    </g>
  );
}

export function ZodiacWheel({ wheel }: { wheel: NatalWheel }) {
  const layout = compactPlacementLayout(wheel.placements, 134, 146);
  return (
    <figure className="esoteric-wheel" data-testid="natal-wheel">
      <svg viewBox="0 0 420 420" role="img" aria-label={`Колесо карты: Солнце в знаке ${wheel.sunSign.name}`} className="mx-auto block w-full max-w-[390px]">
        <ZodiacRing innerR={154} outerR={198} />
        <HouseLines radius={154} />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={112} fill="none" stroke="var(--soft-paper-edge, #e7dccb)" strokeWidth={0.8} strokeDasharray="2 4" />
        <NatalAspectWeb placements={wheel.placements} layout={layout} />
        <PlacementGlyphs placements={wheel.placements} radius={134} color="var(--soft-ink, #2d2a26)" labelRadius={146} layout={layout} />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={30} fill="var(--soft-paper-card, #fbf5ea)" fillOpacity="0.84" stroke="var(--soft-paper-edge, #e7dccb)" />
        <text x={WHEEL_CX} y={WHEEL_CY - 9} textAnchor="middle" fontSize="27" fill="var(--soft-terracotta-dark, #b5623f)">
          {wheel.sunSign.glyph}
        </text>
        <text x={WHEEL_CX} y={WHEEL_CY + 12} textAnchor="middle" fontSize="10" fill="var(--soft-ink, #2d2a26)">
          {wheel.sunSign.name}
        </text>
        <text x={WHEEL_CX} y={WHEEL_CY + 27} textAnchor="middle" fontSize="8" fill="var(--soft-muted,#7a7068)">
          {wheel.ascendant ? `ASC ${wheel.ascendant.glyph} ${wheel.ascendant.name}` : "ASC —"}
        </text>
      </svg>
    </figure>
  );
}

export function SynastryWheel({ wheel }: { wheel: SynastryWheel }) {
  const layoutA = compactPlacementLayout(wheel.a.placements, 136, 151);
  const layoutB = compactPlacementLayout(wheel.b.placements, 104, 90);
  return (
    <figure className="esoteric-wheel" data-testid="synastry-wheel">
      <svg viewBox="0 0 420 420" role="img" aria-label={`Колесо совместимости: ${wheel.a.sunSign.name} и ${wheel.b.sunSign.name}`} className="mx-auto block w-full max-w-[390px]">
        <ZodiacRing innerR={162} outerR={198} />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={145} fill="none" stroke="var(--soft-paper-edge, #d9cdb8)" strokeWidth={1.1} />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={116} fill="none" stroke="var(--soft-paper-edge, #d9cdb8)" strokeWidth={1.1} strokeDasharray="4 4" />
        <HouseLines radius={145} />
        <SynastryAspectWeb wheel={wheel} layoutA={layoutA} layoutB={layoutB} />
        <PlacementGlyphs placements={wheel.a.placements} radius={136} color="var(--soft-terracotta-dark, #b5623f)" labelRadius={151} markerFill="var(--soft-paper-card, #fbf5ea)" layout={layoutA} />
        <PlacementGlyphs placements={wheel.b.placements} radius={104} color="var(--soft-ink, #2d2a26)" labelRadius={90} markerFill="var(--soft-paper-deep, #f6ecd9)" layout={layoutB} />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={26} fill="var(--soft-paper-card, #fbf5ea)" fillOpacity="0.84" stroke="var(--soft-paper-edge, #e7dccb)" />
        <text x={WHEEL_CX} y={WHEEL_CY + 4} textAnchor="middle" fontSize="15" fill="var(--soft-muted,#7a7068)">
          {wheel.a.sunSign.glyph} · {wheel.b.sunSign.glyph}
        </text>
      </svg>
    </figure>
  );
}

const TAROT_MINOR_SUIT_FOLDER: Record<string, string> = {
  "Ж": "wands",
  "К": "cups",
  "М": "swords",
  "П": "pents",
};

// B437-fix (2026-06-19): настоящие карты Райдера—Уэйта—Смит (оригинальные сканы
// 1909 года, общественное достояние) вместо рисованного SVG, который выглядел
// как заливка из старого редактора. Путь карты детерминирован по её коду из
// колоды (lib/symbolic-products): старшие арканы — /tarot/major-NN.jpg, младшие —
// /tarot/<масть>-NN.jpg (01 = Туз … 11 = Паж, 12 = Рыцарь, 13 = Королева,
// 14 = Король). Файлы скачиваются скриптом scripts/fetch-tarot-rws.py.
// Total function — MUST never throw. Legacy stored cards (pre-B437) have no
// `code`/`arcana`; we recover them from the card name via the deck. If the name
// is also unknown, return null and let the caller render a card-back fallback
// instead of crashing the whole page (was: card.code.split on undefined → the
// "This page couldn't load" screen for any user with a legacy расклад).
function tarotCardImageSrc(card: TarotCard): string | null {
  let code = typeof card.code === "string" ? card.code : "";
  let arcana: TarotCard["arcana"] | undefined = card.arcana;
  if (!code) {
    const deck = tarotDeckCardByName(card.name);
    if (deck) {
      code = deck.code;
      arcana = deck.arcana;
    }
  }
  if (!code) return null;
  if (arcana === "major" || code.startsWith("major")) return `/tarot/${code}.jpg`;
  const parts = code.split("-");
  const glyph = parts[1] ?? "";
  const rank = parts[2] ?? "1";
  const suit = TAROT_MINOR_SUIT_FOLDER[glyph] ?? "wands";
  const num = String(Number(rank) || 1).padStart(2, "0");
  return `/tarot/${suit}-${num}.jpg`;
}

function TarotCardFace({ card }: { card: TarotCard }) {
  const src = tarotCardImageSrc(card);
  return (
    <figure className="tarot-card-face" data-testid="tarot-card">
      <div className="tarot-card-photo">
        {src ? (
          <>
            {/* Обычный <img>, а не next/image: тот же компонент рендерится в печатной
                версии (PDF-маршрут /products/print) вне next/image-рантайма. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt={`${card.position}: ${card.name}${card.reversed ? ", перевёрнутая" : ""}`}
              loading="lazy"
              decoding="async"
              className={card.reversed ? "tarot-card-reversed" : undefined}
            />
            {card.reversed && <span className="tarot-card-rev-flag">перевёрнутая</span>}
          </>
        ) : (
          // Неизвестная карта (битые/очень старые данные) — рисуем рубашку
          // вместо падения, имя всё равно показано в подписи ниже.
          <span className="tarot-card-photo-fallback" aria-hidden="true">ET</span>
        )}
      </div>
      <figcaption className="tarot-card-caption">
        <span className="tarot-card-position">{card.position}</span>
        <span className="tarot-card-name">{card.name}</span>
      </figcaption>
    </figure>
  );
}

export function TarotSpreadCards({ cards }: { cards: TarotCard[] }) {
  const count = Math.min(cards.length, 10);
  return (
    <div
      className="tarot-spread mt-3"
      data-card-count={count}
      data-testid="tarot-spread"
    >
      {cards.map((card) => (
        <TarotCardFace key={card.position} card={card} />
      ))}
    </div>
  );
}
