// B388 — SVG-визуализация эзотерических результатов: колесо натальной карты /
// совместимости и карты Таро. Чистые презентационные компоненты (детерминированные
// данные приходят из lib/esoteric-chart + drawTarotSpread), работают и в печатной
// версии (PDF-маршрут), и на странице услуги.

import { ZODIAC_SIGNS, type NatalWheel, type SynastryWheel, type ChartPlacement } from "@/lib/esoteric-chart";
import { tarotDeckCardByName, type TarotCard } from "@/lib/tarot-deck";

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
