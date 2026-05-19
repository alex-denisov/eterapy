"use client";

import Link from "next/link";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bookmark,
  Calendar,
  Compass,
  Heart,
  Leaf,
  Lock,
  MessagesSquare,
  Moon,
  Sparkles,
  Users,
} from "lucide-react";

type Category = {
  id: string;
  label: string;
  live?: boolean;
  note?: string;
  icon?: LucideIcon;
};

type ServiceCard = {
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

const CATEGORIES: Category[] = [
  { id: "all", label: "Все форматы", live: true },
  { id: "digital", label: "Цифровые разборы", live: true, icon: Sparkles },
  { id: "social", label: "Для двоих и круга", live: true, icon: Users },
  { id: "practice", label: "Практика", live: true, icon: Calendar },
  { id: "psy", label: "Психология", live: true, icon: Heart },
  { id: "coach", label: "Коучинг", live: true, icon: Leaf },
  { id: "legal", label: "Юристы", live: true, icon: Lock },
  { id: "finance", label: "Финансы", live: true, icon: Sparkles },
  { id: "tarot", label: "Таро", live: false, note: "скоро", icon: Moon },
  { id: "astro", label: "Астрология", live: false, note: "скоро", icon: Compass },
  { id: "numero", label: "Нумерология", live: false, note: "скоро", icon: Sparkles },
  { id: "joint", label: "Совместные сессии", live: false, note: "пилот", icon: Users },
  { id: "edu", label: "Обучение", live: false, note: "скоро", icon: Bookmark },
];

const SERVICES: ServiceCard[] = [
  { id: "primary", title: "Первичный разбор", desc: "Короткий уточняющий диалог и бесплатное отражение ситуации.", price: "0 ₽", cat: "digital", kind: "Бесплатный старт", href: "/checkin", icon: Heart },
  { id: "angles", title: "4 ракурса ответа", desc: "Разум · чувства · символ · действие. Часто первый платный шаг после ответа.", price: "299 ₽", cat: "digital", kind: "Цифровое", href: "/products/perspectives", icon: Compass },
  { id: "report", title: "Глубокий отчёт", desc: "Документ-разбор на 10–15 страниц, который можно сохранить и обсудить.", price: "590 ₽", cat: "digital", kind: "Цифровое", href: "/products/deep-report", icon: Bookmark },
  { id: "chat", title: "Разбор переписки", desc: "Тон, эмоции, границы и варианты ответа.", price: "390–1 490 ₽", cat: "digital", kind: "Цифровое", href: "/products/chat-analysis", icon: MessagesSquare },
  { id: "compat", title: "Совместимость", desc: "Парный отчёт по приглашению и согласию партнёра.", price: "590–990 ₽", cat: "social", kind: "Для двоих", href: "/products/compatibility", icon: Users },
  { id: "circle", title: "Круг ясности", desc: "Бережный групповой формат: 2–5 участников и общий вопрос.", price: "790 ₽", cat: "social", kind: "Для круга", href: "/circle", icon: Users },
  { id: "pair", title: "Разобраться вдвоём", desc: "Отдельные ответы, взаимное согласие и общий результат.", price: "790 ₽", cat: "social", kind: "Для двоих", href: "/pair", icon: Heart },
  { id: "7days", title: "7 дней к ясности", desc: "Маршрут по 5-10 минут в день.", price: "990 ₽", cat: "practice", kind: "Маршрут", href: "/products/seven-days", icon: Calendar },
  { id: "practice", title: "Практика ясности", desc: "Ежедневные короткие вопросы, миссии и мягкий ритм.", price: "0 ₽", cat: "practice", kind: "Практика", href: "/practice", icon: Leaf },
  { id: "map", title: "Моя карта ETerapy", desc: "Личное пространство вопросов, выводов и повторяющихся тем.", price: "990 ₽", cat: "practice", kind: "Приватное", href: "/products/my-map", icon: Compass },
  { id: "psy-live", title: "Встреча с психологом", desc: "50 минут с проверенным специалистом после контекста.", price: "от 4 500 ₽", cat: "psy", kind: "Встреча", href: "/practitioners", icon: Heart },
  { id: "coach-live", title: "Коуч-сессия", desc: "Карьера, призвание, переход.", price: "от 3 200 ₽", cat: "coach", kind: "Встреча", href: "/practitioners", icon: Leaf },
  { id: "legal-live", title: "Юридическая консультация", desc: "Семейное право, документы, опека.", price: "от 6 000 ₽", cat: "legal", kind: "Встреча", href: "/practitioners", icon: Lock },
  { id: "finance-live", title: "Финансовый коуч", desc: "Деньги, тревога, личный финансовый план.", price: "от 3 200 ₽", cat: "finance", kind: "Встреча", href: "/practitioners", icon: Bookmark },
  { id: "tarot-d", title: "Расклад Таро", desc: "Цифровой расклад с бережной интерпретацией.", price: "390 ₽", cat: "tarot", kind: "Цифровое", href: "/tarot", icon: Moon, soon: true },
  { id: "astro-d", title: "Натальная карта", desc: "Базовый разбор натальной карты.", price: "590 ₽", cat: "astro", kind: "Цифровое", href: "/astro", icon: Compass, soon: true },
  { id: "numero-d", title: "Числовой портрет", desc: "Нумерологический разбор без фатальных обещаний.", price: "390 ₽", cat: "numero", kind: "Цифровое", href: "/numerology", icon: Sparkles, soon: true },
  { id: "joint-pair", title: "Эзотерик + психотерапевт", desc: "Совместная сессия двух специалистов.", price: "от 4 500 ₽", cat: "joint", kind: "Встреча", href: "/joint", icon: Users, soon: true, badge: "пилот" },
  { id: "edu-individual", title: "Индивидуальная программа", desc: "6 встреч под ваш запрос.", price: "от 12 000 ₽", cat: "edu", kind: "Программа", href: "#", icon: Bookmark, soon: true },
  { id: "edu-group", title: "Группа: Близость", desc: "8 недель в малой группе.", price: "8 900 ₽", cat: "edu", kind: "Программа", href: "#", icon: Users, soon: true },
];

export function ServiceCatalog({
  showFooterLink = true,
  className = "",
}: {
  showFooterLink?: boolean;
  className?: string;
}) {
  const [cat, setCat] = useState("all");
  const filtered = cat === "all" ? SERVICES : SERVICES.filter((p) => p.cat === cat);

  return (
    <div className={className} data-testid="v4-service-catalog">
      <div className="mb-8 flex flex-wrap justify-center gap-2">
        {CATEGORIES.map((category) => {
          const Icon = category.icon;
          return (
            <button
              key={category.id}
              type="button"
              className={[
                "soft-chip transition-colors",
                cat === category.id ? "soft-chip-warm" : "",
                category.id !== "all" && !category.live ? "opacity-65" : "",
              ].join(" ")}
              onClick={() => setCat(category.id)}
              aria-pressed={cat === category.id}
              data-testid={`service-filter-${category.id}`}
            >
              {Icon && <Icon className="size-3.5" aria-hidden="true" />}
              {category.label}
              {category.id !== "all" && !category.live && (
                <span className="ml-1 text-[11px] opacity-70">· {category.note ?? "скоро"}</span>
              )}
            </button>
          );
        })}
      </div>

      <div className="soft-map-grid" data-testid="v4-service-cards">
        {filtered.map((service) => {
          const Icon = service.icon;
          const category = CATEGORIES.find((item) => item.id === service.cat);
          const isClickable = service.href !== "#";
          const className = [
            "soft-service-card col-span-12 flex min-h-44 flex-col rounded-[var(--soft-radius-lg)] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-7 md:col-span-6 lg:col-span-4",
            isClickable ? "cursor-pointer hover:border-[var(--terracotta)] hover:shadow-[var(--shadow-md)] hover:-translate-y-1" : "",
            service.soon ? "opacity-85" : "",
          ].join(" ");
          const inner = (
            <>
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 text-xs text-[var(--soft-ink-faint)]">
                  <Icon className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
                  <span>{category?.label ?? service.cat} · {service.kind}</span>
                </div>
                {service.soon ? (
                  <span className="soft-badge soft-badge-lilac">{service.badge ?? "скоро"}</span>
                ) : (
                  <span className="soft-badge soft-badge-warm">{service.price}</span>
                )}
              </div>
              <h3 className="soft-h3 mt-4">{service.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{service.desc}</p>
              {service.soon ? (
                <p className="mt-3 text-xs text-[var(--soft-ink-faint)]">{service.price} · в листе ожидания</p>
              ) : (
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-terracotta-dark)]">
                  {service.id === "primary" ? "Начать бесплатно" : "Подробнее"}
                  <ArrowRight className="size-4" aria-hidden="true" />
                </span>
              )}
              {service.soon && isClickable && (
                <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-terracotta-dark)]">
                  Открыть waitlist
                  <ArrowRight className="size-4" aria-hidden="true" />
                </span>
              )}
            </>
          );

          return isClickable ? (
            <Link key={service.id} href={service.href} className={className} data-testid={`service-card-${service.id}`}>
              {inner}
            </Link>
          ) : (
            <div key={service.id} className={className} data-testid={`service-card-${service.id}`}>
              {inner}
            </div>
          );
        })}
      </div>

      {showFooterLink && (
        <div className="mt-8 text-center">
          <Link href="/products" className="soft-button soft-button-ghost">
            Все продукты
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </div>
  );
}
