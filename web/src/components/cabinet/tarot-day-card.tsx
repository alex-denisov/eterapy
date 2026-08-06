"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, ChevronDown, X } from "lucide-react";
import { track } from "@/lib/analytics";

export interface TarotDayCardProps {
  cardKey: string;
  cardName: string;
  reversed: boolean;
  /** Оригинальный скан из `public/tarot` — его и показываем в кабинете. */
  artworkUrl: string;
  dayLabel: string;
  headline: string;
  body: string;
  focus: string;
  question: string;
  /** Кризисная страховка: платный призыв скрывается вместе с остальной монетизацией. */
  showCta: boolean;
}

interface TarotDayResponse {
  interpretation?: { headline?: string; body?: string; focus?: string; question?: string };
}

/**
 * B678 — «карта дня» первым блоком кабинета.
 * B681 — блок сжат до одной строки, и его можно убрать.
 *
 * СВЁРНУТОЕ СОСТОЯНИЕ — ОСНОВНОЕ. B678 разворачивал сразу всё: картинку в
 * 148–164 px, заголовок, тело, фокус, вопрос, кнопку и строку про часовой пояс.
 * Блок съедал половину первого экрана, и кабинет начинался с Таро, а не с
 * работы человека. Теперь по умолчанию видны миниатюра, имя карты и одна
 * строка сути; остальное — под «Подробнее».
 *
 * РАЗВОРОТ НЕ ЗАПОМИНАЕТСЯ между заходами намеренно: это взгляд на сегодня, а
 * не настройка. Настройка здесь ровно одна — «Скрыть».
 *
 * ТЕКСТ ПРИХОДИТ ДВАЖДЫ. Первый — с сервера, детерминированный или из кэша: он
 * уже осмысленный и рисуется мгновенно, поэтому первый экран никогда не ждёт
 * модель и не показывает скелет. Второй — из `/api/cabinet/daily-card/tarot`
 * после отрисовки: если развёрнутой трактовки этой карты ещё нет, маршрут
 * сгенерирует её и положит в общий кэш, и текст заменится на месте.
 */
export function TarotDayCard(props: TarotDayCardProps) {
  const [text, setText] = useState({
    headline: props.headline,
    body: props.body,
    focus: props.focus,
    question: props.question,
  });
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    let cancelled = false;
    track({ event: "tarot_day_viewed", surface: "cabinet", properties: { card: props.cardKey } });

    fetch("/api/cabinet/daily-card/tarot")
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: TarotDayResponse | null) => {
        const next = payload?.interpretation;
        if (cancelled || !next?.headline || !next.body || !next.focus || !next.question) return;
        setText({ headline: next.headline, body: next.body, focus: next.focus, question: next.question });
      })
      .catch(() => { /* на экране уже есть рабочий текст */ });

    return () => { cancelled = true; };
  }, [props.cardKey]);

  /**
   * Скрытие применяется на месте и не ждёт ответа сервера: блок убирается
   * сразу, запись идёт следом. Если запрос не дойдёт, человек увидит карту при
   * следующем заходе — это мягче, чем держать его перед блоком, который он уже
   * попросил убрать.
   */
  function hide() {
    setHidden(true);
    track({ event: "tarot_day_hidden", surface: "cabinet", properties: { card: props.cardKey } });
    void fetch("/api/cabinet/daily-card/tarot", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visible: false }),
    }).catch(() => { /* см. комментарий выше */ });
  }

  if (hidden) return null;

  return (
    <section className="soft-card mt-4 overflow-hidden p-0" data-testid="client-tarot-day">
      <div className="flex items-start gap-3 p-3 sm:gap-4 sm:p-4">
        <Image
          src={props.artworkUrl}
          alt={`${props.cardName}, ${props.reversed ? "перевёрнутое положение" : "прямое положение"}`}
          width={330}
          height={562}
          className="w-14 shrink-0 rounded-lg sm:w-[72px]"
          style={{
            // Перевёрнутая карта показывается перевёрнутой: это её положение, а
            // не декор. Подпись рядом называет положение словами.
            transform: props.reversed ? "rotate(180deg)" : undefined,
            boxShadow: "0 10px 24px -18px rgba(20, 16, 38, 0.8)",
          }}
        />

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-2">
            <p className="soft-eyebrow truncate">карта дня · {props.dayLabel}</p>
            {/* Флажок «показывать» (задача владельца). Убирает блок насовсем;
                вернуть можно только в «Настройки → Уведомления», и подсказка
                говорит об этом до нажатия, а не после. */}
            <button
              type="button"
              onClick={hide}
              data-testid="tarot-day-hide"
              title="Скрыть. Вернуть — в «Настройки → Уведомления»"
              aria-label="Скрыть карту дня. Вернуть можно в настройках уведомлений"
              className="-m-1 shrink-0 rounded-full p-1 transition-colors hover:bg-[var(--soft-paper-deep)]"
              style={{ color: "var(--soft-ink-faint)" }}
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>

          <h2 className="mt-0.5 font-heading text-[15px] font-semibold leading-snug" data-testid="tarot-day-headline">
            {text.headline}
          </h2>
          <p className="mt-0.5 text-[12px]" style={{ color: "var(--soft-ink-faint)" }}>
            {props.cardName} · {props.reversed ? "перевёрнутая" : "прямая"}
          </p>

          {/* Свёрнутая суть — не больше двух строк: длинный фокус иначе
              разворачивает блок обратно на пол-экрана телефона. */}
          {!expanded ? (
            <p className="mt-1.5 line-clamp-2 text-[13px] leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
              {text.focus}
            </p>
          ) : null}

          {expanded ? (
            <div className="mt-1.5" data-testid="tarot-day-details">
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                {text.body}
              </p>
              <p className="mt-2 text-[13px] leading-relaxed">{text.focus}</p>
              <p className="mt-2 text-[13px] italic leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
                {text.question}
              </p>

              {props.showCta ? (
                <Link
                  href="/products/tarot"
                  className="soft-button-primary mt-3 inline-flex min-h-10 w-fit items-center gap-2 rounded-full px-4 text-[13px] font-semibold"
                  onClick={() => track({ event: "tarot_day_cta_clicked", surface: "cabinet", properties: { card: props.cardKey } })}
                >
                  Разложить карты на свой вопрос <ArrowRight className="size-3.5" aria-hidden="true" />
                </Link>
              ) : null}

              {/* Зона названа вслух: карта меняется по Москве, и человек во
                  Владивостоке должен видеть причину, а не считать это сбоем. */}
              <p className="mt-2 text-[11px]" style={{ color: "var(--soft-ink-faint)" }}>
                Карта меняется каждое утро по московскому времени.
              </p>
            </div>
          ) : null}

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            data-testid="tarot-day-toggle"
            aria-expanded={expanded}
            className="mt-1.5 inline-flex w-fit items-center gap-1 text-[12px] font-medium"
            style={{ color: "var(--soft-bordeaux)" }}
          >
            {expanded ? "Свернуть" : "Подробнее"}
            <ChevronDown
              className="size-3.5 transition-transform"
              style={{ transform: expanded ? "rotate(180deg)" : undefined }}
              aria-hidden="true"
            />
          </button>
        </div>
      </div>
    </section>
  );
}
