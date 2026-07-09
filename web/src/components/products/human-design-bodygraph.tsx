// B501 — бодиграф «Дизайна человека» в bodygraph.com-style геометрии.
// Центральный SVG хранится как локальный утверждённый шаблон; перед рендером
// он перекрашивается по рассчитанному chart, поэтому визуал не расходится с
// типом, каналами, центрами и воротами результата.

import { HD_GATE_ARC, HD_LINE_ARC, HD_START_DEGREE, type HDBodyKey, type HDCenterKey, type HDActivation, type HumanDesignChart } from "@/lib/human-design-data";
import { HUMAN_DESIGN_BODYGRAPH_TEMPLATE } from "@/components/products/human-design-bodygraph-template";

/* eslint-disable @next/next/no-img-element */

const DESIGN_COLOR = "#E69138";
const PERSONALITY_COLOR = "#5D5448";

const CENTER_ID: Record<HDCenterKey, string> = {
  head: "head-center",
  ajna: "ajna-center",
  throat: "throat-center",
  g: "g-center",
  heart: "heart-center",
  spleen: "splenic-center",
  solar: "solar-plexus-center",
  sacral: "sacral-center",
  root: "root-center",
};

const CENTER_FILL: Record<HDCenterKey, string> = {
  head: "#F1D566",
  ajna: "#BFD39E",
  throat: "#E5CFB5",
  g: "#E7BA72",
  heart: "#9F6261",
  spleen: "#B69470",
  solar: "#E5CFB5",
  sacral: "#D6523F",
  root: "#C9A06F",
};

const BODY_ORDER: HDBodyKey[] = [
  "sun",
  "earth",
  "north_node",
  "south_node",
  "moon",
  "mercury",
  "venus",
  "mars",
  "jupiter",
  "saturn",
  "uranus",
  "neptune",
  "pluto",
];

const BODY_ICON_FILE: Record<HDBodyKey, number> = {
  sun: 1,
  earth: 2,
  north_node: 3,
  south_node: 4,
  moon: 5,
  mercury: 7,
  venus: 8,
  mars: 9,
  jupiter: 11,
  saturn: 12,
  uranus: 13,
  neptune: 14,
  pluto: 15,
};

const BODY_LABEL: Record<HDBodyKey, string> = {
  sun: "Солнце",
  earth: "Земля",
  north_node: "Северный узел",
  south_node: "Южный узел",
  moon: "Луна",
  mercury: "Меркурий",
  venus: "Венера",
  mars: "Марс",
  jupiter: "Юпитер",
  saturn: "Сатурн",
  uranus: "Уран",
  neptune: "Нептун",
  pluto: "Плутон",
};

function norm360(value: number): number {
  return ((value % 360) + 360) % 360;
}

function activationValue(activation: HDActivation): string {
  return `${activation.gate}.${activation.line}`;
}

function activationByBody(items: HDActivation[]): Map<HDBodyKey, HDActivation> {
  return new Map(items.map((item) => [item.body, item]));
}

function cssAttrSelector(id: string): string {
  return `[id="${id}"]`;
}

function gateSelectors(gate: number): string {
  return `${cssAttrSelector(String(gate))},${cssAttrSelector(String(gate))} + text,${cssAttrSelector(String(gate))} + text *`;
}

function substructure(activation: HDActivation | null | undefined): { color: number; tone: number } {
  if (!activation) return { color: 1, tone: 1 };
  const offset = norm360(activation.longitude - HD_START_DEGREE);
  const gateWithin = offset % HD_GATE_ARC;
  const lineWithin = gateWithin % HD_LINE_ARC;
  const colorArc = HD_LINE_ARC / 6;
  const color = Math.min(6, Math.max(1, Math.floor(lineWithin / colorArc) + 1));
  const colorWithin = lineWithin % colorArc;
  const toneArc = colorArc / 6;
  const tone = Math.min(6, Math.max(1, Math.floor(colorWithin / toneArc) + 1));
  return { color, tone };
}

function styleForChart(chart: HumanDesignChart): string {
  const personalityGates = new Set(chart.personality.map((item) => item.gate));
  const designGates = new Set(chart.design.map((item) => item.gate));
  const activeGates = new Set([...personalityGates, ...designGates]);
  const definedCenters = new Set(chart.definedCenters);

  const allGates = Array.from({ length: 64 }, (_, index) => index + 1);
  const gateResetRules = allGates.map((gate) => `${gateSelectors(gate)}{fill:#000!important;}`);
  const gateTextResetRules = allGates.map((gate) => `${cssAttrSelector(String(gate))}{fill:#fff!important;}${cssAttrSelector(String(gate))} + text,${cssAttrSelector(String(gate))} + text *{fill:#000!important;}`);
  const activeGateRules = [...activeGates].map((gate) => `${cssAttrSelector(String(gate))}{fill:#000!important;}${cssAttrSelector(String(gate))} + text,${cssAttrSelector(String(gate))} + text *{fill:#fff!important;}`);

  const designRules = [...designGates].map((gate) => `${cssAttrSelector(`design-${gate}`)},${cssAttrSelector(`design-${gate}-bg`)}{stroke:${DESIGN_COLOR}!important;}`);
  const personalityRules = [...personalityGates].map((gate) => `${cssAttrSelector(`personality-${gate}`)},${cssAttrSelector(`personality-${gate}-bg`)}{stroke:${PERSONALITY_COLOR}!important;}`);
  const centerRules = chart.centers.map((center) => {
    const fill = definedCenters.has(center.key) ? CENTER_FILL[center.key] : "#FFFFFF";
    return `${cssAttrSelector(CENTER_ID[center.key])}{fill:${fill}!important;}`;
  });

  return [
    "<style>",
    "#BodyGraphChart-Rounded [id^=\"personality-\"],#BodyGraphChart-Rounded [id^=\"design-\"]{stroke:#FFFFFF!important;}",
    Object.values(CENTER_ID).map((id) => `${cssAttrSelector(id)}{fill:#FFFFFF!important;}`).join(""),
    gateResetRules.join(""),
    gateTextResetRules.join(""),
    centerRules.join(""),
    designRules.join(""),
    personalityRules.join(""),
    activeGateRules.join(""),
    "</style>",
  ].join("");
}

