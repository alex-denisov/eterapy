/**
 * B718 — ОБЛОЖКА ПЕРЕСТАЁТ БЫТЬ НАДПИСЬЮ НА ЦВЕТНОМ ПРЯМОУГОЛЬНИКЕ.
 *
 * Требование владельца 2026-08-23 дословно: «Меня также не устраивают
 * сгенерированные картинки (для телеграма например), потому что они будто по
 * шаблону "цвет-надписи-логотип", нет никакого смысла в одинаковых картинках».
 *
 * Замер: `cover-b610-2w-telegram-20260822-03--r2.png` с прода — тёмный квадрат
 * 1200×1200, свечение в углу, кружок-логотип, надпись «TELEGRAM», заголовок,
 * слоган и пилюля «Открыть ETerapy». Шесть палитр по кругу — и это ВСЁ
 * различие между обложками. Владелец описал макет точнее некуда.
 *
 * Здесь три правки, и каждая отвечает на свою часть претензии.
 *
 * 1. РИСУНОК, А НЕ ТОЛЬКО НАДПИСЬ. Появился мотив — настоящая графика (фазы
 *    луны, круги на воде, созвездие, волновое поле, лучи, слои горизонта).
 *    Мотив выбирается детерминированно от ключа материала, а его параметры
 *    (сколько элементов, где они стоят, куда наклонены) — от того же ключа.
 *    Двух одинаковых обложек не бывает даже внутри одного мотива.
 *
 * 2. ГЕОМЕТРИЯ ПЛОЩАДКИ. Квадрат 1200×1200 уходил и в Дзен, где лента
 *    показывает 16:9, и в Instagram, где вертикаль 4:5 — то есть площадка
 *    обрезала обложку сама и как хотела. Теперь размер спрашивается у
 *    площадки.
 *
 * 3. КНОПКИ БОЛЬШЕ НЕТ. «Открыть ETerapy» выглядела как кнопка и кнопкой не
 *    была: нажать её нельзя, картинка не интерактивна. Нарисованный элемент
 *    управления, который не работает, — это обман интерфейса, и в брендовой
 *    ленте он стоит доверия дороже, чем экономит внимания.
 *
 * ⚠ ПОЧЕМУ ОТДЕЛЬНЫЙ МОДУЛЬ, А НЕ РАЗМЕТКА В ФАЙЛЕ МАРШРУТА. Из route-файла
 * Next разрешает экспортировать только обработчики, и `export function` там
 * валит сборку — ровно та ловушка, из-за которой отдельным файлом живёт
 * `cover-theme.ts`. Плюс отсюда картинку можно отрисовать прогоном и ПОСМОТРЕТЬ
 * глазами, не поднимая базу.
 *
 * ⚠ ЧЕГО ЗДЕСЬ НЕТ И ПОЧЕМУ. `mediaBrief` — описание сюжета, которое пишет
 * автор и проверяет редактор, — обложкой по-прежнему не используется: чтобы
 * нарисовать названную сцену, нужна модель изображений, а её в контуре нет
 * (`POLLINATIONS` подключён только текстовым эндпоинтом). Это решение
 * владельца, а не пропуск: см. B718 §«Что ждёт решения».
 */

import { coverThemeFor } from "@/lib/marketing/cover-theme";

/** Небольшой стабильный хеш — тот же на всех нодах и между перезапусками. */
function hash(value: string): number {
  let out = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    out ^= value.charCodeAt(index);
    out = Math.imul(out, 16777619);
  }
  return out >>> 0;
}

/** Детерминированное число из ключа и «соли» — разные соли дают разные оси. */
function pick(seed: string, salt: string, max: number): number {
  return hash(`${seed}#${salt}`) % Math.max(1, max);
}

/**
 * Размер холста по площадке.
 *
 * Числа — не вкус, а то, что показывает лента: Дзен режет обложку в 16:9,
 * Instagram отдаёт вертикали 4:5 больше экрана, Telegram и VK показывают
 * подпись под изображением и выигрывают от 4:3. Threads квадрат, Reddit —
 * широкая превьюшка ссылки.
 */
const CANVAS: Record<string, { width: number; height: number }> = {
  telegram: { width: 1200, height: 900 },
  vk: { width: 1200, height: 900 },
  dzen: { width: 1200, height: 675 },
  instagram: { width: 1080, height: 1350 },
  threads: { width: 1200, height: 1200 },
  reddit: { width: 1200, height: 675 },
};

