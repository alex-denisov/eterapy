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
import { hash, pick } from "@/lib/marketing/cover-seed";
import {
  buildThread,
  contactFor,
  formatClock,
  replyFor,
  segmentEmoji,
  type ChatTopic,
} from "@/lib/marketing/chat-thread";
import type { EmojiMap } from "@/lib/marketing/cover-emoji";

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
  /** B731 — тема переписки: от неё зависят и подпись собеседника, и фоновые реплики. */
  topic?: ChatTopic;
  /** B731 — карта «эмодзи → data-URI»; без неё эмодзи из реплик выбрасываются. */
  emoji?: EmojiMap;
  /** B731 — экран целиком или кадр без шапки. По умолчанию решает ключ слота. */
  framing?: ScreenshotFraming;
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
 * ЭКРАН НАСТОЯЩЕГО ТЕЛЕФОНА, А НЕ РАСТЯНУТЫЙ ПОД ХОЛСТ ИНТЕРФЕЙС.
 *
 * Замечание владельца 2026-09-08 дословно: «если ты делаешь скриншот, то в весь
 * экран […] попадает шапка + поле ввода + реплики. У тебя же […] показана шапка
 * + поле ввода + 3 реплики, при этом высота скриншота не соответствует ни
 * одному экрану мобильного устройства в мире».
 *
 * Он прав, и ошибка была системная. Прежняя редакция подбирала «ширину
 * телефона» так, чтобы под ленту осталось 165 dp, — то есть подгоняла телефон
 * под холст. При холсте 1200×900 получался экран высотой 292 dp: таких
 * телефонов нет, а шапка и поле ввода на нём стояли одновременно.
 *
 * Теперь наоборот: экран — фиксированный, из списка НАСТОЯЩИХ размеров, а под
 * холст подгоняется КАДР. Отсюда ровно два честных варианта:
 *
 *  • `bottom` — низ экрана: последние реплики и поле ввода, шапка осталась
 *    ВЫШЕ среза.
 *  • `top` — верх экрана: строка состояния, шапка с именем собеседника и
 *    начало видимой переписки, поле ввода осталось НИЖЕ среза.
 *
 * ПОЛЕЙ У СКРИНШОТА НЕ БЫВАЕТ. Дефект приёмки 2026-09-08 дословно: «Черных
 * полей у скриншотов не бывает, скриншот делает снимок только экрана, а значит
 * и полей не бывает». Прежний вариант `full` вписывал экран целиком по высоте
 * холста и добивал бока чёрным — то есть рисовал не скриншот, а скриншот НА
 * подложке. Экран целиком честно помещается только на холст с пропорцией
 * устройства (0,45), а у нас таких нет: Telegram 1,33, Дзен 1,78,
 * Instagram 0,8, Threads 1,0. Поэтому `full` убран, а кадр всегда занимает всю
 * площадь холста: ширина холста = ширина экрана, по высоте — обрезка сверху
 * или снизу, ровно как это делает человек перед публикацией.
 */
const DEVICES: [number, number][] = [
  [393, 873], // Pixel 7 / 8
  [390, 844], // iPhone 12–14
  [412, 915], // Pixel 6 Pro
  [375, 812], // iPhone X / 13 mini
  [360, 800], // массовый Android
];

export interface ScreenMetrics {
  /** Пикселей холста на 1 dp экрана. */
  dp: number;
  /** Размер экрана устройства в dp. */
  device: [number, number];
  /** Размер отрисованного экрана в пикселях холста. */
  screen: { width: number; height: number };
  framing: ScreenshotFraming;
  /** Сколько dp по высоте остаётся ленте сообщений. */
  chatDp: number;
}

