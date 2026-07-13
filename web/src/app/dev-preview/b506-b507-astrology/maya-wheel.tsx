import Image from "next/image";
import type { ChartPlacement, NatalWheel, SynastryWheel } from "@/lib/esoteric-chart";
import {
  astrologyAspectStroke,
  calculateNatalAspectLines,
  calculateSynastryAspectLines,
} from "@/lib/astrology-aspects";
import type { MayaAssetSet } from "./maya-assets";

const CX = 570;
const CY = 570;

function point(angle: number, radius: number) {
  const radians = (angle * Math.PI) / 180;
  return { x: CX + radius * Math.cos(radians), y: CY - radius * Math.sin(radians) };
}

type PlacementLayout = {
  marker: { x: number; y: number };
  degree: { x: number; y: number };
};

function placementLayout(placements: ChartPlacement[], radius: number) {
  const sorted = [...placements].sort((a, b) => a.angle - b.angle);
  let previous = -100;
  let lane = 0;
  return new Map<string, PlacementLayout>(sorted.map((item) => {
    lane = item.angle - previous < 8 ? lane + 1 : 0;
    previous = item.angle;
    const markerRadius = Math.max(radius - lane * 34, radius - 102);
    return [item.luminary, {
      marker: point(item.angle, markerRadius),
      degree: point(item.angle, radius + 31),
    }];
  }));
}

function Houses({ houses, ascendant = 105 }: { houses?: NatalWheel["houses"]; ascendant?: number }) {
  const cusps = houses?.length === 12 ? houses.map((house) => house.cusp) : Array.from({ length: 12 }, (_, index) => ascendant + index * 30);
  return (
    <g>
      {cusps.map((angle, index) => {
        const edge = point(angle, 430);
        const label = point(angle + 15, 395);
        return (
          <g key={index}>
            <line x1={CX} y1={CY} x2={edge.x} y2={edge.y} stroke="#263342" strokeWidth={index % 3 === 0 ? 2.8 : 1.2} opacity="0.68" />
            <text x={label.x} y={label.y} textAnchor="middle" dominantBaseline="central" fontSize="17" fontFamily="Georgia,serif" fill="#263342">
              {index + 1}
            </text>
          </g>
        );
      })}
    </g>
  );
}

function PlanetLayer({
  placements,
  icons,
  layout,
  labelColor,
  highlighted = [],
}: {
  placements: ChartPlacement[];
  icons: Record<string, string>;
  layout: Map<string, PlacementLayout>;
  labelColor: string;
  highlighted?: string[];
}) {
  return (
    <g>
      {placements.map((item) => {
        const coordinates = layout.get(item.luminary);
        if (!coordinates) return null;
        const { marker, degree } = coordinates;
        return (
          <g key={item.luminary}>
            <line x1={point(item.angle, 430).x} y1={point(item.angle, 430).y} x2={marker.x} y2={marker.y} stroke={labelColor} strokeWidth="1.4" opacity="0.45" />
            <circle cx={marker.x} cy={marker.y} r="24" fill={highlighted.includes(item.luminary) ? "#FFF0C9" : "#FFFDF7"} stroke={labelColor} strokeWidth={highlighted.includes(item.luminary) ? "4" : "1.8"} />
            <image href={icons[item.luminary]} x={marker.x - 14} y={marker.y - 14} width="28" height="28" />
            <text x={degree.x} y={degree.y} textAnchor="middle" dominantBaseline="central" fontSize="15" fontWeight="700" fill={labelColor}>
              {Math.floor(item.degreeInSign)}°
            </text>
          </g>
        );
      })}
    </g>
  );
}

function WheelBase({ base, children, ariaLabel }: { base: string; children: React.ReactNode; ariaLabel: string }) {
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[640px] overflow-hidden rounded-full bg-[#fffdf7] shadow-[0_24px_70px_rgba(54,39,29,0.14)]" role="img" aria-label={ariaLabel}>
      <Image src={base} alt="" fill unoptimized sizes="(max-width: 768px) 94vw, 640px" className="object-contain" />
      <svg viewBox="0 0 1140 1140" className="absolute inset-0 size-full" aria-hidden="true">
        {children}
      </svg>
    </div>
  );
}

export function MayaNatalWheel({ wheel, assets, highlighted = [] }: { wheel: NatalWheel; assets: MayaAssetSet; highlighted?: string[] }) {
  const layout = placementLayout(wheel.placements, 360);
  return (
    <WheelBase base={assets.base} ariaLabel={`Натальная карта: Солнце в ${wheel.sunSign.name}, Асцендент ${wheel.ascendant?.name ?? "не указан"}`}>
      <Houses houses={wheel.houses} ascendant={wheel.ascendantDegree ?? undefined} />
      <g>
        {calculateNatalAspectLines(wheel.placements).map(({ from, to, aspect }) => {
          const a = layout.get(from.luminary)?.marker;
          const b = layout.get(to.luminary)?.marker;
          if (!a || !b) return null;
          const stroke = astrologyAspectStroke(aspect);
          return (
            <line
              key={`${from.luminary}-${to.luminary}-${aspect.kind}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              stroke={aspect.color}
              strokeWidth={stroke.width * 1.5}
              strokeDasharray={aspect.dash}
              opacity={stroke.opacity}
              strokeLinecap="round"
            >
              <title>{`${from.label} — ${to.label}: ${aspect.label}, орбис ${aspect.orb.toFixed(1)}°`}</title>
            </line>
          );
        })}
      </g>
      <PlanetLayer placements={wheel.placements} icons={assets.natalIcons} layout={layout} labelColor="#263342" highlighted={highlighted} />
    </WheelBase>
  );
}

export function MayaSynastryWheel({ wheel, assets }: { wheel: SynastryWheel; assets: MayaAssetSet }) {
  const layoutA = placementLayout(wheel.a.placements, 365);
  const layoutB = placementLayout(wheel.b.placements, 285);
  return (
    <WheelBase base={assets.base} ariaLabel={`Синастрия: ${wheel.a.sunSign.name} и ${wheel.b.sunSign.name}`}>
      <g>
        {calculateSynastryAspectLines(wheel.a.placements, wheel.b.placements).map(({ from, to, aspect }) => {
          const fromPoint = layoutA.get(from.luminary)?.marker;
          const toPoint = layoutB.get(to.luminary)?.marker;
          if (!fromPoint || !toPoint) return null;
          const stroke = astrologyAspectStroke(aspect);
          return (
            <line
              key={`${from.luminary}-${to.luminary}-${aspect.kind}`}
              x1={fromPoint.x}
              y1={fromPoint.y}
              x2={toPoint.x}
              y2={toPoint.y}
              stroke={aspect.color}
              strokeWidth={stroke.width * 1.5}
              strokeDasharray={aspect.dash}
              opacity={stroke.opacity}
              strokeLinecap="round"
            >
              <title>{`${from.label} — ${to.label}: ${aspect.label}, орбис ${aspect.orb.toFixed(1)}°`}</title>
            </line>
          );
        })}
      </g>
      <PlanetLayer placements={wheel.a.placements} icons={assets.natalIcons} layout={layoutA} labelColor="#263342" />
      <PlanetLayer placements={wheel.b.placements} icons={assets.partnerIcons} layout={layoutB} labelColor="#C84435" />
    </WheelBase>
  );
}
