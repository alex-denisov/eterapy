"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bookmark,
  ChevronRight,
  Compass,
  Heart,
  MessageCircle,
  MessagesSquare,
  Moon,
  Sparkles,
  Users,
} from "lucide-react";
import { getProductPriceLabel } from "@/lib/product-prices";
import { formatSessionFloor } from "@/lib/session-pricing";

// B366: catalog prices derive from the single billing source (entitlements) and
// the single session floor — the catalog can no longer drift from checkout.
const price = (slug: string): string => getProductPriceLabel(slug) ?? "—";

// B456: /products redesign (calm, above-fold, scroll-spy). The catalog is one
// continuous feed of 5 calm sections. Section ids stay `free|solo|together|
// esoteric|specialists` because /how-it-works deep-links to #solo/#esoteric/
// #specialists — do not rename them. Copy is de-anchored from «бесплатно»: the
// only free signal is the quiet 0 ₽ chip on the «Первый разбор» entry row.

type ServiceCard = {
  id: string;
  title: string;
  desc: string;
  price: string;
  href: string;
  icon: LucideIcon;
  highlight?: boolean;
};

type Layout = "entry" | "grid" | "row";

type ServiceGroup = {
  id: string;
  nav: string;
  title: string;
  subtitle?: string;
  layout: Layout;
  cards: ServiceCard[];
};

const GROUPS: ServiceGroup[] = [
  {
    id: "free",
    nav: "Начать",
    title: "С чего начать",
    layout: "entry",
    cards: [
      { id: "primary", title: "Первый разбор", desc: "Спокойно расскажите, что происходит, — и получите бережное отражение вашей ситуации.", price: "0 ₽", href: "/checkin", icon: Heart },
    ],
  },
  {
    id: "solo",
    nav: "Разборы",
    title: "Разобраться самостоятельно",
    layout: "grid",
    cards: [
      { id: "angles", title: "Переосмысление", desc: "Взгляд на ситуацию под другим углом", price: price("reframe"), href: "/products/reframe", icon: Compass },
      { id: "report", title: "Подробный разбор", desc: "Глубокий письменный разбор", price: price("deep-report"), href: "/products/deep-report", icon: Bookmark },
      { id: "chat", title: "Разбор переписки", desc: "Тон, эмоции и варианты ответа", price: price("chat-analysis"), href: "/products/chat-analysis", icon: MessagesSquare },
      { id: "live-chat", title: "Решить вопрос в чате", desc: "Живой диалог в своём темпе", price: price("chat-session"), href: "/products/chat", icon: MessageCircle },
    ],
  },
  {
    id: "together",
    nav: "Вместе",
    title: "Вместе",
    layout: "row",
    cards: [
      { id: "together", title: "Вместе", desc: "Бережный разбор для двоих или близких", price: `от ${price("pair")}`, href: "/products/pair", icon: Users },
    ],
  },
  {
    id: "esoteric",
    nav: "Эзотерика",
    title: "Эзотерика",
    layout: "grid",
    cards: [
      { id: "tarot-d", title: "Расклад Таро", desc: "Гадательное чтение выпавших карт", price: price("tarot"), href: "/products/tarot", icon: Moon },
      { id: "astro-d", title: "Натальная карта", desc: "Базовый разбор карты", price: price("natal-chart"), href: "/products/natal-chart", icon: Compass },
      { id: "synastry-d", title: "Совместимость по дате", desc: "Две натальные карты рядом", price: price("compatibility-by-date"), href: "/products/compatibility-by-date", icon: Compass },
      { id: "numero-d", title: "Матрица судьбы", desc: "22 энергии, предназначения и карта здоровья", price: price("numerology"), href: "/products/numerology", icon: Sparkles },
      { id: "horary-d", title: "Гороскоп", desc: "Ответ карты момента на один вопрос", price: price("horoscope"), href: "/products/horoscope", icon: Compass },
      { id: "tarot-num-d", title: "Арканы судьбы", desc: "Две карты Таро по дате рождения", price: price("arcana"), href: "/products/arcana", icon: Sparkles },
      { id: "hd-d", title: "Дизайн человека", desc: "Тип и бодиграф", price: price("human-design"), href: "/products/human-design", icon: Compass },
      { id: "surname-d", title: "Происхождение фамилии", desc: "Число рода, Аркан, ресурс и тень", price: price("surname-origin"), href: "/products/surname-origin", icon: Sparkles },
    ],
  },
  {
    id: "specialists",
    nav: "Специалист",
    title: "Поговорить с человеком",
    layout: "row",
    cards: [
      { id: "specialist", title: "Поговорить с человеком", desc: "Психолог, коуч или эзотерик — онлайн, длительность встречи выбираете сами. Цена видна до записи.", price: formatSessionFloor(), href: "/practitioners", icon: Heart, highlight: true },
    ],
  },
];