export function screenMetrics(
  width: number,
  height: number,
  seed: string,
  requested?: ScreenshotFraming,
): ScreenMetrics {
  const device = DEVICES[pick(seed, "device", DEVICES.length)];
  const framing: ScreenshotFraming = requested ?? framingFor(seed);
  // Ширина холста = ширина экрана в любом кадре: полей у скриншота не бывает.
  const dp = width / device[0];
  // Верхний кадр отдаёт ленте всё, что осталось под строкой состояния и
  // шапкой; нижний — всё, что осталось над полем ввода.
  const chatDp = height / dp
    - (framing === "top" ? BAR_DP.status + BAR_DP.header : BAR_DP.panel);

  return { dp, device, screen: { width, height }, framing, chatDp };
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

/**
 * Хвостик пузыря — путь из веб-клиента Telegram, ПЕРЕСЧИТАННЫЙ В БОКС 11×20 dp.
 *
 * Дефект приёмки 2026-09-08: «хвостик исходящего пузыря смотрит вверх». Причина
 * не в рисунке, а в боксе. Путь взят из веб-клиента с его собственным
 * `viewBox 0 0 6 17` (отношение ширины к высоте 0,35), а Telegram рисует ту же
 * фигуру в боксе 11×20 (0,55). Бокс пути был принят за размер в dp — фигура
 * вышла в 1,6 раза уже и читалась как шип вверх, а не как хук у нижнего угла.
 *
 * Координаты пересчитаны ЧИСЛАМИ (x × 11/6, y × 20/17), а не растянуты
 * `preserveAspectRatio="none"`: у Satori свой разбор SVG, и полагаться на
 * тонкость масштабирования там, где уже молча пропадал хвостик от слитных
 * флагов дуги, незачем. Радиусы дуги пересчитаны теми же множителями.
 *
 * ⚠ Флаги дуги записаны через пробелы (`0 0 1`), а не слитно (`016`): слитную
 * сокращённую запись из веб-клиента разбирает браузер, но не Satori — хвостик
 * исходящего пузыря от неё пропадал молча, без ошибки в прогоне.
 */
export const TAIL_DP = { width: 11, height: 20 } as const;
//
// ⚠ И ВТОРАЯ ПОЛОВИНА ТОГО ЖЕ ДЕФЕКТА: фигуры стояли зеркально наоборот.
// Хвостик прирастает к пузырю ВДОЛЬ его боковой грани — то есть прямая
// вертикальная сторона фигуры смотрит В ПУЗЫРЬ, а наружу уходит вогнутая дуга.
// В прежней редакции прямая сторона стояла снаружи, и фигура читалась как
// отдельный шип вверх, приклеенный к пузырю одной нижней точкой. Имена теперь
// по СТОРОНЕ ЭКРАНА (`LEFT`/`RIGHT`), а не по типу сообщения: именно подмена
// «входящий ↔ левый» и позволила перепутать их молча.
const TAIL_RIGHT =
  "M11 20H0V0c.354 3.341 1.606 6.784 3.758 10.332 1.657 2.735 4.484 5.276 8.479 7.624A1.83 1.18 0 0 1 11 20z";
const TAIL_LEFT =
  "M0 20h11V0c-.354 3.341-1.606 6.784-3.758 10.332-1.657 2.735-4.484 5.276-8.479 7.624A1.83 1.18 0 0 0 0 20z";

/**
 * Какой край экрана попал в кадр.
 *
 * Владелец 2026-09-08: «Представь что ты — пользователь, который делает
 * скриншот реальной переписки — ты делаешь скриншот, а затем принимаешь решение
 * "обрезать его" или "не обрезать"». Обрезают всегда по краю: либо оставляют
 * низ с последними репликами и полем ввода (`bottom`), либо верх с шапкой и
 * началом видимой переписки (`top`). Оба кадра — настоящие куски экрана и оба
 * занимают холст целиком.
 *
 * Верхний кадр нужен не для разнообразия: только в нём видно имя собеседника и
 * подпись присутствия — то, ради чего шапка и рисовалась.
 */
export type ScreenshotFraming = "top" | "bottom";

export function framingFor(seed: string): ScreenshotFraming {
  return pick(seed, "framing", 10) < 4 ? "top" : "bottom";
}

export function ChatMockupArt(input: CoverInput) {
  const { width, height } = coverCanvas(input.platform);
  const metrics = screenMetrics(width, height, input.slotKey, input.framing);
  const { dp, framing, chatDp } = metrics;
  const px = (value: number) => Math.round(value * dp);

  const topic = input.topic ?? "general";
  const contact = contactFor(input.slotKey, topic);

  const maxBubbleDp = Math.round(metrics.device[0] * 0.74);
  const thread = buildThread({
    seed: input.slotKey,
    topic,
    quote: bubbleText(input.messageText || input.title, 150),
    reply: bubbleText(input.responsePreview || replyFor(input.slotKey, topic), 60),
    chatDp,
    maxBubbleDp,
    // В верхнем кадре реплика поста стоит НАВЕРХУ ленты: за нижний срез уходит
    // хвост переписки, а не то, ради чего картинка рисуется.
    anchor: framing === "top" ? "top" : "bottom",
  });
  const last = thread[thread.length - 1].time;
  const statusClock = formatClock(
    Number(last.slice(0, 2)) * 60 + Number(last.slice(3)) + 1 + pick(input.slotKey, "statusgap", 4),
  );

  const icon = (path: string, size: number, color: string, key: string) => (
    <svg key={key} width={px(size)} height={px(size)} viewBox="0 0 24 24" fill="none" style={{ display: "flex" }}>
      <path d={path} stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  /**
   * Короткое сообщение Telegram ставит время В ТУ ЖЕ строку, а переносит на
   * следующую только когда последняя строка длинная. Отдельная строка со
   * временем под коротким «ок» — заметный признак нарисованного интерфейса.
   */
  const INLINE_TIME_LIMIT = 28;

  /**
   * Текст пузыря. Эмодзи в Satori — картинка, а не символ: глифов эмодзи во
   * вшитом Roboto нет. Строка без эмодзи рисуется как была, одним узлом: путь
   * с переносом строк у Satori проверенный, и рисковать им на 90 % реплик,
   * которые эмодзи не содержат, незачем.
   */
  const bubbleBody = (text: string, color: string) => {
    const parts = segmentEmoji(text, input.emoji);
    if (parts.length <= 1) {
      return (
        <div style={{ display: "flex", fontSize: px(16), lineHeight: 1.28, color }}>
          {parts[0]?.value ?? text}
        </div>
      );
    }
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          fontSize: px(16),
          lineHeight: 1.28,
          color,
        }}
      >
        {parts.map((part, index) =>
          part.kind === "text" ? (
            <div key={`t${index}`} style={{ display: "flex" }}>{part.value}</div>
          ) : (
            <img
              key={`e${index}`}
              src={part.value}
              width={px(19)}
              height={px(19)}
              // Пробелы вокруг эмодзи Satori схлопывает на границе узлов —
              // воздух приходится задавать полями, иначе «шоке😳он».
              style={{ marginLeft: px(3), marginRight: px(3) }}
            />
          ),
        )}
      </div>
    );
  };

  const statusBar = (
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
      <div style={{ display: "flex", fontSize: px(12), fontWeight: 500, color: "#ffffff" }}>{statusClock}</div>
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
  );

  const header = (
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
          background: `linear-gradient(180deg, ${contact.fill[0]} 0%, ${contact.fill[1]} 100%)`,
          fontSize: px(18),
          fontWeight: 500,
          color: "#ffffff",
        }}
      >
        {contact.letter}
      </div>
      <div style={{ display: "flex", flexDirection: "column", marginLeft: px(12), flexGrow: 1 }}>
        <div style={{ display: "flex", fontSize: px(16), fontWeight: 500, color: TG.barTitle }}>
          {contact.name}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: px(13),
            color: contact.presence === "в сети" || contact.presence === "печатает…"
              ? TG.online
              : TG.barSubtitle,
            marginTop: px(1),
          }}
        >
          {contact.presence}
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
  );

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        // Полей у скриншота не бывает: экран занимает холст целиком, а лишнее
        // уходит за срез — сверху или снизу, смотря какой кадр.
        backgroundColor: TG.wallpaper,
        fontFamily: "Roboto",
        color: TG.inText,
      }}
    >
      {framing === "top" ? statusBar : null}
      {framing === "top" ? header : null}

      {/* Лента. В нижнем кадре прижата книзу и обрезана сверху, в верхнем —
          начинается под шапкой и уходит за нижний срез. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          // ⚠ Только `flexGrow` мало: длинная лента выдавливала поле ввода за
          // нижний край холста — на широком Дзене этого не видно ни в одном
          // прогоне, только на отрисованном PNG.
          flexGrow: 1,
          flexShrink: 1,
          minHeight: 0,
          justifyContent: framing === "top" ? "flex-start" : "flex-end",
          overflow: "hidden",
          padding: `${px(8)}px ${px(9)}px`,
        }}
      >
        {thread.map((line, index) => {
          const next = thread[index + 1];
          // Хвостик — только у последнего пузыря серии, как в Telegram.
          const tailed = !next || next.side !== line.side;
          const inline = line.text.length <= INLINE_TIME_LIMIT;
          const isIn = line.side === "in";
          const radius = px(12);
          return (
            <div
              key={`m${index}`}
              style={{
                display: "flex",
                justifyContent: isIn ? "flex-start" : "flex-end",
                // 11 dp — ширина хвостика: он рисуется ЗА гранью пузыря, и без
                // этого запаса его кончик упирался в край экрана, чего в
                // Telegram не бывает (там от кончика до края те же ~9 dp).
                padding: `0 ${px(TAIL_DP.width)}px`,
                // Отступ задаёт ПРЕДЫДУЩЕЕ сообщение: серия с одной стороны в
                // Telegram стоит плотно (2 dp), смена стороны — с воздухом.
                marginTop: index === 0 ? 0 : px(thread[index - 1].side === line.side ? 2 : 6),
              }}
            >
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  position: "relative",
                  maxWidth: `${px(maxBubbleDp)}px`,
                  // ⚠ Исходящий пузырь ЗАЛИТ РОВНО, без градиента. Владелец
                  // увидел «артефакты синего bubble справа внизу, будто
                  // наложение изображения»: хвостик рисуется отдельной фигурой
                  // и заливался конечным цветом градиента, а сам пузырь в этом
                  // месте был светлее — шов на стыке и читался как накладка. В
                  // Telegram градиент к тому же общий на весь чат, а не свой у
                  // каждого пузыря, так что ровная заливка ещё и ближе к
                  // эталону.
                  backgroundColor: isIn ? TG.inBubble : TG.outBubbleTop,
                  borderRadius: tailed
                    ? isIn
                      ? `${radius}px ${radius}px ${radius}px 0`
                      : `${radius}px ${radius}px 0 ${radius}px`
                    : `${radius}px`,
                  padding: `${px(7)}px ${px(10)}px ${px(6)}px ${px(10)}px`,
                }}
              >
                {tailed ? (
                  <svg
                    width={px(TAIL_DP.width)}
                    height={px(TAIL_DP.height)}
                    viewBox={`0 0 ${TAIL_DP.width} ${TAIL_DP.height}`}
                    fill="none"
                    style={{
                      position: "absolute",
                      ...(isIn
                        ? { left: `${-px(TAIL_DP.width)}px` }
                        : { right: `${-px(TAIL_DP.width)}px` }),
                      bottom: 0,
                      display: "flex",
                    }}
                  >
                    <path d={isIn ? TAIL_LEFT : TAIL_RIGHT} fill={isIn ? TG.inBubble : TG.outBubbleTop} />
                  </svg>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    flexDirection: inline ? "row" : "column",
                    alignItems: inline ? "flex-end" : "stretch",
                  }}
                >
                  {bubbleBody(line.text, isIn ? TG.inText : TG.outText)}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      alignSelf: "flex-end",
                      marginTop: inline ? px(4) : px(2),
                      marginLeft: inline ? px(6) : 0,
                      gap: px(3),
                      fontSize: px(12),
                      color: isIn ? TG.inTime : TG.outTime,
                    }}
                  >
                    <span style={{ display: "flex" }}>{line.time}</span>
                    {isIn ? null : (
                      <svg width={px(16)} height={px(11)} viewBox="0 0 16 11" fill="none" style={{ display: "flex" }}>
                        <path d="M1 6.2 3.6 8.8 9.2 1.6" stroke={TG.check} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                        <path d="M6.4 6.6 8.4 8.8 14.6 1.6" stroke={TG.check} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Поле ввода — 48 dp: смайл, подсказка, скрепка, микрофон. В верхнем
          кадре его нет: оно осталось ниже среза. */}
      {framing === "bottom" ? (
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
      ) : null}
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
