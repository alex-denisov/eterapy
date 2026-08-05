"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { track } from "@/lib/analytics";

export interface TarotDayCardProps {
  cardKey: string;
  cardName: string;
  reversed: boolean;
  /** Ссылка на собранную картинку карты (`/api/cards/day/<key>`). */
  imageUrl: string;
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
 *
 * Текст приходит дважды. Первый — с сервера, детерминированный или из кэша:
 * он уже осмысленный и рисуется мгновенно, поэтому первый экран никогда не
 * ждёт модель и не показывает скелет. Второй — из `/api/cabinet/daily-card/
 * tarot` после отрисовки: если развёрнутая трактовка этой карты ещё не
 * сгенерирована, маршрут сгенерирует её и положит в общий кэш, и текст
 * заменится на месте.
 *
 * Отдельного состояния «загрузка» здесь нет намеренно: нечего загружать —
 * содержимое уже на экране.
 */
export function TarotDayCard(props: TarotDayCardProps) {
  const [text, setText] = useState({
    headline: props.headline,
    body: props.body,
    focus: props.focus,
    question: props.question,
  });

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

  return (
    <section className="soft-card mt-5 overflow-hidden p-0" data-testid="client-tarot-day">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:gap-6">
        <div className="mx-auto w-[148px] shrink-0 sm:mx-0 sm:w-[164px]">
          <Image
            src={props.artworkUrl}
            alt={`${props.cardName}, ${props.reversed ? "перевёрнутое положение" : "прямое положение"}`}
            width={330}
            height={562}
            className="w-full rounded-xl"
            style={{
              // Перевёрнутая карта показывается перевёрнутой: это её положение,
              // а не декор. Подпись под картинкой называет положение словами.
              transform: props.reversed ? "rotate(180deg)" : undefined,
              boxShadow: "0 18px 40px -24px rgba(20, 16, 38, 0.8)",
            }}
            priority
          />
          <p className="mt-2 text-center text-[11px]" style={{ color: "var(--soft-ink-faint)" }}>
            {props.cardName} · {props.reversed ? "перевёрнутая" : "прямая"}
          </p>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <p className="soft-eyebrow">карта дня · {props.dayLabel}</p>
          <h2 className="mt-2 font-heading text-lg font-semibold" data-testid="tarot-day-headline">
            {text.headline}
          </h2>
          <p className="mt-2 text-[13px] leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
            {text.body}
          </p>
          <p className="mt-3 text-[13px] leading-relaxed">{text.focus}</p>
          <p className="mt-3 text-[13px] italic leading-relaxed" style={{ color: "var(--soft-ink-soft)" }}>
            {text.question}
          </p>

          {props.showCta ? (
            <div className="mt-auto pt-4">
              <Link
                href="/products/tarot"
                className="soft-button-primary inline-flex min-h-11 w-fit items-center gap-2 rounded-full px-4 text-[13px] font-semibold"
                onClick={() => track({ event: "tarot_day_cta_clicked", surface: "cabinet", properties: { card: props.cardKey } })}
              >
                Разложить карты на свой вопрос <ArrowRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>
          ) : null}

          {/* Зона названа вслух: карта меняется по Москве, и человек во
              Владивостоке должен видеть причину, а не считать это сбоем. */}
          <p className="mt-3 text-[11px]" style={{ color: "var(--soft-ink-faint)" }}>
            Карта меняется каждое утро по московскому времени.
          </p>
        </div>
      </div>
    </section>
  );
}
