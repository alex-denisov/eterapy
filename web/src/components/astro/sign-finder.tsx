"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DISPLAY_TIME_ZONE, formatTransitMoment, localInputToUtc } from "@/lib/astro/transit-format";

/**
 * B711 · «Где моя Луна» — калькулятор на странице ячейки сетки.
 *
 * ⚠ ЭТО ТО, ЧТО ОТЛИЧАЕТ СЕТКУ ОТ ДОРВЕЯ. Триста страниц с трактовками — это
 * переоптимизация. Триста страниц, каждая из которых СЧИТАЕТ по введённой дате
 * и уводит в нужную ячейку, если знак другой, — это инструмент. Убрать отсюда
 * расчёт означает превратить весь корпус в то, что фильтруют (разбор — B711).
 *
 * ⚠ ЭФЕМЕРИДЫ ГРУЗЯТСЯ ПО НАЖАТИЮ, А НЕ ПРИ ОТКРЫТИИ. `astronomy-engine` — это
 * ~50 КБ в сжатом виде: статический импорт положил бы их в бандл каждой из ста
 * двадцати страниц ради тех, кто нажмёт кнопку. Динамический импорт внутри
 * обработчика уводит библиотеку в отдельный кусок, который скачивается только
 * при расчёте.
 *
 * ⚠ РАСЧЁТ ОДИН НА ВЕСЬ ПРОЕКТ. Считает `lib/astro/ecliptic` — тот же модуль,
 * которым колесо натальной карты строит свои положения. Вторая реализация
 * «попроще для клиента» разошлась бы с первой молча.
 */

export type FinderTarget = {
  signKey: string;
  name: string;
  /** Готовая форма с предлогом: «в Скорпионе», «во Льве». Склонять здесь нечем. */
  prepositional: string;
  /** Адрес ячейки. `null` — знак этой строки ещё не выложен (волны). */
  path: string | null;
};

type Result =
  | { kind: "exact"; signKey: string }
  | { kind: "boundary"; firstKey: string; secondKey: string; at: string };

const MIN_YEAR = 1900;
const MAX_YEAR = 2100;

