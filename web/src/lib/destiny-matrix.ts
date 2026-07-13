export const DESTINY_MATRIX_METHOD = "ladini-lidrekon-v1";

export type MatrixArm = {
  outer: number;
  outerInner: number;
  middle: number;
  inner: number;
};

export type DestinyMatrixHealthRow = {
  key: string;
  name: string;
  focus: string;
  physical: number;
  energy: number;
  emotions: number;
};

export type DestinyMatrixZoneKey =
  | "personality"
  | "talent"
  | "society"
  | "task"
  | "center"
  | "inner-center"
  | "money"
  | "love"
  | "sociability"
  | "purpose";

export type DestinyMatrixZone = {
  key: DestinyMatrixZoneKey;
  title: string;
  hint: string;
  value: number;
};

export type DestinyMatrix = {
  method: typeof DESTINY_MATRIX_METHOD;
  birth: { day: number; month: number; year: number };
  west: MatrixArm;
  north: MatrixArm;
  east: MatrixArm;
  south: MatrixArm;
  northwest: MatrixArm;
  northeast: MatrixArm;
  southeast: MatrixArm;
  southwest: MatrixArm;
  center: number;
  innerCenter: number;
  love: { entry: number; core: number; outcome: number };
  money: { entry: number; core: number; outcome: number };
  purposes: {
    personalEarth: number;
    personalHeaven: number;
    personal: number;
    maternal: number;
    paternal: number;
    ancestral: number;
    spiritual: number;
    highest: number;
  };
  health: DestinyMatrixHealthRow[];
  healthTotal: { physical: number; energy: number; emotions: number };
  decadeCycle: Array<{ age: number; energy: number }>;
  perimeterCycle: Array<{ age: number; label: string; energy: number; major: boolean }>;
  zones: DestinyMatrixZone[];
};

export function reduceDestinyEnergy(input: number): number {
  let value = Math.abs(Math.trunc(input));
  while (value > 22) {
    value = String(value).split("").reduce((sum, digit) => sum + Number(digit), 0);
  }
  return value === 0 ? 22 : value;
}

