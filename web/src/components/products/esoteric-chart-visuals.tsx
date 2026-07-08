// B388 — SVG-визуализация эзотерических результатов: колесо натальной карты /
// совместимости и карты Таро. Чистые презентационные компоненты (детерминированные
// данные приходят из lib/esoteric-chart + drawTarotSpread), работают и в печатной
// версии (PDF-маршрут), и на странице услуги.

import { ZODIAC_SIGNS, type NatalWheel, type SynastryWheel, type ChartPlacement } from "@/lib/esoteric-chart";
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

type AspectKind = "conjunction" | "sextile" | "square" | "trine" | "opposition";

const ASPECTS: Array<{ kind: AspectKind; angle: number; orb: number; color: string; dash?: string }> = [
  { kind: "conjunction", angle: 0, orb: 7, color: "var(--soft-bordeaux, #7a1f3d)" },
  { kind: "sextile", angle: 60, orb: 5, color: "var(--soft-sage, #7d9b7a)" },
  { kind: "square", angle: 90, orb: 6, color: "var(--soft-terracotta-dark, #b5623f)", dash: "4 4" },
  { kind: "trine", angle: 120, orb: 6, color: "var(--soft-sage, #7d9b7a)" },
  { kind: "opposition", angle: 180, orb: 7, color: "var(--soft-bordeaux, #7a1f3d)", dash: "2 4" },
];

function angleDelta(a: number, b: number) {
  const raw = Math.abs((((a - b) % 360) + 360) % 360);
  return raw > 180 ? 360 - raw : raw;
}

function aspectFor(a: number, b: number) {
  const delta = angleDelta(a, b);
  const candidates = ASPECTS
    .map((aspect) => ({ ...aspect, diff: Math.abs(delta - aspect.angle) }))
    .filter((aspect) => aspect.diff <= aspect.orb)
    .sort((left, right) => left.diff - right.diff);
  return candidates[0] ?? null;
}

function natalAspectLines(placements: ChartPlacement[]) {
  const lines: Array<{ a: ChartPlacement; b: ChartPlacement; aspect: NonNullable<ReturnType<typeof aspectFor>> }> = [];
  for (let i = 0; i < placements.length; i += 1) {
    for (let j = i + 1; j < placements.length; j += 1) {
      const aspect = aspectFor(placements[i].angle, placements[j].angle);
      if (aspect) lines.push({ a: placements[i], b: placements[j], aspect });
    }
  }
  return lines.sort((left, right) => left.aspect.diff - right.aspect.diff).slice(0, 22);
}

function synastryAspectLines(a: ChartPlacement[], b: ChartPlacement[]) {
  const lines: Array<{ a: ChartPlacement; b: ChartPlacement; aspect: NonNullable<ReturnType<typeof aspectFor>> }> = [];
  for (const from of a) {
    for (const to of b) {
      const aspect = aspectFor(from.angle, to.angle);
      if (aspect) lines.push({ a: from, b: to, aspect });
    }
  }
  return lines.sort((left, right) => left.aspect.diff - right.aspect.diff).slice(0, 28);
}

function formatDegree(p: ChartPlacement) {
  return `${Math.round(p.degreeInSign).toString().padStart(2, "0")}°${p.signGlyph}`;
}