export function coverCanvas(platform: string): { width: number; height: number } {
  return CANVAS[platform.trim().toLowerCase()] ?? { width: 1200, height: 900 };
}

type Theme = ReturnType<typeof coverThemeFor>;

const MOTIFS = ["phases", "ripples", "constellation", "waves", "rays", "horizon"] as const;
export type CoverMotif = (typeof MOTIFS)[number];

/**
 * Сдвиг площадки — таблица, а не хеш, по той же причине, что и у палитры
 * (`cover-theme.ts`): у хеша два канала совпадают по остатку, и в одни сутки
 * Telegram с Дзеном получили бы один и тот же рисунок.
 */
const MOTIF_PLATFORM_OFFSET: Record<string, number> = {
  telegram: 0,
  dzen: 1,
  vk: 2,
  instagram: 3,
  threads: 4,
  reddit: 5,
};

/**
 * Мотив вращается по СУТКАМ СЛОТА, а не берётся хешем ключа.
 *
 * Первая редакция брала хеш: по корпусу мотивы раскладывались ровно, а семь
 * подряд идущих суток Telegram дали три мотива из шести — то есть в ленте
 * рисунок повторялся встык. Владелец смотрит ленту, а не корпус, и «случайно
 * ровно» читается там как «одинаково». Ровно ту же ошибку и ровно так же
 * чинил B660 у палитры.
 *
 * Шаг 5 на шести мотивах: 5 и 6 взаимно просты, поэтому соседние сутки
 * гарантированно дают разный мотив, а полный круг проходит за шесть суток.
 * Без даты (материал ещё не в расписании) остаётся запасной путь по ключу.
 */
export function coverMotifFor(key: string, platform?: string, scheduledFor?: Date | null): CoverMotif {
  const offset = platform
    ? MOTIF_PLATFORM_OFFSET[platform.trim().toLowerCase()] ?? hash(platform) % MOTIFS.length
    : 0;
  if (!scheduledFor) {
    // Ключ слота оканчивается датой и номером (`…-20260822-03`): день из него
    // читается дешевле, чем требовать дату там, где её ещё нет.
    const day = /(\d{8})/u.exec(key)?.[1];
    if (day) {
      return MOTIFS[(((Number(day) * 5 + offset) % MOTIFS.length) + MOTIFS.length) % MOTIFS.length];
    }
    return MOTIFS[hash(`motif:${key}`) % MOTIFS.length];
  }
  const day = Math.floor(scheduledFor.getTime() / 86_400_000);
  return MOTIFS[(((day * 5 + offset) % MOTIFS.length) + MOTIFS.length) % MOTIFS.length];
}

/**
 * Графика мотива. Satori понимает SVG-примитивы, но не фильтры и не маски:
 * всё построено кругами, линиями и путями с прозрачностью.
 */