export function parseStrictBirthDate(input: string): { day: number; month: number; year: number } | null {
  const match = input.match(/\b(\d{1,2})[./-](\d{1,2})[./-](\d{4})\b/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null;
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (candidate.getUTCFullYear() !== year || candidate.getUTCMonth() !== month - 1 || candidate.getUTCDate() !== day) return null;
  return { day, month, year };
}

function arm(outer: number, center: number): MatrixArm {
  const middle = reduceDestinyEnergy(outer + center);
  return {
    outer,
    outerInner: reduceDestinyEnergy(outer + middle),
    middle,
    inner: reduceDestinyEnergy(middle + center),
  };
}

function diagonalArm(outer: number, innerCenter: number): MatrixArm {
  const small = reduceDestinyEnergy(outer + innerCenter);
  const middle = reduceDestinyEnergy(outer + small);
  return {
    outer,
    outerInner: middle,
    middle: small,
    inner: innerCenter,
  };
}

function healthRow(key: string, name: string, focus: string, physical: number, energy: number): DestinyMatrixHealthRow {
  return { key, name, focus, physical, energy, emotions: reduceDestinyEnergy(physical + energy) };
}

function perimeterSegment(startAge: number, from: number, to: number) {
  const middle = reduceDestinyEnergy(from + to);
  const leftMiddle = reduceDestinyEnergy(from + middle);
  const rightMiddle = reduceDestinyEnergy(middle + to);
  return [
    { age: startAge, label: `${startAge}`, energy: from, major: true },
    { age: startAge + 1.5, label: `${startAge + 1}–${startAge + 2}`, energy: reduceDestinyEnergy(from + leftMiddle), major: false },
    { age: startAge + 2.5, label: `${startAge + 2}–${startAge + 3}`, energy: leftMiddle, major: false },
    { age: startAge + 3.5, label: `${startAge + 3}–${startAge + 4}`, energy: reduceDestinyEnergy(middle + leftMiddle), major: false },
    { age: startAge + 5, label: `${startAge + 5}`, energy: middle, major: true },
    { age: startAge + 6.5, label: `${startAge + 6}–${startAge + 7}`, energy: reduceDestinyEnergy(middle + rightMiddle), major: false },
    { age: startAge + 7.5, label: `${startAge + 7}–${startAge + 8}`, energy: rightMiddle, major: false },
    { age: startAge + 8.5, label: `${startAge + 8}–${startAge + 9}`, energy: reduceDestinyEnergy(to + rightMiddle), major: false },
  ];
}

export function computeDestinyMatrix(day: number, month: number, year: number): DestinyMatrix {
  const westValue = reduceDestinyEnergy(day);
  const northValue = reduceDestinyEnergy(month);
  const eastValue = reduceDestinyEnergy(String(year).split("").reduce((sum, digit) => sum + Number(digit), 0));
  const southValue = reduceDestinyEnergy(westValue + northValue + eastValue);
  const center = reduceDestinyEnergy(westValue + northValue + eastValue + southValue);

  const northwestValue = reduceDestinyEnergy(westValue + northValue);
  const northeastValue = reduceDestinyEnergy(northValue + eastValue);
  const southeastValue = reduceDestinyEnergy(eastValue + southValue);
  const southwestValue = reduceDestinyEnergy(southValue + westValue);
  const innerCenter = reduceDestinyEnergy(northwestValue + northeastValue + southeastValue + southwestValue);

  const west = arm(westValue, center);
  const north = arm(northValue, center);
  const east = arm(eastValue, center);
  const south = arm(southValue, center);
  const northwest = diagonalArm(northwestValue, innerCenter);
  const northeast = diagonalArm(northeastValue, innerCenter);
  const southeast = diagonalArm(southeastValue, innerCenter);
  const southwest = diagonalArm(southwestValue, innerCenter);

  const personalEarth = reduceDestinyEnergy(westValue + eastValue);
  const personalHeaven = reduceDestinyEnergy(northValue + southValue);
  const personal = reduceDestinyEnergy(personalEarth + personalHeaven);
  const maternal = reduceDestinyEnergy(southwestValue + northeastValue);
  const paternal = reduceDestinyEnergy(southeastValue + northwestValue);
  const ancestral = reduceDestinyEnergy(maternal + paternal);
  const spiritual = reduceDestinyEnergy(personal + ancestral);
  const highest = reduceDestinyEnergy(spiritual + ancestral);

  const health = [
    healthRow("sahasrara", "Сахасрара", "духовный канал и направление", west.outer, north.outer),
    healthRow("ajna", "Аджна", "мышление, интуиция и видение", west.outerInner, north.outerInner),
    healthRow("vishuddha", "Вишудха", "самовыражение и творчество", west.middle, north.middle),
    healthRow("anahata", "Анахата", "чувства, доверие и принятие", west.inner, north.inner),
    healthRow("manipura", "Манипура", "воля, деньги и социум", center, center),
    healthRow("svadhisthana", "Свадхистана", "желания, отношения и удовольствие", east.middle, south.middle),
    healthRow("muladhara", "Муладхара", "опора, безопасность и род", east.outer, south.outer),
  ];
  const healthTotal = {
    physical: reduceDestinyEnergy(health.reduce((sum, row) => sum + row.physical, 0)),
    energy: reduceDestinyEnergy(health.reduce((sum, row) => sum + row.energy, 0)),
    emotions: reduceDestinyEnergy(health.reduce((sum, row) => sum + row.emotions, 0)),
  };
  const decadeCycle = [
    { age: 0, energy: westValue },
    { age: 10, energy: northwestValue },
    { age: 20, energy: northValue },
    { age: 30, energy: northeastValue },
    { age: 40, energy: eastValue },
    { age: 50, energy: southeastValue },
    { age: 60, energy: southValue },
    { age: 70, energy: southwestValue },
    { age: 80, energy: westValue },
  ];
  const perimeterCycle = decadeCycle.slice(0, -1).flatMap((item, index) =>
    perimeterSegment(item.age, item.energy, decadeCycle[index + 1].energy),
  );

  // The selected Ladini reference uses one shared south/east channel. Love and
  // money branch from that shared node; they are not southeast-arm aliases.
  const sharedChannel = reduceDestinyEnergy(south.middle + east.middle);
  const loveOutcome = reduceDestinyEnergy(south.middle + sharedChannel);
  const moneyOutcome = reduceDestinyEnergy(east.middle + sharedChannel);
  const zones: DestinyMatrixZone[] = [
    { key: "personality", title: "Личность (день)", hint: "Базовая энергия", value: west.outer },
    { key: "talent", title: "Талант (месяц)", hint: "Небо и дар", value: north.outer },
    { key: "society", title: "Социум (год)", hint: "Как проявляетесь", value: east.outer },
    { key: "task", title: "Задача", hint: "Главный урок", value: south.outer },
    { key: "center", title: "Центр", hint: "Ядро личности", value: center },
    { key: "inner-center", title: "Внутренний центр", hint: "Личные ценности", value: innerCenter },
    { key: "money", title: "Деньги", hint: "Финансовый канал", value: east.middle },
    { key: "love", title: "Любовь", hint: "Сердце и чувства", value: loveOutcome },
    { key: "sociability", title: "Социальность", hint: "Команда и люди", value: moneyOutcome },
    { key: "purpose", title: "Предназначение", hint: "Общий вектор", value: spiritual },
  ];

  return {
    method: DESTINY_MATRIX_METHOD,
    birth: { day, month, year },
    west,
    north,
    east,
    south,
    northwest,
    northeast,
    southeast,
    southwest,
    center,
    innerCenter,
    love: { entry: south.middle, core: sharedChannel, outcome: loveOutcome },
    money: { entry: east.middle, core: sharedChannel, outcome: moneyOutcome },
    purposes: { personalEarth, personalHeaven, personal, maternal, paternal, ancestral, spiritual, highest },
    health,
    healthTotal,
    decadeCycle: decadeCycle.slice(0, -1),
    perimeterCycle,
    zones,
  };
}
