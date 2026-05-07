"use client";

import Link from "next/link";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Heart, Leaf, Lock, Compass, Bookmark, Moon, Calendar, Sparkles, Users } from "lucide-react";

const CATEGORIES = [
  { id: "all", label: "Все форматы" },
  { id: "psy", label: "Психология", live: true },
  { id: "coach", label: "Коучинг", live: true },
  { id: "legal", label: "Юристы", live: true },
  { id: "finance", label: "Финансы", live: true },
  { id: "tarot", label: "Таро", live: false, note: "скоро" },
  { id: "astro", label: "Астрология", live: false, note: "скоро" },
  { id: "numero", label: "Нумерология", live: false, note: "скоро" },
  { id: "joint", label: "Совместные сессии", live: false, note: "пилот" },
  { id: "edu", label: "Обучение", live: false, note: "скоро" },
];

type Product = {
  id: string;
  title: string;
  desc: string;
  price: string;
  cat: string;
  kind: string;
  href: string;
  icon: LucideIcon;
  soon?: boolean;
  badge?: string;
};

const PRODUCTS: Product[] = [
  { id: "angles",   title: "4 ракурса ответа",    desc: "Разум · Чувства · Символ · Действие",          price: "299 ₽",        cat: "psy",    kind: "Цифровое",   href: "/products/perspectives",  icon: Compass },
  { id: "report",   title: "Глубокий отчёт",       desc: "Документ-разбор с рекомендациями.",             price: "590 ₽",        cat: "psy",    kind: "Цифровое",   href: "/products/deep-report",   icon: Bookmark },
  { id: "chat",     title: "Разбор переписки",     desc: "Тон, эмоции, варианты ответа.",                 price: "990 ₽",        cat: "psy",    kind: "Цифровое",   href: "/products/chat-analysis", icon: Sparkles },
  { id: "compat",   title: "Совместимость",        desc: "Парный отчёт по приглашению.",                  price: "990 ₽",        cat: "psy",    kind: "Цифровое",   href: "/products/compatibility", icon: Users },
  { id: "7days",    title: "7 дней к ясности",     desc: "Маршрут по 5–10 минут в день.",                 price: "990 ₽",        cat: "psy",    kind: "Маршрут",    href: "/products/seven-days",    icon: Calendar },
  { id: "map",      title: "Расширенная карта",    desc: "Годовой разбор паттернов и тем.",               price: "990 ₽",        cat: "psy",    kind: "Цифровое",   href: "/products/my-map",        icon: Compass },
  { id: "psy_live", title: "Встреча с психологом", desc: "50 минут с проверенным специалистом.",          price: "от 1900 ₽",   cat: "psy",    kind: "Встреча",    href: "/practitioners",          icon: Heart },
  { id: "coach_l",  title: "Коуч-сессия",          desc: "Карьера, призвание, переход.",                  price: "от 2500 ₽",   cat: "coach",  kind: "Встреча",    href: "/practitioners",          icon: Leaf },
  { id: "legal_l",  title: "Юридическая консультация", desc: "Семейное право, документы, опека.",        price: "от 3000 ₽",   cat: "legal",  kind: "Встреча",    href: "/practitioners",          icon: Lock },
  { id: "fin_l",    title: "Финансовый коуч",      desc: "Деньги, тревога, план.",                        price: "от 2000 ₽",   cat: "finance",kind: "Встреча",    href: "/practitioners",          icon: Bookmark },
  { id: "tarot_d",  title: "Расклад Таро",         desc: "Цифровой расклад с интерпретацией.",            price: "390 ₽",        cat: "tarot",  kind: "Цифровое",   href: "#",                       icon: Moon,     soon: true },
  { id: "astro_d",  title: "Натальная карта",      desc: "Базовый разбор натальной карты.",              price: "590 ₽",        cat: "astro",  kind: "Цифровое",   href: "#",                       icon: Compass,  soon: true },
  { id: "numero_d", title: "Числовой портрет",     desc: "Нумерологический разбор.",                      price: "390 ₽",        cat: "numero", kind: "Цифровое",   href: "#",                       icon: Sparkles, soon: true },
  { id: "joint_p",  title: "Эзотерик + психотерапевт", desc: "Совместная сессия двух специалистов.",    price: "от 4500 ₽",   cat: "joint",  kind: "Встреча",    href: "#",                       icon: Users,    soon: true, badge: "новый формат" },
  { id: "edu_ind",  title: "Индивидуальная программа", desc: "6 встреч под ваш запрос.",                price: "от 12 000 ₽", cat: "edu",    kind: "Программа",  href: "#",                       icon: Bookmark, soon: true },
  { id: "edu_grp",  title: "Группа: Близость",     desc: "8 недель в малой группе.",                      price: "8 900 ₽",      cat: "edu",    kind: "Программа",  href: "#",                       icon: Users,    soon: true },
];