function motifArt(motif: CoverMotif, seed: string, theme: Theme, width: number, height: number) {
  const w = width;
  const h = height;
  const warm = `rgb(${theme.warm})`;
  const cool = `rgb(${theme.cool})`;
  const nodes: React.ReactElement[] = [];

  if (motif === "phases") {
    // Фазы луны: диски одного размера с растущей «тенью».
    // Радиус считается ОТ ШАГА, а не от высоты: при 7 дисках круг в h/11 не
    // помещался между соседями, и «тень» одной фазы наезжала на следующую —
    // ряд читался кляксой, а не фазами.
    const count = 5 + pick(seed, "count", 3);
    const step = w / (count + 0.6);
    const radius = Math.round(Math.min(h / 12, step * 0.42));
    const gap = (w - radius * 2) / (count - 1);
    for (let index = 0; index < count; index += 1) {
      const cx = radius + index * gap;
      const cy = h * 0.42 + Math.sin(index * 1.1 + pick(seed, "wave", 7)) * h * 0.05;
      nodes.push(<circle key={`d${index}`} cx={cx} cy={cy} r={radius} fill={warm} opacity={0.16 + index * 0.05} />);
      nodes.push(
        <circle
          key={`s${index}`}
          cx={cx + radius * (0.9 - index * (1.8 / (count - 1)))}
          cy={cy}
          r={radius}
          fill={theme.bg}
          opacity={0.92}
        />,
      );
    }
  }

  if (motif === "ripples") {
    // Круги на воде: общий центр, смещённый от середины.
    const cx = w * (0.28 + pick(seed, "cx", 45) / 100);
    const cy = h * (0.3 + pick(seed, "cy", 40) / 100);
    const rings = 7 + pick(seed, "rings", 5);
    for (let index = 0; index < rings; index += 1) {
      nodes.push(
        <circle
          key={`r${index}`}
          cx={cx}
          cy={cy}
          r={h * 0.06 * (index + 1)}
          fill="none"
          stroke={index % 3 === 0 ? cool : warm}
          strokeWidth={index % 3 === 0 ? 3 : 1.5}
          opacity={0.5 - index * 0.045}
        />,
      );
    }
  }

  if (motif === "constellation") {
    // Созвездие: точки и соединяющие их линии — фигура, а не россыпь.
    const count = 7 + pick(seed, "stars", 5);
    const points: { x: number; y: number; r: number }[] = [];
    for (let index = 0; index < count; index += 1) {
      points.push({
        x: w * (0.08 + (pick(seed, `x${index}`, 84) / 100)),
        y: h * (0.1 + (pick(seed, `y${index}`, 78) / 100)),
        r: 3 + pick(seed, `r${index}`, 7),
      });
    }
    for (let index = 1; index < points.length; index += 1) {
      nodes.push(
        <line
          key={`l${index}`}
          x1={points[index - 1].x}
          y1={points[index - 1].y}
          x2={points[index].x}
          y2={points[index].y}
          stroke={cool}
          strokeWidth={1.2}
          opacity={0.32}
        />,
      );
    }
    for (const [index, point] of points.entries()) {
      nodes.push(<circle key={`p${index}`} cx={point.x} cy={point.y} r={point.r} fill={warm} opacity={0.75} />);
    }
  }

  if (motif === "waves") {
    // Волновое поле: горизонтальные полосы с разной амплитудой.
    const lines = 9 + pick(seed, "lines", 6);
    for (let index = 0; index < lines; index += 1) {
      const y = h * 0.2 + index * (h * 0.55 / lines);
      const amp = h * 0.02 * (1 + ((index + pick(seed, "amp", 5)) % 4));
      const d = `M 0 ${y} Q ${w * 0.25} ${y - amp} ${w * 0.5} ${y} T ${w} ${y}`;
      nodes.push(
        <path key={`w${index}`} d={d} fill="none" stroke={index % 2 ? warm : cool} strokeWidth={2} opacity={0.42 - index * 0.02} />,
      );
    }
  }

  if (motif === "rays") {
    // Лучи: диск и расходящиеся линии разной длины.
    const cx = w * 0.5;
    const cy = h * (0.34 + pick(seed, "cy", 20) / 100);
    const count = 14 + pick(seed, "rays", 12);
    for (let index = 0; index < count; index += 1) {
      const angle = (index / count) * Math.PI * 2 + pick(seed, "turn", 60) / 100;
      const inner = h * 0.14;
      const outer = inner + h * (0.08 + (pick(seed, `len${index}`, 22) / 100));
      nodes.push(
        <line
          key={`y${index}`}
          x1={cx + Math.cos(angle) * inner}
          y1={cy + Math.sin(angle) * inner}
          x2={cx + Math.cos(angle) * outer}
          y2={cy + Math.sin(angle) * outer}
          stroke={index % 3 === 0 ? cool : warm}
          strokeWidth={index % 3 === 0 ? 3 : 1.5}
          opacity={0.55}
        />,
      );
    }
    nodes.push(<circle key="core" cx={cx} cy={cy} r={h * 0.11} fill={warm} opacity={0.2} />);
    nodes.push(<circle key="core2" cx={cx} cy={cy} r={h * 0.11} fill="none" stroke={warm} strokeWidth={2} opacity={0.6} />);
  }

  if (motif === "horizon") {
    // Слои горизонта: перекрывающиеся дуги, за ними диск.
    nodes.push(
      <circle
        key="sun"
        cx={w * (0.3 + pick(seed, "sun", 40) / 100)}
        cy={h * 0.42}
        r={h * 0.13}
        fill={warm}
        opacity={0.28}
      />,
    );
    const layers = 3 + pick(seed, "layers", 3);
    for (let index = 0; index < layers; index += 1) {
      const base = h * (0.5 + index * 0.09);
      const lift = h * (0.06 + pick(seed, `lift${index}`, 12) / 100);
      const shift = w * (pick(seed, `sh${index}`, 40) / 100);
      const d = `M -50 ${base + lift} Q ${shift} ${base - lift} ${w * 0.55} ${base} T ${w + 50} ${base - lift * 0.4} L ${w + 50} ${h + 50} L -50 ${h + 50} Z`;
      nodes.push(<path key={`h${index}`} d={d} fill={index % 2 ? cool : warm} opacity={0.13 + index * 0.05} />);
    }
  }

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ position: "absolute", top: 0, left: 0 }}>
      {nodes}
    </svg>
  );
}

