// B387 (M26) — проверка движка «Дизайна человека». Эфемериды сверяются с
// публичным календарём Rave (даты входа Солнца в ворота — это и есть headline-
// значение любого публичного HD-калькулятора), а логика типа — инвариантами графа.

import {
  computeHumanDesign,
  computeHumanDesignFromText,
  gateLineFromLongitude,
  parseHumanDesignBirth,
} from "@/lib/human-design";
import {
  HD_CENTERS,
  HD_CHANNELS,
  HD_GATE_SEQUENCE,
  HD_GATE_TO_CENTER,
} from "@/lib/human-design-data";

const VALID_TYPES = ["manifestor", "generator", "manifesting-generator", "projector", "reflector"];

describe("колесо ворот (Rave-мандала)", () => {
  it("64 уникальных ворот в последовательности", () => {
    expect(HD_GATE_SEQUENCE).toHaveLength(64);
    expect(new Set(HD_GATE_SEQUENCE).size).toBe(64);
    for (const gate of HD_GATE_SEQUENCE) {
      expect(gate).toBeGreaterThanOrEqual(1);
      expect(gate).toBeLessThanOrEqual(64);
    }
  });

  it("якорь: ворота 41 начинаются ровно на 2° Водолея (302°)", () => {
    expect(gateLineFromLongitude(302).gate).toBe(41);
    expect(gateLineFromLongitude(301.9).gate).toBe(60); // прямо перед границей
  });

  it("0° Овна → ворота 25", () => {
    expect(gateLineFromLongitude(0).gate).toBe(25);
  });

  it("линия всегда в диапазоне 1..6", () => {
    for (let lon = 0; lon < 360; lon += 0.31) {
      const { line } = gateLineFromLongitude(lon);
      expect(line).toBeGreaterThanOrEqual(1);
      expect(line).toBeLessThanOrEqual(6);
    }
  });
});

describe("таблицы центров и каналов (каноничные)", () => {
  it("каждое из 64 ворот принадлежит ровно одному центру", () => {
    const all = Object.values(HD_CENTERS).flatMap((c) => c.gates);
    expect(all).toHaveLength(64);
    expect(new Set(all).size).toBe(64);
    for (let gate = 1; gate <= 64; gate += 1) {
      expect(HD_GATE_TO_CENTER[gate]).toBeDefined();
    }
  });

  it("36 каналов, включая восстановленные 10-34 и 10-57", () => {
    expect(HD_CHANNELS).toHaveLength(36);
    const has = (x: number, y: number) =>
      HD_CHANNELS.some(([a, b]) => (a === x && b === y) || (a === y && b === x));
    expect(has(10, 34)).toBe(true);
    expect(has(10, 57)).toBe(true);
    for (const [a, b] of HD_CHANNELS) {
      expect(a).toBeGreaterThanOrEqual(1);
      expect(b).toBeLessThanOrEqual(64);
    }
  });

  it("ворота 28 — только в Селезёнке, не в Корне (частая ошибка таблиц)", () => {
    expect(HD_GATE_TO_CENTER[28]).toBe("spleen");
    expect(HD_CENTERS.root.gates).not.toContain(28);
  });
});

describe("эфемериды: сверка headline-значения (Сознательное Солнце)", () => {
  // Эти даты сверяемы с любым публичным калькулятором по календарю Rave I'Ching.
  it("Солнце входит в ворота 41 около 22–23 января (HD «новый год»)", () => {
    const chart = computeHumanDesign(new Date(Date.UTC(2024, 0, 23, 12, 0, 0)));
    expect(chart.personality.find((a) => a.body === "sun")!.gate).toBe(41);
  });

  it("Сознательное Солнце на весеннее равноденствие — ворота 25", () => {
    const chart = computeHumanDesign(new Date(Date.UTC(2024, 2, 20, 3, 6, 0)));
    expect(chart.personality.find((a) => a.body === "sun")!.gate).toBe(25);
  });

  it("Земля всегда напротив Солнца (≈180°)", () => {
    const chart = computeHumanDesign(new Date(Date.UTC(1990, 4, 15, 7, 30, 0)));
    const sun = chart.personality.find((a) => a.body === "sun")!;
    const earth = chart.personality.find((a) => a.body === "earth")!;
    const diff = (earth.longitude - sun.longitude + 360) % 360;
    expect(Math.abs(diff - 180)).toBeLessThan(0.001);
  });

  it("Дизайн считается ровно на 88° солнечной дуги раньше рождения", () => {
    const chart = computeHumanDesign(new Date(Date.UTC(1990, 4, 15, 7, 30, 0)));
    const pSun = chart.personality.find((a) => a.body === "sun")!.longitude;
    const dSun = chart.design.find((a) => a.body === "sun")!.longitude;
    const arc = ((pSun - dSun + 540) % 360) - 180;
    expect(Math.abs(arc - 88)).toBeLessThan(0.02);
  });
});

