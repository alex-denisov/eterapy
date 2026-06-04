import { ArrowRight, Share2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { guardClientCabinet } from "@/lib/cabinet-access";

export default async function MyMap() {
  const session = await auth();
  guardClientCabinet(session?.user?.role); // Y6: client-only surface
  return (
    <div className="fade-in px-4 py-8 md:px-8" data-testid="app-shell-main">
      <div className="mx-auto max-w-6xl">
        {/* Header */}
        <div className="mb-8 md:flex md:items-end md:justify-between">
          <div>
            <div className="text-xs font-sans font-semibold uppercase tracking-[0.16em] text-[var(--soft-ink-faint)]">
              Моя карта
            </div>
            <h1 className="mt-2 font-[var(--font-heading-v4)] text-3xl font-semibold text-[var(--soft-bordeaux)] md:text-4xl">
              Вот что мы <em className="font-[var(--font-heading-v4)] italic text-[var(--soft-terracotta-dark)]">услышали</em> за этот месяц
            </h1>
            <p className="mt-3 max-w-2xl text-base leading-relaxed text-[var(--soft-ink-soft)]">
              Личное пространство ваших разборов, инсайтов и сценариев. Видите только вы.
            </p>
          </div>
          <div className="mt-4 flex gap-3 md:mt-0">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--soft-paper-deep)] px-3 py-1.5 text-xs text-[var(--soft-ink-faint)]">
              <Share2 className="size-3" />
              Приватный режим
            </span>
            <button className="rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-4 py-2 text-sm font-medium text-[var(--soft-ink-soft)] transition-colors hover:border-[var(--soft-terracotta)] hover:text-[var(--soft-bordeaux)]">
              Настройки приватности
            </button>
          </div>
        </div>

        {/* Big insight card */}
        <div className="mb-8 rounded-[var(--r-xl)] bg-[linear-gradient(140deg,_#FFFCF5,_#F4D9C1,_#E8C4B8)] p-8 md:p-10 shadow-[var(--shadow-lg)]">
          <div className="mb-4 text-xs font-sans font-semibold uppercase tracking-[0.16em] text-[var(--soft-bordeaux)]">
            Центральный инсайт месяца
          </div>
          <blockquote className="font-[var(--font-heading-v4)] text-2xl font-medium italic leading-relaxed text-[var(--soft-bordeaux)] md:text-[28px]">
            «Я часто путаю усталость с разлюбленностью. Когда я отдыхаю — мир снова становится мягким.»
          </blockquote>
          <div className="mt-6 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--soft-paper-card)] px-3 py-1.5 text-sm text-[var(--soft-bordeaux)]">
              Отношения
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--soft-paper-card)] px-3 py-1.5 text-sm text-[var(--soft-bordeaux)]">
              Самооценка
            </span>
            <button className="inline-flex items-center gap-2 rounded-full bg-[var(--soft-terracotta)] px-4 py-1.5 text-sm font-semibold text-white shadow-[0_8px_22px_-10px_rgba(214,117,88,0.7),_inset_0_-2px_0_rgba(0,0,0,0.08)] transition-transform hover:bg-[var(--soft-terracotta-dark)] hover:-translate-y-[2px]">
              Поделиться
              <Share2 className="size-3.5" />
            </button>
          </div>
        </div>

        {/* Scenarios section */}
        <div className="mb-8">
          <h2 className="font-[var(--font-heading-v4)] text-2xl font-semibold text-[var(--soft-bordeaux)] mb-6">
            Повторяющийся сценарий
          </h2>
          <div className="rounded-[var(--r-lg)] bg-[linear-gradient(140deg,_#E8C4B8,_#F4D5C8)] p-6 md:p-8 shadow-[var(--shadow-md)]">
            <div className="mb-3 text-xs font-sans font-semibold uppercase tracking-[0.16em] text-[var(--soft-bordeaux)]">
              Сценарий «Близость»
            </div>
            <p className="font-[var(--font-heading-v4)] text-xl font-medium leading-relaxed text-[var(--soft-bordeaux)] md:text-2xl">
              Сначала <em className="italic text-[var(--soft-terracotta-dark)]">уменьшаюсь</em> — потом обижаюсь, что меня не видно.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
              Замечен в 4 из 6 разборов за последние 30 дней. Возможно, маршрут «7 дней к ясности: возвращение к себе» сейчас будет уместен.
            </p>
            <div className="mt-6 flex flex-wrap gap-4">
              <button className="inline-flex items-center gap-2 rounded-full bg-[var(--soft-terracotta)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_22px_-10px_rgba(214,117,88,0.7)] transition-transform hover:bg-[var(--soft-terracotta-dark)] hover:-translate-y-[2px]">
                Начать маршрут
                <ArrowRight className="size-4" />
              </button>
              <button className="inline-flex items-center gap-2 rounded-full border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] px-5 py-2.5 text-sm font-medium text-[var(--soft-bordeaux)] transition-colors hover:border-[var(--soft-terracotta)] hover:bg-[var(--soft-apricot)]">
                Подобрать специалиста
              </button>
            </div>
          </div>
        </div>

        {/* Themes */}
        <div className="mb-8">
          <h2 className="font-[var(--font-heading-v4)] text-2xl font-semibold text-[var(--soft-bordeaux)] mb-6">
            Главные темы
          </h2>
          <div className="flex flex-wrap gap-3">
            {["Границы", "Работа", "Самооценка", "Тело", "Карьера", "Родители"].map((theme, i) => (
              <span
                key={theme}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-medium transition-colors cursor-pointer",
                  i < 2
                    ? "bg-[var(--soft-rose)] text-[var(--soft-bordeaux)] border border-[var(--soft-rose)]"
                    : "bg-[var(--soft-paper-deep)] text-[var(--soft-ink-soft)] border border-[var(--soft-paper-edge)] hover:border-[var(--soft-terracotta)]"
                )}
              >
                {theme}
                <span className="text-xs opacity-50">{[12, 8, 6, 4, 3, 2][i]}</span>
              </span>
            ))}
          </div>
        </div>

        {/* 7 Days route progress */}
        <div className="mb-8 rounded-[var(--r-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xs font-sans font-semibold uppercase tracking-[0.16em] text-[var(--soft-bordeaux)] mb-2">
                Маршрут в работе
              </div>
              <h3 className="font-[var(--font-heading-v4)] text-xl font-semibold text-[var(--soft-bordeaux)]">
                7 дней к ясности
              </h3>
              <p className="mt-2 text-sm text-[var(--soft-ink-soft)]">
                День 4 из 7 · «Возвращение к себе»
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--soft-apricot)] px-3 py-1.5 text-xs font-semibold text-[var(--soft-bordeaux)]">
              Активен
            </span>
          </div>
          {/* Progress dots */}
          <div className="mt-6 flex gap-2">
            {[true, true, true, true, false, false, false].map((done, i) => (
              <div
                key={i}
                className={cn(
                  "h-2.5 flex-1 rounded-full transition-colors",
                  done ? "bg-[var(--soft-terracotta)]" : i === 4 ? "bg-[var(--soft-bordeaux)] scale-110" : "bg-[var(--soft-paper-edge)]"
                )}
              />
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between">
            <span className="text-xs text-[var(--soft-ink-faint)]">День 4 из 7</span>
            <button className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-terracotta-dark)] hover:underline underline-offset-4">
              Продолжить день 4 →
            </button>
          </div>
        </div>

        {/* Recent questions */}
        <div>
          <h2 className="font-[var(--font-heading-v4)] text-2xl font-semibold text-[var(--soft-bordeaux)] mb-6">
            Недавние разборы
          </h2>
          <div className="flex flex-col gap-3">
            {[
              ["Вчера", "О границах с мамой", "Первичный разбор", "отношения · границы"],
              ["3 дня назад", "Стоит ли менять работу", "4 ракурса", "работа · переход"],
              ["Неделю назад", "Тревога перед поездкой к родителям", "Первичный разбор", "родители · тревога"],
              ["2 недели назад", "Разбор переписки с Д.", "Разбор переписки", "отношения"],
            ].map(([date, title, type, tags], i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-4 border-t border-[var(--soft-paper-edge)] px-4 py-3 first:border-t-0 first:pt-0 transition-colors hover:bg-[var(--soft-paper-deep)] rounded-lg cursor-pointer"
              >
                <div className="flex items-start gap-4 min-w-0 flex-1">
                  <span className="shrink-0 text-xs text-[var(--soft-ink-faint)] w-20">{date}</span>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-[var(--soft-ink)]">{title}</p>
                    <p className="mt-1 text-xs text-[var(--soft-ink-faint)]">{type} · {tags}</p>
                  </div>
                </div>
                <button className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-[var(--soft-paper-edge)] px-3 py-1.5 text-xs text-[var(--soft-bordeaux)] hover:border-[var(--soft-terracotta)] hover:bg-[var(--soft-apricot)] transition-colors">
                  Открыть →
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