export interface CoverInput {
  /**
   * Ключ слота. Имя `slotKey`, а не `key`: `key` — зарезервированное имя
   * пропса React, до компонента оно не доходит вовсе, и обложка молча
   * получила бы `undefined` вместо зерна — то есть один мотив и одну палитру
   * на весь корпус. Ровно та ошибка, которую эта правка чинит.
   */
  slotKey: string;
  platform: string;
  title: string;
  eyebrow: string;
  scheduledFor: Date | null;
  /** B725 — выбор шаблона: 0-token диалоговый мокап (мессенджер) или графический мотив */
  layout?: "art" | "chat_mockup";
  messageText?: string;
  responsePreview?: string;
}

/**
 * B731 — МОКАП ПЕРЕПИСКИ ПЕРЕСТАЁТ БЫТЬ «АБСТРАКТНЫМ МЕССЕНДЖЕРОМ».
 *
 * Требование владельца 2026-09-07 дословно: «Я хочу чтобы ты скриншоты генерил
 * именно по такому же шаблону как настоящий мессенджер Telegram. Если скриншоты
 * будут хоть немного непохожи на Telegram, то это будет явным признаком полной
 * ИИ-генерации».
 *
 * Первая редакция (B725) выдавала себя девятью признаками сразу: имя чата
 * «Диалог в 01:42», аватар с текстом «Он», два радиальных пятна вместо фона
 * темы, свои градиенты пузырей, Arial, отсутствие строки состояния и поля
 * ввода, слово «Прочитано» текстом — и, самое заметное, брендовая плашка
 * «РАЗБОР АНИ · КУРАТОР ETERAPY» во всю ширину. Ни один скриншот из мессенджера
 * такого элемента не содержит; плашка одна выдавала подделку сильнее, чем все
 * цвета вместе.
 *
 * ЭТАЛОН — НЕ ПАМЯТЬ, А ФАЙЛ ТЕМЫ. Цвета сняты с официальной ночной темы
 * Telegram для Android: `TMessagesProj/src/main/assets/night.attheme` из
 * репозитория DrKLO/Telegram. Там они лежат знаковыми ARGB-числами
 * (`chat_wallpaper=-15790320`), здесь — те же значения в hex. Придумывать
 * «примерно такой синий» в этой задаче нельзя по условию.
 *
 * ГЕОМЕТРИЯ В dp, А НЕ В ПРОЦЕНТАХ. Интерфейс Android описан в независимых от
 * плотности единицах: строка состояния 24, шапка 56, поле ввода 48, текст
 * сообщения 16sp. Проценты от холста давали бы на широком Дзене шапку вдвое
 * выше, чем на вертикальном Instagram, — и ни один размер не совпал бы с
 * настоящим. Поэтому холст пересчитывается в «ширину телефона» (`chatMetrics`),
 * а всё остальное считается от неё.
 *
 * ШРИФТ. Telegram на Android набран Roboto; он вшит в образ и передаётся в
 * `ImageResponse` маршрутом (`cover-fonts.ts`). Из сети ничего не тянется.
 *
 * ЧЕГО ЗДЕСЬ СОЗНАТЕЛЬНО НЕТ. Имени реального человека и намёка на «скриншот
 * от клиента»: собеседник подписан «Он», и это иллюстрация типичной ситуации, а
 * не поддельное свидетельство ([[feedback_demo_stats_become_fabrication]]).
 */

/**
 * Палитра ночной темы Telegram Android (`night.attheme`).
 * Слева — ключ темы, чтобы правку можно было сверить с исходником построчно.
 */