export function SignFinder({
  planetKey,
  planetName,
  possessive,
  changedVerb,
  currentSignKey,
  targets,
}: {
  planetKey: string;
  planetName: string;
  /** «ваша» / «ваш» / «ваше» — род приходит готовым, чтобы ось не ехала в бандл. */
  possessive: string;
  /** «сменила» / «сменил» / «сменило». */
  changedVerb: string;
  currentSignKey: string;
  targets: readonly FinderTarget[];
}) {
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const targetByKey = new Map(targets.map((item) => [item.signKey, item]));

  async function calculate(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setResult(null);

    const parts = date.split("-").map(Number);
    if (parts.length !== 3 || parts.some((value) => !Number.isFinite(value))) {
      setError("Укажите дату рождения — без неё считать нечего.");
      return;
    }
    const [year, month, day] = parts;
    if (year < MIN_YEAR || year > MAX_YEAR) {
      setError(`Расчёт рассчитан на даты с ${MIN_YEAR} по ${MAX_YEAR} год.`);
      return;
    }

    setPending(true);
    try {
      const { planetSignAt, signTransits } = await import("@/lib/astro/sign-transits");

      if (time) {
        const [hours, minutes] = time.split(":").map(Number);
        const at = localInputToUtc(year, month, day, hours || 0, minutes || 0);
        setResult({ kind: "exact", signKey: planetSignAt(planetKey, at).key });
        return;
      }

      // Времени нет. У быстрых светил знак за сутки может смениться, и честный
      // ответ здесь — назвать оба знака и момент перехода, а не выбрать один.
      const dayStart = localInputToUtc(year, month, day, 0, 0);
      const dayEnd = localInputToUtc(year, month, day, 23, 59);
      const first = planetSignAt(planetKey, dayStart);
      const second = planetSignAt(planetKey, dayEnd);
      if (first.key === second.key) {
        setResult({ kind: "exact", signKey: first.key });
        return;
      }
      const [opening] = signTransits(planetKey, first.key, dayStart, dayEnd);
      setResult({
        kind: "boundary",
        firstKey: first.key,
        secondKey: second.key,
        at: opening ? formatTransitMoment(opening.end) : "",
      });
    } catch {
      setError("Не получилось посчитать. Проверьте дату и попробуйте ещё раз.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section
      className="soft-card mt-12 max-w-3xl p-6 md:p-7"
      aria-labelledby="sign-finder-title"
      data-testid="sign-finder"
    >
      <h2 id="sign-finder-title" className="soft-h3">
        Где {possessive} {planetName}
      </h2>
      <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
        Введите дату рождения — посчитаем положение по эфемеридам и покажем ваш знак. Если он
        окажется другим, отсюда есть переход на нужную страницу.
      </p>

      <form className="mt-5" onSubmit={calculate}>
        <div className="flex flex-wrap gap-4">
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-[var(--soft-ink-soft)]">
            Дата рождения
            <input
              type="date"
              value={date}
              onChange={(event) => setDate(event.target.value)}
              min={`${MIN_YEAR}-01-01`}
              max={`${MAX_YEAR}-12-31`}
              required
              className="soft-input"
              data-testid="sign-finder-date"
            />
          </label>
          <label className="flex min-w-0 flex-1 flex-col gap-1.5 text-sm text-[var(--soft-ink-soft)]">
            Время, если известно
            <input
              type="time"
              value={time}
              onChange={(event) => setTime(event.target.value)}
              className="soft-input"
              data-testid="sign-finder-time"
            />
          </label>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--soft-ink-faint)]">
          Время считается московским ({DISPLAY_TIME_ZONE}). Без времени мы всё равно ответим, а
          если в этот день был переход — назовём оба знака и час смены.
        </p>
        <button type="submit" className="soft-button soft-button-primary mt-4" disabled={pending}>
          {pending ? "Считаем…" : "Показать знак"}
        </button>
      </form>

      <div aria-live="polite" className="mt-5">
        {error && (
          <p className="text-sm text-[var(--soft-terracotta-dark)]" data-testid="sign-finder-error">
            {error}
          </p>
        )}
        {result?.kind === "exact" && (
          <FinderAnswer
            planetName={planetName}
            target={targetByKey.get(result.signKey)}
            isCurrent={result.signKey === currentSignKey}
          />
        )}
        {result?.kind === "boundary" && (
          <div data-testid="sign-finder-result">
            <p className="text-base leading-relaxed text-[var(--soft-ink)]">
              В этот день {planetName} {changedVerb} знак
              {result.at ? ` — ${result.at} по Москве` : ""}. До перехода —{" "}
              {targetByKey.get(result.firstKey)?.name ?? "другой знак"}, после —{" "}
              {targetByKey.get(result.secondKey)?.name ?? "другой знак"}. Точный ответ даёт время
              рождения.
            </p>
            <ul className="mt-3 space-y-2">
              {[result.firstKey, result.secondKey].map((key) => {
                const target = targetByKey.get(key);
                if (!target?.path) return null;
                return (
                  <li key={key}>
                    <Link
                      href={target.path}
                      className="inline-flex items-center gap-1.5 text-sm text-[var(--soft-bordeaux)] underline underline-offset-2"
                    >
                      {planetName} {target.prepositional}
                      <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
}

function FinderAnswer({
  planetName,
  target,
  isCurrent,
}: {
  planetName: string;
  target: FinderTarget | undefined;
  isCurrent: boolean;
}) {
  if (!target) return null;
  return (
    <div data-testid="sign-finder-result">
      <p className="text-base leading-relaxed text-[var(--soft-ink)]">
        {planetName} у вас {target.prepositional}.
        {isCurrent ? " Это как раз та страница, которую вы читаете." : ""}
      </p>
      {!isCurrent && target.path && (
        <Link
          href={target.path}
          className="mt-2 inline-flex items-center gap-1.5 text-sm text-[var(--soft-bordeaux)] underline underline-offset-2"
        >
          Открыть разбор: {planetName} {target.prepositional}
          <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
        </Link>
      )}
      {!isCurrent && !target.path && (
        <p className="mt-2 text-sm text-[var(--soft-ink-faint)]">
          Разбор этого знака ещё готовится — он появится в этой же сетке.
        </p>
      )}
    </div>
  );
}