describe("тип = связность графа (та самая «хитрость» методики)", () => {
  const dates = [
    new Date(Date.UTC(1988, 7, 3, 14, 15, 0)),
    new Date(Date.UTC(1975, 0, 9, 6, 0, 0)),
    new Date(Date.UTC(1992, 10, 27, 21, 45, 0)),
    new Date(Date.UTC(2001, 5, 14, 3, 30, 0)),
    new Date(Date.UTC(1960, 2, 1, 11, 0, 0)),
  ];

  it("любой чарт даёт ровно один из пяти валидных типов", () => {
    for (const date of dates) {
      expect(VALID_TYPES).toContain(computeHumanDesign(date).type);
    }
  });

  it("тип согласован с определёнными центрами", () => {
    for (const date of dates) {
      const chart = computeHumanDesign(date);
      const defined = new Set(chart.definedCenters);
      if (defined.size === 0) {
        expect(chart.type).toBe("reflector");
      } else if (defined.has("sacral")) {
        expect(["generator", "manifesting-generator"]).toContain(chart.type);
      } else {
        expect(["manifestor", "projector"]).toContain(chart.type);
      }
    }
  });

  it("авторитет согласован с иерархией центров", () => {
    for (const date of dates) {
      const chart = computeHumanDesign(date);
      const defined = new Set(chart.definedCenters);
      if (chart.type === "reflector") expect(chart.authority).toBe("lunar");
      else if (defined.has("solar")) expect(chart.authority).toBe("emotional");
      else if (defined.has("sacral")) expect(chart.authority).toBe("sacral");
    }
  });

  it("каждый определённый канал реально активирует свои ворота", () => {
    const chart = computeHumanDesign(dates[0]);
    const active = new Set(chart.activeGates);
    for (const channel of chart.definedChannels) {
      expect(active.has(channel.gates[0])).toBe(true);
      expect(active.has(channel.gates[1])).toBe(true);
    }
  });

  it("детерминирован: одинаковый ввод → одинаковый чарт", () => {
    const a = computeHumanDesign(dates[0]);
    const b = computeHumanDesign(dates[0]);
    expect(b.type).toBe(a.type);
    expect(b.profile).toBe(a.profile);
    expect(b.profile).toMatch(/^[1-6]\/[1-6]$/);
    expect(b.activeGates).toEqual(a.activeGates);
  });
});

describe("разбор данных рождения (дата + время + пояс)", () => {
  it("парсит точечную дату, время и город", () => {
    const parsed = parseHumanDesignBirth("15.05.1990, 10:30, Москва");
    expect(parsed.utc).not.toBeNull();
    expect(parsed.hasExactTime).toBe(true);
    expect(parsed.offsetHours).toBe(3);
    expect(parsed.utc!.getUTCHours()).toBe(7); // 10:30 МСК = 07:30 UTC
    expect(parsed.utc!.getUTCMinutes()).toBe(30);
  });

  it("явный UTC-сдвиг не путается с дефисами ISO-даты", () => {
    const parsed = parseHumanDesignBirth("1990-05-15 10:30 UTC+5");
    expect(parsed.offsetHours).toBe(5);
    expect(parsed.utc!.getUTCHours()).toBe(5); // 10:30 −5 = 05:30 UTC
  });

  it("без времени → полдень и пометка о неточности", () => {
    const parsed = parseHumanDesignBirth("5 мая 1990");
    expect(parsed.utc).not.toBeNull();
    expect(parsed.hasExactTime).toBe(false);
  });

  it("без года → не считаем", () => {
    expect(parseHumanDesignBirth("какой-то текст").utc).toBeNull();
    expect(computeHumanDesignFromText("какой-то текст").chart).toBeNull();
  });

  it("из текста получаем валидный чарт", () => {
    const { chart } = computeHumanDesignFromText("15.05.1990, 10:30, Москва");
    expect(chart).not.toBeNull();
    expect(VALID_TYPES).toContain(chart!.type);
    expect(chart!.centers).toHaveLength(9);
  });
});