export function AIToolsSection() {
  const [cat, setCat] = useState("all");

  const filtered = cat === "all"
    ? PRODUCTS
    : PRODUCTS.filter((p) => p.cat === cat);

  return (
    <section id="modalities" className="soft-shell py-16 md:py-24">
      <div className="mx-auto mb-10 max-w-3xl text-center">
        <div className="soft-eyebrow">Каталог форматов</div>
        <h2 className="soft-h1 mt-3">
          Углубление под <span className="soft-italic">ваш</span> вопрос
        </h2>
        <p className="soft-lede mt-4">
          Цифровые разборы, маршруты и переход к специалисту открываются как
          продолжение вопроса, а не как витрина ради выбора.
        </p>
      </div>

      {/* Category filter chips */}
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            className={[
              "soft-chip transition-colors",
              cat === c.id ? "soft-chip-warm" : "",
              c.id !== "all" && !c.live ? "opacity-60" : "",
            ].join(" ")}
            onClick={() => setCat(c.id)}
            aria-pressed={cat === c.id}
          >
            {c.label}
            {c.id !== "all" && !c.live && (
              <span className="ml-1.5 text-[11px] opacity-70">· {c.note}</span>
            )}
          </button>
        ))}
      </div>

      {/* Product grid */}
      <div className="soft-map-grid">
        {filtered.map((p) => {
          const catLabel = CATEGORIES.find((c) => c.id === p.cat)?.label ?? "";
          const isClickable = !p.soon && p.href !== "#";
          const cardClass = [
            "soft-card col-span-12 flex min-h-44 flex-col p-6 md:col-span-6 lg:col-span-4",
            isClickable ? "soft-product-card cursor-pointer" : "",
            p.soon ? "opacity-85" : "",
          ].join(" ");
          const inner = (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-[var(--soft-ink-faint)]">
                  <p.icon className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                  <span>{catLabel} · {p.kind}</span>
                </div>
                {p.soon
                  ? <span className="soft-badge" style={{ background: "var(--soft-lilac-soft)", color: "var(--soft-bordeaux)" }}>{p.badge ?? "скоро"}</span>
                  : <span className="soft-badge soft-badge-warm">{p.price}</span>
                }
              </div>
              <h3 className="soft-h3 mt-4">{p.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
                {p.desc}
              </p>
              {p.soon && (
                <p className="mt-3 text-xs text-[var(--soft-ink-faint)]">{p.price} · в листе ожидания</p>
              )}
              {isClickable && (
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-terracotta-dark)]">
                  Подробнее
                  <ArrowRight className="size-4" aria-hidden="true" />
                </span>
              )}
            </>
          );
          return isClickable ? (
            <Link key={p.id} href={p.href} className={cardClass}>{inner}</Link>
          ) : (
            <div key={p.id} className={cardClass}>{inner}</div>
          );
        })}
      </div>

      <div className="mt-8 text-center">
        <Link href="/products" className="soft-button soft-button-ghost">
          Все продукты
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </section>
  );
}