function renderChartSvg(chart: HumanDesignChart): string {
  return HUMAN_DESIGN_BODYGRAPH_TEMPLATE.replace("</defs>", `${styleForChart(chart)}</defs>`);
}

function ActivationColumn({ title, side, items }: { title: string; side: "design" | "personality"; items: HDActivation[] }) {
  const byBody = activationByBody(items);
  return (
    <div className={`hd-bodygraph-col hd-bodygraph-col-${side}`}>
      <div className="hd-bodygraph-col-label">{title}</div>
      {BODY_ORDER.map((body) => {
        const item = byBody.get(body);
        if (!item) return null;
        return (
          <div key={`${side}-${body}`} className={`hd-bodygraph-badge hd-bodygraph-badge-${side}`} title={`${BODY_LABEL[body]}: ${activationValue(item)}`}>
            <img className="hd-bodygraph-planet-icon" src={`/bodygraph-com/svgexport-${BODY_ICON_FILE[body]}.svg`} alt="" aria-hidden="true" />
            <span className="hd-bodygraph-gate">{activationValue(item)}</span>
            <span className="hd-bodygraph-fixing" aria-hidden="true" />
          </div>
        );
      })}
    </div>
  );
}

function VariableNumber({ color, tone, side }: { color: number; tone: number; side: "left" | "right" }) {
  return (
    <span className="hd-bodygraph-var-num">
      {side === "right" ? <sub>{tone}</sub> : null}
      {color}
      {side === "left" ? <sub>{tone}</sub> : null}
    </span>
  );
}

function VariableItem({
  activation,
  side,
  arrow,
  reverse = false,
  label,
}: {
  activation: HDActivation | null | undefined;
  side: "left" | "right";
  arrow: 18 | 19 | 20;
  reverse?: boolean;
  label: string;
}) {
  const value = substructure(activation);
  const icon = <img className={reverse ? "hd-bodygraph-var-arrow reverse" : "hd-bodygraph-var-arrow"} src={`/bodygraph-com/svgexport-${arrow}.svg`} alt="" aria-hidden="true" />;
  return (
    <div className="hd-bodygraph-var-item" aria-label={`${label}: цвет ${value.color}, тон ${value.tone}`}>
      {side === "left" ? icon : null}
      <VariableNumber color={value.color} tone={value.tone} side={side} />
      {side === "right" ? icon : null}
    </div>
  );
}

function Variables({ chart }: { chart: HumanDesignChart }) {
  const design = activationByBody(chart.design);
  const personality = activationByBody(chart.personality);
  return (
    <div className="hd-bodygraph-vars" aria-label="Переменные бодиграфа">
      <div className="hd-bodygraph-vars-left">
        <VariableItem label="Питание" side="left" arrow={18} reverse activation={design.get("sun")} />
        <VariableItem label="Среда" side="left" arrow={18} reverse activation={design.get("north_node")} />
      </div>
      <div className="hd-bodygraph-vars-right">
        <VariableItem label="Осознанность" side="right" arrow={19} activation={personality.get("sun")} />
        <VariableItem label="Перспектива" side="right" arrow={20} reverse activation={personality.get("north_node")} />
      </div>
    </div>
  );
}

export function HumanDesignBodygraph({ chart }: { chart: HumanDesignChart }) {
  const chartSvg = renderChartSvg(chart);

  return (
    <figure className="hd-bodygraph" data-testid="hd-bodygraph">
      <div className="hd-bodygraph-card" aria-label={`Бодиграф: тип ${chart.typeName}, профиль ${chart.profile}`}>
        <div className="hd-bodygraph-grid">
          <ActivationColumn title="Дизайн" side="design" items={chart.design} />
          <div className="hd-bodygraph-svg-col">
            <Variables chart={chart} />
            <div className="hd-bodygraph-svg" dangerouslySetInnerHTML={{ __html: chartSvg }} />
          </div>
          <ActivationColumn title="Личность" side="personality" items={chart.personality} />
        </div>
      </div>
    </figure>
  );
}