function ServiceCardView({ card }: { card: ServiceCard }) {
  const Icon = card.icon;
  return (
    <Link href={card.href} className="soft-svc-card" data-testid={`service-card-${card.id}`}>
      <Icon className="svc-icon size-5" aria-hidden="true" />
      <span className="svc-body">
        <span className="svc-title">{card.title}</span>
        <span className="svc-desc">{card.desc}</span>
      </span>
      <span className="soft-badge soft-badge-warm svc-price">{card.price}</span>
      <ChevronRight className="svc-chev size-4" aria-hidden="true" />
    </Link>
  );
}

function WideRow({ card }: { card: ServiceCard }) {
  const Icon = card.icon;
  const className = ["soft-entry-row", card.highlight ? "soft-entry-row-accent" : ""].join(" ").trim();
  return (
    <Link href={card.href} className={className} data-testid={`service-card-${card.id}`}>
      <Icon className="er-icon size-5" aria-hidden="true" />
      <span className="er-title">{card.title}</span>
      <span className="er-desc">{card.desc}</span>
      <span className="soft-badge soft-badge-warm er-price">{card.price}</span>
      <ArrowRight className="er-arrow size-4" aria-hidden="true" />
    </Link>
  );
}

export function ServiceCatalog({
  showFooterLink: _showFooterLink = true,
  className = "",
}: {
  showFooterLink?: boolean;
  className?: string;
}) {
  const [active, setActive] = useState<string>(GROUPS[0]?.id ?? "");
  const navRef = useRef<HTMLElement | null>(null);

  // B456: scroll-spy. The sticky category bar (mobile) highlights whichever
  // section has scrolled up under it; at the very top the first category stays
  // active. A rAF-throttled scroll listener is more predictable here than an
  // IntersectionObserver rootMargin band, which leaves the top ambiguous (no
  // section in the band → the last value sticks).
  useEffect(() => {
    const ids = GROUPS.map((g) => g.id);
    let raf = 0;
    const compute = () => {
      raf = 0;
      const line = 120; // just below the sticky header + the chip bar
      let current = ids[0] ?? "";
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el && el.getBoundingClientRect().top - line <= 0) current = id;
      }
      setActive((prev) => (prev === current ? prev : current));
    };
    const onScroll = () => {
      if (raf === 0) raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // Round-5 #3: the sticky chip bar follows the scroll-spy — when a section
  // highlights its chip, the strip itself scrolls so the active chip is
  // actually visible (scrollTo on the strip only; scrollIntoView would hijack
  // the page scroll the user is in the middle of).
  useEffect(() => {
    const nav = navRef.current;
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const chip = nav.querySelector<HTMLElement>(".soft-catalog-chip.is-active");
    if (!chip) return;
    const pad = 16;
    const chipLeft = chip.offsetLeft;
    const chipRight = chipLeft + chip.offsetWidth;
    if (chipLeft - pad < nav.scrollLeft) {
      nav.scrollTo({ left: Math.max(0, chipLeft - pad), behavior: "smooth" });
    } else if (chipRight + pad > nav.scrollLeft + nav.clientWidth) {
      nav.scrollTo({ left: chipRight + pad - nav.clientWidth, behavior: "smooth" });
    }
  }, [active]);

  const jumpTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    setActive(id);
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={`soft-catalog ${className}`.trim()} data-testid="v4-service-catalog">
      <nav ref={navRef} className="soft-catalog-nav md:hidden" aria-label="Категории услуг">
        {GROUPS.map((group) => (
          <button
            key={group.id}
            type="button"
            onClick={() => jumpTo(group.id)}
            className={`soft-catalog-chip${active === group.id ? " is-active" : ""}`}
            aria-current={active === group.id ? "true" : undefined}
          >
            {group.nav}
          </button>
        ))}
      </nav>

      <div className="soft-catalog-sections">
        {GROUPS.map((group) => (
          <section key={group.id} id={group.id} data-testid={`service-group-${group.id}`} className="scroll-mt-28">
            <div className="soft-catalog-head">
              <h2 className="soft-eyebrow">{group.title}</h2>
              {group.subtitle ? <span className="soft-catalog-sub">· {group.subtitle}</span> : null}
            </div>

            {group.layout === "grid" ? (
              <div className="flex flex-col gap-2 md:grid md:grid-cols-2 md:gap-3 lg:grid-cols-4" data-testid={`service-cards-${group.id}`}>
                {group.cards.map((card) => (
                  <ServiceCardView key={card.id} card={card} />
                ))}
              </div>
            ) : (
              group.cards.map((card) => <WideRow key={card.id} card={card} />)
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