const TG = {
  wallpaper: "#0f0f10", // chat_wallpaper
  bar: "#232326", // actionBarDefault
  barTitle: "#ffffff", // actionBarDefaultTitle
  barSubtitle: "rgba(242, 242, 242, 0.45)", // actionBarDefaultSubtitle
  online: "#74bdf9", // chat_status
  inBubble: "#1f2123", // chat_inBubble
  inText: "#fafafa", // chat_messageTextIn
  inTime: "#7d7f81", // chat_inTimeText
  outBubbleTop: "#366caf", // chat_outBubble
  outBubbleBottom: "#3b8cb9", // chat_outBubbleGradient
  outText: "#fafafa", // chat_messageTextOut
  outTime: "#94d3f6", // chat_outTimeText
  check: "rgba(201, 240, 255, 0.88)", // chat_outSentCheckRead
  panel: "#1e1e1f", // chat_messagePanelBackground
  panelHint: "rgba(255, 255, 255, 0.39)", // chat_messagePanelHint
  panelIcon: "rgba(255, 255, 255, 0.39)", // chat_messagePanelIcons
  service: "rgba(55, 55, 55, 0.59)", // chat_serviceBackground
  serviceText: "#ffffff", // chat_serviceText
  avatarTop: "#4fa1e8", // avatar_backgroundSaved
  avatarBottom: "#1a88e7", // avatar_background2Saved
} as const;

/** Высоты элементов интерфейса Android в dp — из макета Telegram. */
const BAR_DP = { status: 24, header: 56, panel: 48 } as const;

/**
 * Пересчёт холста площадки в «ширину телефона».
 *
 * Холсты у площадок разные (Дзен 16:9, Instagram 4:5), а телефон один. Если
 * всегда брать 360 dp, на широком и низком холсте шапка с полем ввода съедят
 * почти всю высоту и переписке останется полоска. Поэтому ширина телефона
 * растягивается ровно настолько, чтобы под сообщения осталось не меньше
 * `MIN_CHAT_DP`, — интерфейс при этом остаётся пропорциональным, меняется
 * только «плотность экрана».
 */
const MIN_CHAT_DP = 165;
const PHONE_DP = { min: 360, max: 560 } as const;

export function chatMetrics(width: number, height: number): { dp: number; phoneDp: number } {
  const chrome = BAR_DP.status + BAR_DP.header + BAR_DP.panel;
  const needed = (width * (chrome + MIN_CHAT_DP)) / height;
  const phoneDp = Math.min(PHONE_DP.max, Math.max(PHONE_DP.min, Math.round(needed)));
  return { dp: width / phoneDp, phoneDp };
}