function PlacementGlyphs({
  placements,
  radius,
  color,
  labelRadius = radius + 18,
  markerFill = "var(--soft-paper-card, #fbf5ea)",
}: {
  placements: ChartPlacement[];
  radius: number;
  color: string;
  labelRadius?: number;
  markerFill?: string;
}) {
  return (
    <>
      {placements.map((p, i) => {
        const { x, y } = pointOnCircle(WHEEL_CX, WHEEL_CY, radius, p.angle);
        const label = pointOnCircle(WHEEL_CX, WHEEL_CY, labelRadius, p.angle);
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

function NatalAspectWeb({ placements, radius }: { placements: ChartPlacement[]; radius: number }) {
  return (
    <g>
      {natalAspectLines(placements).map((line, i) => {
        const from = pointOnCircle(WHEEL_CX, WHEEL_CY, radius, line.a.angle);
        const to = pointOnCircle(WHEEL_CX, WHEEL_CY, radius, line.b.angle);
        return (
          <line
            key={`${line.a.luminary}-${line.b.luminary}-${i}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={line.aspect.color}
            strokeWidth={line.aspect.kind === "conjunction" ? 1.7 : 1}
            strokeDasharray={line.aspect.dash}
            opacity={0.58}
          />
        );
      })}
    </g>
  );
}

function SynastryAspectWeb({ wheel }: { wheel: SynastryWheel }) {
  return (
    <g>
      {synastryAspectLines(wheel.a.placements, wheel.b.placements).map((line, i) => {
        const from = pointOnCircle(WHEEL_CX, WHEEL_CY, 132, line.a.angle);
        const to = pointOnCircle(WHEEL_CX, WHEEL_CY, 104, line.b.angle);
        return (
          <line
            key={`${line.a.luminary}-${line.b.luminary}-${i}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={line.aspect.color}
            strokeWidth={1.05}
            strokeDasharray={line.aspect.dash}
            opacity={0.5}
          />
        );
      })}
    </g>
  );
}

export function ZodiacWheel({ wheel }: { wheel: NatalWheel }) {
  return (
    <figure className="esoteric-wheel" data-testid="natal-wheel">
      <svg viewBox="0 0 420 420" role="img" aria-label={`Колесо карты: Солнце в знаке ${wheel.sunSign.name}`} className="mx-auto block w-full max-w-[390px]">
        <ZodiacRing innerR={154} outerR={198} />
        <HouseLines radius={154} />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={112} fill="none" stroke="var(--soft-paper-edge, #e7dccb)" strokeWidth={0.8} strokeDasharray="2 4" />
        <NatalAspectWeb placements={wheel.placements} radius={112} />
        <PlacementGlyphs placements={wheel.placements} radius={134} color="var(--soft-ink, #2d2a26)" labelRadius={146} />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={48} fill="var(--soft-paper-card, #fbf5ea)" stroke="var(--soft-paper-edge, #e7dccb)" />
        <text x={WHEEL_CX} y={WHEEL_CY - 9} textAnchor="middle" fontSize="27" fill="var(--soft-terracotta-dark, #b5623f)">
          {wheel.sunSign.glyph}
        </text>
        <text x={WHEEL_CX} y={WHEEL_CY + 12} textAnchor="middle" fontSize="10" fill="var(--soft-ink, #2d2a26)">
          {wheel.sunSign.name}
        </text>
        <text x={WHEEL_CX} y={WHEEL_CY + 27} textAnchor="middle" fontSize="8" fill="var(--soft-muted,#7a7068)">
          ASC {wheel.ascendant.glyph} {wheel.ascendant.name}
        </text>
      </svg>
      <figcaption className="mt-2 text-center text-xs text-[var(--soft-muted,#7a7068)]">
        12 домов · 10 планет · аспекты · Солнце в {wheel.sunSign.name} · ASC {wheel.ascendant.name}
      </figcaption>
    </figure>
  );
}

export function SynastryWheel({ wheel }: { wheel: SynastryWheel }) {
  return (
    <figure className="esoteric-wheel" data-testid="synastry-wheel">
      <svg viewBox="0 0 420 420" role="img" aria-label={`Колесо совместимости: ${wheel.a.sunSign.name} и ${wheel.b.sunSign.name}`} className="mx-auto block w-full max-w-[390px]">
        <ZodiacRing innerR={162} outerR={198} />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={145} fill="none" stroke="var(--soft-paper-edge, #d9cdb8)" strokeWidth={1.1} />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={116} fill="none" stroke="var(--soft-paper-edge, #d9cdb8)" strokeWidth={1.1} strokeDasharray="4 4" />
        <HouseLines radius={145} />
        <SynastryAspectWeb wheel={wheel} />
        <PlacementGlyphs placements={wheel.a.placements} radius={136} color="var(--soft-terracotta-dark, #b5623f)" labelRadius={151} markerFill="var(--soft-paper-card, #fbf5ea)" />
        <PlacementGlyphs placements={wheel.b.placements} radius={104} color="var(--soft-ink, #2d2a26)" labelRadius={90} markerFill="var(--soft-paper-deep, #f6ecd9)" />
        <circle cx={WHEEL_CX} cy={WHEEL_CY} r={42} fill="var(--soft-paper-card, #fbf5ea)" stroke="var(--soft-paper-edge, #e7dccb)" />
        <text x={WHEEL_CX} y={WHEEL_CY + 4} textAnchor="middle" fontSize="15" fill="var(--soft-muted,#7a7068)">
          {wheel.a.sunSign.glyph} · {wheel.b.sunSign.glyph}
        </text>
      </svg>
      <figcaption className="mt-2 text-center text-xs text-[var(--soft-muted,#7a7068)]">
        bi-wheel: внешний круг — первый человек, внутренний — второй · зелёные линии ресурс, пунктир/бордо — напряжение
      </figcaption>
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
