/**
 * B660 — палитра обложки публикации.
 *
 * ⚠ Живёт отдельным модулем, а не в файле маршрута: из route-файла Next
 * разрешает экспортировать только обработчики, и `export function` там валит
 * сборку («does not match the required types of a Next.js Route»). Jest и tsc
 * этого не ловят — ловит только `next build`.
 */
/**
 * B660 — обложка перестаёт быть одной и той же карточкой.
 *
 * Владелец 2026-08-05 о ленте сообщества: медиа не должны состоять из сплошного
 * текста. Половину проблемы решает сам текст (см. контракт площадок в
 * `agent-prompt`), вторую — обложка: до этой правки все материалы получали
 * идентичный тёмно-синий прямоугольник, и лента выглядела как один пост,
 * повторённый двадцать раз.
 *
 * Тема выбирается ДЕТЕРМИНИРОВАННО: один и тот же материал всегда отдаёт одну
 * и ту же картинку — площадки перезапрашивают обложку, и «мигающая» картинка
 * выглядела бы как подмена.
 *
 * ⚠ Но детерминизма мало, нужна РАЗНОСТЬ СОСЕДЕЙ. Первая версия брала хеш
 * ключа: по всему корпусу палитры раскладывались ровно (замер на 180 ключах —
 * 27–37 на шесть тем), а на стенде три идущих подряд материала получили одну и
 * ту же зелёную. Владелец смотрит не на корпус, он смотрит на ленту, и там
 * «случайно ровно» читается как «одинаково».
 *
 * Поэтому тема вращается по ВРЕМЕНИ СЛОТА (окно 4 часа) со сдвигом на
 * площадку: соседние выпуски канала гарантированно получают разные палитры, а
 * два канала в одном окне не совпадают между собой. Хеш ключа остался только
 * на зеркало геометрии. Без даты (материал ещё не в расписании) — запасной
 * путь по ключу, как раньше.
 */
const COVER_THEMES = [
  { bg: "#081223", ink: "#f8fafc", eyebrow: "#f2c37d", warm: "255,215,154", cool: "142,137,214", accent: "#ffd79a", accentInk: "#081223" },
  { bg: "#141024", ink: "#f6f2ff", eyebrow: "#d9b7ff", warm: "214,171,255", cool: "120,160,232", accent: "#d9b7ff", accentInk: "#191231" },
  { bg: "#0b1f1c", ink: "#eefaf4", eyebrow: "#9fe3c4", warm: "159,227,196", cool: "120,196,214", accent: "#9fe3c4", accentInk: "#07211c" },
  { bg: "#231218", ink: "#fff1f0", eyebrow: "#f6ab9d", warm: "246,171,157", cool: "196,140,214", accent: "#f6ab9d", accentInk: "#2b1218" },
  { bg: "#101a2c", ink: "#eef4ff", eyebrow: "#8fc7ff", warm: "143,199,255", cool: "168,150,236", accent: "#8fc7ff", accentInk: "#0c1626" },
  { bg: "#1d1608", ink: "#fff8e8", eyebrow: "#f3d07a", warm: "243,208,122", cool: "214,150,110", accent: "#f3d07a", accentInk: "#221904" },
] as const;

/** Небольшой стабильный хеш строки — тот же на всех нодах и между перезапусками. */
function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Окно вращения палитры — 5 часов, и это подобранное число, а не круглое.
 *
 * При 4 часах в сутках ровно 6 окон — столько же, сколько палитр, поэтому
 * каждый день повторял предыдущий один в один (замер: 7 суток дали 3 палитры
 * из 6). При 5 часах сутки не делятся нацело, рисунок сдвигается каждый день,
 * и недельная лента канала перебирает все шесть.
 */
const COVER_ROTATION_WINDOW_MS = 5 * 60 * 60_000;

/**
 * Сдвиг площадки. Таблица, а не хеш: у хеша два канала могли совпасть по
 * остатку, и Дзен с Telegram в одном окне снова получили бы одну палитру.
 */
const COVER_PLATFORM_OFFSET: Record<string, number> = {
  telegram: 0,
  dzen: 1,
  vk: 2,
  instagram: 3,
  threads: 4,
  reddit: 5,
};

export function coverThemeIndex(input: {
  key: string;
  platform: string;
  scheduledFor: Date | null;
}): number {
  const themes = COVER_THEMES.length;
  if (!input.scheduledFor) return stableHash(input.key) % themes;
  const window = Math.floor(input.scheduledFor.getTime() / COVER_ROTATION_WINDOW_MS);
  const platform = input.platform.trim().toLowerCase();
  const offset = COVER_PLATFORM_OFFSET[platform] ?? stableHash(platform) % themes;
  return (((window + offset) % themes) + themes) % themes;
}

export function coverThemeFor(input: { key: string; platform: string; scheduledFor: Date | null }) {
  const theme = COVER_THEMES[coverThemeIndex(input)];
  // Геометрия свечения тоже меняется — иначе шесть палитр читаются как один
  // макет, перекрашенный шесть раз.
  const mirrored = (stableHash(input.key) >>> 8) % 2 === 1;
  return { ...theme, mirrored };
}