/** Время в мокапе детерминировано ключом слота: одна и та же картинка на всех нодах. */
function clockFrom(seed: string): { incoming: string; outgoing: string; status: string } {
  const hour = 21 + pick(seed, "hour", 3);
  const minute = pick(seed, "minute", 55);
  const format = (h: number, m: number) =>
    `${String(h % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const outMinute = minute + 1 + pick(seed, "gap", 3);
  return {
    incoming: format(hour, minute),
    outgoing: format(hour + (outMinute >= 60 ? 1 : 0), outMinute),
    status: format(hour + (outMinute + 2 >= 60 ? 1 : 0), outMinute + 2),
  };
}

/**
 * Реплика в пузыре — без кавычек.
 *
 * В теле поста реплика стоит в «ёлочках», потому что там она цитата. В
 * мессенджере кавычек вокруг собственного сообщения не бывает ни у кого, и
 * именно они читались бы как «нарисовано», а не «прислано».
 */
function bubbleText(raw: string, limit: number): string {
  const text = raw.replace(/\s+/gu, " ").replace(/^[«"'\s]+|[»"'\s]+$/gu, "").trim();
  return text.length <= limit ? text : `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

/** Хвостик пузыря — путь из веб-клиента Telegram, 6×17 dp. */
//
// ⚠ Флаги дуги записаны через пробелы (`0 0 1`), а не слитно (`016`): слитную
// сокращённую запись из веб-клиента разбирает браузер, но не Satori — хвостик
// исходящего пузыря от неё пропадал молча, без ошибки в прогоне.
const TAIL_IN =
  "M6 17H0V0c.193 2.84.876 5.767 2.05 8.782.904 2.325 2.446 4.485 4.625 6.48A1 1 0 0 1 6 17z";
const TAIL_OUT =
  "M0 17h6V0c-.193 2.84-.876 5.767-2.05 8.782-.904 2.325-2.446 4.485-4.625 6.48A1 1 0 0 0 0 17z";

export function ChatMockupArt(input: CoverInput) {
  const { width, height } = coverCanvas(input.platform);
  const { dp } = chatMetrics(width, height);
  const px = (value: number) => Math.round(value * dp);
  const clock = clockFrom(input.slotKey);

  const incoming = bubbleText(input.messageText || input.title, 150);
  const outgoing = bubbleText(input.responsePreview || "Не знаю, что на это ответить", 60);

  const icon = (path: string, size: number, color: string, key: string) => (
    <svg key={key} width={px(size)} height={px(size)} viewBox="0 0 24 24" fill="none" style={{ display: "flex" }}>
      <path d={path} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  /**
   * Короткое сообщение Telegram ставит время В ТУ ЖЕ строку, а переносит на
   * следующую только когда последняя строка длинная. Отдельная строка со
   * временем под коротким «Ты стала какой-то чужой» — заметный признак
   * нарисованного интерфейса, поэтому порог здесь есть.
   */
  const INLINE_TIME_LIMIT = 28;

  const bubbleTime = (time: string, color: string, read: boolean, inline: boolean) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        alignSelf: "flex-end",
        marginTop: inline ? px(4) : px(2),
        marginLeft: inline ? px(6) : 0,
        gap: px(3),
        fontSize: px(12),
        color,
      }}
    >
      <span style={{ display: "flex" }}>{time}</span>
      {read ? (
        <svg width={px(16)} height={px(11)} viewBox="0 0 16 11" fill="none" style={{ display: "flex" }}>
          <path d="M1 6.2 3.6 8.8 9.2 1.6" stroke={TG.check} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6.4 6.6 8.4 8.8 14.6 1.6" stroke={TG.check} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </div>
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        backgroundColor: TG.wallpaper,
        fontFamily: "Roboto",
        color: TG.inText,
      }}
    >
      {/* Строка состояния — 24 dp, тот же цвет, что и шапка. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: px(BAR_DP.status),
          flexShrink: 0,
          padding: `0 ${px(10)}px`,
          backgroundColor: TG.bar,
        }}
      >
        <div style={{ display: "flex", fontSize: px(12), fontWeight: 500, color: "#ffffff" }}>{clock.status}</div>
        <div style={{ display: "flex", flexGrow: 1 }} />
        <div style={{ display: "flex", alignItems: "flex-end", gap: px(5) }}>
          {/* сеть */}
          <svg width={px(15)} height={px(11)} viewBox="0 0 15 11" fill="none" style={{ display: "flex" }}>
            <rect x="0" y="7.5" width="2.6" height="3.5" rx="0.6" fill="#ffffff" />
            <rect x="4.1" y="5" width="2.6" height="6" rx="0.6" fill="#ffffff" />
            <rect x="8.2" y="2.5" width="2.6" height="8.5" rx="0.6" fill="#ffffff" />
            <rect x="12.3" y="0" width="2.6" height="11" rx="0.6" fill="#ffffff" />
          </svg>
          {/* wi-fi */}
          <svg width={px(14)} height={px(11)} viewBox="0 0 14 11" fill="none" style={{ display: "flex" }}>
            <path d="M1 3.6C2.6 2.1 4.7 1.2 7 1.2s4.4.9 6 2.4" stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" />
            <path d="M3.3 6.2C4.3 5.3 5.6 4.7 7 4.7s2.7.6 3.7 1.5" stroke="#ffffff" strokeWidth={1.4} strokeLinecap="round" />
            <path d="M7 9.6l-1.7-1.8A2.4 2.4 0 017 7.1c.7 0 1.3.3 1.7.7L7 9.6z" fill="#ffffff" />
          </svg>
          {/* батарея */}
          <svg width={px(20)} height={px(11)} viewBox="0 0 20 11" fill="none" style={{ display: "flex" }}>
            <rect x="0.6" y="0.6" width="16.4" height="9.8" rx="2.2" stroke="rgba(255,255,255,0.5)" strokeWidth={1.2} />
            <rect x="2.2" y="2.2" width="11.4" height="6.6" rx="1.2" fill="#ffffff" />
            <rect x="18.2" y="3.6" width="1.6" height="3.8" rx="0.8" fill="rgba(255,255,255,0.5)" />
          </svg>
        </div>
      </div>

      {/* Шапка чата — 56 dp: стрелка назад, аватар, имя и подпись, звонок и меню. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: px(BAR_DP.header),
          flexShrink: 0,
          padding: `0 ${px(12)}px 0 ${px(10)}px`,
          backgroundColor: TG.bar,
        }}
      >
        {icon("M20 12H4M10 6l-6 6 6 6", 24, "#ffffff", "back")}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: px(40),
            height: px(40),
            marginLeft: px(12),
            borderRadius: "999px",
            background: `linear-gradient(180deg, ${TG.avatarTop} 0%, ${TG.avatarBottom} 100%)`,
            fontSize: px(18),
            fontWeight: 500,
            color: "#ffffff",
          }}
        >
          О
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginLeft: px(12), flexGrow: 1 }}>
          <div style={{ display: "flex", fontSize: px(16), fontWeight: 500, color: TG.barTitle }}>Он</div>
          <div style={{ display: "flex", fontSize: px(13), color: TG.barSubtitle, marginTop: px(1) }}>
            был(а) недавно
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: px(18) }}>
          {icon(
            "M6.5 3.5 8.8 8l-2 2c1 2 2.6 3.6 4.6 4.6l2-2 4.5 2.3v3.6c0 .6-.5 1.1-1.1 1C8.4 18.7 4.3 14.6 3.4 5.6a1 1 0 011-1.1h2.1z",
            22,
            "#ffffff",
            "call",
          )}
          <svg width={px(4)} height={px(18)} viewBox="0 0 4 18" fill="none" style={{ display: "flex" }}>
            <circle cx="2" cy="2" r="2" fill="#ffffff" />
            <circle cx="2" cy="9" r="2" fill="#ffffff" />
            <circle cx="2" cy="16" r="2" fill="#ffffff" />
          </svg>
        </div>
      </div>

      {/* Лента сообщений. Прижата книзу и обрезана сверху — как открытый чат. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          // ⚠ Только `flexGrow` мало: длинная реплика раздувала ленту, и поле
          // ввода уезжало за нижний край холста — на широком Дзене этого не
          // видно ни в одном тесте, только на отрисованном PNG.
          flexGrow: 1,
          flexShrink: 1,
          minHeight: 0,
          justifyContent: "flex-end",
          overflow: "hidden",
          padding: `${px(8)}px ${px(9)}px`,
          gap: px(6),
        }}
      >
        <div style={{ display: "flex", justifyContent: "center", marginBottom: px(4) }}>
          <div
            style={{
              display: "flex",
              backgroundColor: TG.service,
              borderRadius: "999px",
              padding: `${px(4)}px ${px(10)}px`,
              fontSize: px(13),
              color: TG.serviceText,
            }}
          >
            Сегодня
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-start", paddingLeft: px(6) }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              position: "relative",
              maxWidth: `${px(268)}px`,
              backgroundColor: TG.inBubble,
              borderRadius: `${px(12)}px ${px(12)}px ${px(12)}px 0`,
              padding: `${px(7)}px ${px(10)}px ${px(6)}px ${px(10)}px`,
            }}
          >
            <svg
              width={px(6)}
              height={px(17)}
              viewBox="0 0 6 17"
              fill="none"
              style={{ position: "absolute", left: `${-px(6)}px`, bottom: 0, display: "flex" }}
            >
              <path d={TAIL_IN} fill={TG.inBubble} />
            </svg>
            <div
              style={{
                display: "flex",
                flexDirection: incoming.length <= INLINE_TIME_LIMIT ? "row" : "column",
                alignItems: incoming.length <= INLINE_TIME_LIMIT ? "flex-end" : "stretch",
              }}
            >
              <div style={{ display: "flex", fontSize: px(16), lineHeight: 1.28, color: TG.inText }}>{incoming}</div>
              {bubbleTime(clock.incoming, TG.inTime, false, incoming.length <= INLINE_TIME_LIMIT)}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", paddingRight: px(6) }}>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              position: "relative",
              maxWidth: `${px(268)}px`,
              background: `linear-gradient(180deg, ${TG.outBubbleTop} 0%, ${TG.outBubbleBottom} 100%)`,
              borderRadius: `${px(12)}px ${px(12)}px 0 ${px(12)}px`,
              padding: `${px(7)}px ${px(10)}px ${px(6)}px ${px(10)}px`,
            }}
          >
            <svg
              width={px(6)}
              height={px(17)}
              viewBox="0 0 6 17"
              fill="none"
              style={{ position: "absolute", right: `${-px(6)}px`, bottom: 0, display: "flex" }}
            >
              <path d={TAIL_OUT} fill={TG.outBubbleBottom} />
            </svg>
            <div
              style={{
                display: "flex",
                flexDirection: outgoing.length <= INLINE_TIME_LIMIT ? "row" : "column",
                alignItems: outgoing.length <= INLINE_TIME_LIMIT ? "flex-end" : "stretch",
              }}
            >
              <div style={{ display: "flex", fontSize: px(16), lineHeight: 1.28, color: TG.outText }}>{outgoing}</div>
              {bubbleTime(clock.outgoing, TG.outTime, true, outgoing.length <= INLINE_TIME_LIMIT)}
            </div>
          </div>
        </div>
      </div>

      {/* Поле ввода — 48 dp: смайл, подсказка, скрепка, микрофон. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          height: px(BAR_DP.panel),
          flexShrink: 0,
          padding: `0 ${px(12)}px`,
          gap: px(12),
          backgroundColor: TG.panel,
        }}
      >
        <svg width={px(24)} height={px(24)} viewBox="0 0 24 24" fill="none" style={{ display: "flex" }}>
          <circle cx="12" cy="12" r="9" stroke={TG.panelIcon} strokeWidth={1.8} />
          <circle cx="9" cy="10" r="1.2" fill={TG.panelIcon} />
          <circle cx="15" cy="10" r="1.2" fill={TG.panelIcon} />
          <path d="M8.5 14.5c.9 1.2 2.1 1.8 3.5 1.8s2.6-.6 3.5-1.8" stroke={TG.panelIcon} strokeWidth={1.8} strokeLinecap="round" />
        </svg>
        <div style={{ display: "flex", flexGrow: 1, fontSize: px(16), color: TG.panelHint }}>Сообщение</div>
        {icon("M14.5 6.5 8 13a2.5 2.5 0 003.5 3.5l7-7a4.5 4.5 0 00-6.4-6.4l-7 7a6.5 6.5 0 009.2 9.2l5.7-5.7", 24, TG.panelIcon, "clip")}
        <svg width={px(24)} height={px(24)} viewBox="0 0 24 24" fill="none" style={{ display: "flex" }}>
          <rect x="9" y="2.5" width="6" height="11" rx="3" stroke={TG.panelIcon} strokeWidth={1.8} />
          <path d="M5.5 11a6.5 6.5 0 0013 0M12 17.5V21" stroke={TG.panelIcon} strokeWidth={1.8} strokeLinecap="round" />
        </svg>
      </div>
    </div>
  );
}

/**
 * Разметка обложки.
 *
 * Заголовок остался, и это не противоречие с претензией владельца: он жаловался
 * на обложку, СОСТОЯЩУЮ из надписи, а не на подпись как таковую. Теперь надпись
 * занимает нижнюю треть и стоит поверх рисунка, а не вместо него.
 */
export function CoverArt(input: CoverInput) {
  if (input.layout === "chat_mockup") {
    return <ChatMockupArt {...input} />;
  }

  const { width, height } = coverCanvas(input.platform);
  const theme = coverThemeFor({
    key: input.slotKey,
    platform: input.platform,
    scheduledFor: input.scheduledFor,
  });
  const motif = coverMotifFor(input.slotKey, input.platform, input.scheduledFor);
  const titleSize = Math.round(height * (input.title.length > 70 ? 0.052 : 0.062));

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        overflow: "hidden",
        background: theme.bg,
        color: theme.ink,
        fontFamily: "Arial, sans-serif",
        padding: `${Math.round(height * 0.06)}px`,
      }}
    >
      <div
        style={{
          position: "absolute",
          width: `${Math.round(width * 0.6)}px`,
          height: `${Math.round(width * 0.6)}px`,
          borderRadius: "999px",
          ...(theme.mirrored ? { left: `${-Math.round(width * 0.18)}px` } : { right: `${-Math.round(width * 0.18)}px` }),
          top: `${-Math.round(width * 0.22)}px`,
          background: `radial-gradient(circle, rgba(${theme.warm},.5) 0%, rgba(${theme.warm},.16) 40%, rgba(0,0,0,0) 72%)`,
        }}
      />
      {motifArt(motif, input.slotKey, theme, width, height)}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          width: "100%",
          zIndex: 1,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "14px", fontSize: Math.round(height * 0.028), fontWeight: 700 }}>
          <div
            style={{
              width: `${Math.round(height * 0.042)}px`,
              height: `${Math.round(height * 0.042)}px`,
              borderRadius: "999px",
              background: `radial-gradient(circle at 42% 38%, rgb(${theme.warm}) 0%, ${theme.accent} 48%, rgb(${theme.cool}) 100%)`,
            }}
          />
          ETerapy
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: `${Math.round(height * 0.02)}px` }}>
          <div
            style={{
              fontSize: Math.round(height * 0.024),
              color: theme.eyebrow,
              textTransform: "uppercase",
              letterSpacing: "2.5px",
            }}
          >
            {input.eyebrow}
          </div>
          <div style={{ fontSize: titleSize, lineHeight: 1.1, fontWeight: 700, letterSpacing: "-1px" }}>
            {input.title}
          </div>
        </div>
      </div>
    </div>
  );
}
