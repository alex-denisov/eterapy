import type { ChartPlacement, NatalWheel, SynastryWheel } from "@/lib/esoteric-chart";

function placement(
  luminary: string,
  glyph: string,
  label: string,
  angle: number,
  signKey: string,
  signName: string,
  signGlyph: string,
): ChartPlacement {
  return { luminary, glyph, label, angle, signKey, signName, signGlyph, degreeInSign: angle % 30 };
}

export const NATAL_PREVIEW: NatalWheel = {
  kind: "natal",
  calculation: "ephemeris",
  parsed: { day: 3, month: 3, year: 1988, source: "parsed" },
  sunSign: { key: "pisces", name: "Рыбы", glyph: "♓", element: "вода" },
  ascendant: { key: "cancer", name: "Рак", glyph: "♋", element: "вода" },
  placements: [
    placement("sun", "☉", "Солнце — суть", 336.4668, "pisces", "Рыбы", "♓"),
    placement("moon", "☽", "Луна — чувства", 230.0921, "scorpio", "Скорпион", "♏"),
    placement("mercury", "☿", "Меркурий — речь", 174.2935, "virgo", "Дева", "♍"),
    placement("venus", "♀", "Венера — близость", 2.5814, "aries", "Овен", "♈"),
    placement("mars", "♂", "Марс — действие", 125.3314, "leo", "Лев", "♌"),
    placement("jupiter", "♃", "Юпитер — рост", 269.213, "sagittarius", "Стрелец", "♐"),
    placement("saturn", "♄", "Сатурн — структура", 272.8793, "capricorn", "Козерог", "♑"),
    placement("uranus", "♅", "Уран — свобода", 131.3953, "leo", "Лев", "♌"),
    placement("neptune", "♆", "Нептун — образ", 173.3121, "virgo", "Дева", "♍"),
    placement("pluto", "♇", "Плутон — глубина", 284.0718, "capricorn", "Козерог", "♑"),
  ],
};

const PERSON_A = [
  placement("sun", "☉", "Солнце — суть", 336.4345, "pisces", "Рыбы", "♓"),
  placement("moon", "☽", "Луна — чувства", 275.4879, "capricorn", "Козерог", "♑"),
  placement("mercury", "☿", "Меркурий — речь", 246.0712, "sagittarius", "Стрелец", "♐"),
  placement("venus", "♀", "Венера — близость", 128.1005, "leo", "Лев", "♌"),
  placement("mars", "♂", "Марс — действие", 54.3987, "taurus", "Телец", "♉"),
  placement("jupiter", "♃", "Юпитер — рост", 100.5933, "cancer", "Рак", "♋"),
  placement("saturn", "♄", "Сатурн — структура", 239.6581, "scorpio", "Скорпион", "♏"),
  placement("uranus", "♅", "Уран — свобода", 254.8908, "sagittarius", "Стрелец", "♐"),
  placement("neptune", "♆", "Нептун — образ", 113.5305, "cancer", "Рак", "♋"),
  placement("pluto", "♇", "Плутон — глубина", 8.3196, "aries", "Овен", "♈"),
];

const PERSON_B = [
  placement("sun", "☉", "Солнце — суть", 98.4517, "cancer", "Рак", "♋"),
  placement("moon", "☽", "Луна — чувства", 276.047, "capricorn", "Козерог", "♑"),
  placement("mercury", "☿", "Меркурий — речь", 81.0146, "gemini", "Близнецы", "♊"),
  placement("venus", "♀", "Венера — близость", 328.7229, "aquarius", "Водолей", "♒"),
  placement("mars", "♂", "Марс — действие", 250.646, "sagittarius", "Стрелец", "♐"),
  placement("jupiter", "♃", "Юпитер — рост", 253.3281, "sagittarius", "Стрелец", "♐"),
  placement("saturn", "♄", "Сатурн — структура", 63.6523, "gemini", "Близнецы", "♊"),
  placement("uranus", "♅", "Уран — свобода", 28.6763, "aries", "Овен", "♈"),
  placement("neptune", "♆", "Нептун — образ", 97.4937, "cancer", "Рак", "♋"),
  placement("pluto", "♇", "Плутон — глубина", 126.7741, "leo", "Лев", "♌"),
];

export const SYNASTRY_PREVIEW: SynastryWheel = {
  kind: "synastry",
  a: { sunSign: { key: "pisces", name: "Рыбы", glyph: "♓", element: "вода" }, placements: PERSON_A },
  b: { sunSign: { key: "cancer", name: "Рак", glyph: "♋", element: "вода" }, placements: PERSON_B },
  aspects: [
    { from: 336.4345, to: 276.047, harmony: "flow" },
    { from: 275.4879, to: 81.0146, harmony: "flow" },
    { from: 246.0712, to: 328.7229, harmony: "tension" },
  ],
};
