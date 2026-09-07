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
 * B725 — Диалоговый мокап чата для разбора переписок (0 токенов, чистый SVG/Satori).
 * Стилизованный нейтральный интерфейс мессенджера со входящим сообщением и плашкой разбора Ани.
 */
export function ChatMockupArt(input: CoverInput) {
  const { width, height } = coverCanvas(input.platform);
  const theme = coverThemeFor({
    key: input.slotKey,
    platform: input.platform,
    scheduledFor: input.scheduledFor,
  });

  const rawMsg = input.messageText || input.title;
  const quoteMatch = /[«"]([^»"]+)[»"]/u.exec(rawMsg);
  const quote = quoteMatch ? quoteMatch[1] : rawMsg;
  const quoteDisplay = `«${quote}»`;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
        backgroundColor: "#0B0F19",
        color: "#F1F5F9",
        fontFamily: "Arial, sans-serif",
        padding: `${Math.round(height * 0.05)}px ${Math.round(width * 0.06)}px`,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-15%",
          right: "-10%",
          width: `${Math.round(width * 0.7)}px`,
          height: `${Math.round(width * 0.7)}px`,
          borderRadius: "999px",
          display: "flex",
          background: `radial-gradient(circle, rgba(${theme.warm}, 0.25) 0%, rgba(15, 23, 42, 0) 70%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          bottom: "-20%",
          left: "-10%",
          width: `${Math.round(width * 0.8)}px`,
          height: `${Math.round(width * 0.8)}px`,
          borderRadius: "999px",
          display: "flex",
          background: `radial-gradient(circle, rgba(${theme.cool}, 0.2) 0%, rgba(15, 23, 42, 0) 70%)`,
        }}
      />

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          width: "100%",
          paddingBottom: `${Math.round(height * 0.02)}px`,
          borderBottom: "1px solid rgba(255, 255, 255, 0.1)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              width: `${Math.round(height * 0.055)}px`,
              height: `${Math.round(height * 0.055)}px`,
              borderRadius: "999px",
              backgroundColor: "rgba(255, 255, 255, 0.12)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: `${Math.round(height * 0.024)}px`,
              color: "#E2E8F0",
              fontWeight: 700,
            }}
          >
            Он
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: `${Math.round(height * 0.028)}px`, fontWeight: 700, color: "#FFFFFF" }}>
              Диалог в 01:42
            </div>
            <div style={{ display: "flex", fontSize: `${Math.round(height * 0.02)}px`, color: "#94A3B8" }}>
              был(а) только что
            </div>
          </div>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            backgroundColor: "rgba(255, 255, 255, 0.06)",
            padding: "8px 16px",
            borderRadius: "999px",
            fontSize: `${Math.round(height * 0.022)}px`,
            color: "#CBD5E1",
            fontWeight: 600,
          }}
        >
          <div
            style={{
              width: "10px",
              height: "10px",
              borderRadius: "999px",
              display: "flex",
              backgroundColor: "#22C55E",
            }}
          />
          eTerapy
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: `${Math.round(height * 0.03)}px`,
          margin: `${Math.round(height * 0.04)}px 0`,
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignSelf: "flex-start",
            maxWidth: "85%",
            backgroundColor: "rgba(30, 41, 59, 0.85)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "24px 24px 24px 6px",
            padding: `${Math.round(height * 0.035)}px ${Math.round(width * 0.04)}px`,
            boxShadow: "0 12px 32px rgba(0, 0, 0, 0.3)",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: `${Math.round(height * (quote.length > 80 ? 0.036 : 0.042))}px`,
              lineHeight: 1.3,
              fontWeight: 600,
              color: "#F8FAFC",
            }}
          >
            {quoteDisplay}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: `${Math.round(height * 0.018)}px`,
              color: "#64748B",
              alignSelf: "flex-end",
              marginTop: "10px",
            }}
          >
            01:42
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignSelf: "flex-end",
            maxWidth: "75%",
            backgroundColor: `rgba(${theme.warm}, 0.22)`,
            border: `1px solid rgba(${theme.warm}, 0.45)`,
            borderRadius: "24px 24px 6px 24px",
            padding: `${Math.round(height * 0.024)}px ${Math.round(width * 0.035)}px`,
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: `${Math.round(height * 0.028)}px`,
              fontWeight: 500,
              color: "#E2E8F0",
            }}
          >
            {input.responsePreview || "Что ответить, чтобы не пожалеть?"}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: `${Math.round(height * 0.018)}px`,
              color: "rgba(255, 255, 255, 0.6)",
              alignSelf: "flex-end",
              marginTop: "8px",
            }}
          >
            <span style={{ display: "flex" }}>01:45 · Прочитано</span>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="none" style={{ display: "flex" }}>
              <path d="M1 6.5L4.5 10L11 2" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M5 6.5L8.5 10L15 2" stroke="#60A5FA" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "10px",
          backgroundColor: "rgba(15, 23, 42, 0.95)",
          border: `1px solid rgba(${theme.warm}, 0.5)`,
          borderRadius: "20px",
          padding: `${Math.round(height * 0.03)}px ${Math.round(width * 0.04)}px`,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            fontSize: `${Math.round(height * 0.022)}px`,
            color: `rgb(${theme.warm})`,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "2px",
          }}
        >
          <div
            style={{
              width: "8px",
              height: "8px",
              borderRadius: "999px",
              display: "flex",
              backgroundColor: `rgb(${theme.warm})`,
            }}
          />
          РАЗБОР АНИ · КУРАТОР ETERAPY
        </div>
        <div
          style={{
            display: "flex",
            fontSize: `${Math.round(height * 0.03)}px`,
            fontWeight: 700,
            color: "#FFFFFF",
            lineHeight: 1.25,
          }}
        >
          {input.eyebrow || "Скрытый мотив: почему мы читаем между строк вместо вопроса"}
        </div>
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
