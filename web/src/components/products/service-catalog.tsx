import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Bookmark,
  Compass,
  Heart,
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

// M26/B370: каталог = 5 смысловых групп вместо чипов-фильтров. Групп
// «Практика»/«Маршрут» нет; «Вместе» — одна карточка (механика в B385, пока
// ведёт на pair); «Поговорить со специалистом» — одна выделенная карточка.
// ≤12 карточек на дефолтном экране, мобайл — одна колонка.

type ServiceCard = {
  id: string;
  title: string;
  desc: string;
  price: string;
  kind: string;
  href: string;
  icon: LucideIcon;
  highlight?: boolean;
};

type ServiceGroup = {
  id: string;
  title: string;
  cards: ServiceCard[];
};

const GROUPS: ServiceGroup[] = [
  {
    id: "free",
    title: "Начать бесплатно",
    cards: [
      { id: "primary", title: "Первичный разбор", desc: "Короткий уточняющий диалог и бесплатное отражение ситуации. Без карты и регистрации.", price: "0 ₽", kind: "Бесплатно", href: "/checkin", icon: Heart },
    ],
  },
  {
    id: "solo",
    title: "Самостоятельные разборы",
    cards: [
      { id: "angles", title: "Полная картина", desc: "Мысли · чувства · скрытый смысл · первый шаг. Первая часть разбора бесплатно.", price: price("perspectives"), kind: "Цифровое", href: "/products/perspectives", icon: Compass },
      { id: "report", title: "Подробный разбор", desc: "Документ-разбор на 10–15 страниц, который можно сохранить и обсудить.", price: price("deep-report"), kind: "Цифровое", href: "/products/deep-report", icon: Bookmark },
      { id: "chat", title: "Разбор переписки", desc: "Тон, эмоции, границы и варианты ответа.", price: price("chat-analysis"), kind: "Цифровое", href: "/products/chat-analysis", icon: MessagesSquare },
    ],
  },
  {
    id: "together",
    title: "Вместе",
    cards: [
      { id: "together", title: "Вместе", desc: "Взгляд со стороны · сверить взгляды · совместимость. Один общий вопрос — и бережный разбор для двоих или близких.", price: `от ${price("pair")}`, kind: "Для двоих и близких", href: "/products/pair", icon: Users },
    ],
  },
  {
    id: "esoteric",
    title: "Эзотерика",
    cards: [
      { id: "tarot-d", title: "Расклад Таро", desc: "Цифровой расклад с бережной интерпретацией.", price: price("tarot"), kind: "Цифровое", href: "/products/tarot", icon: Moon },
      { id: "astro-d", title: "Натальная карта", desc: "Базовый разбор натальной карты.", price: price("natal-chart"), kind: "Цифровое", href: "/products/natal-chart", icon: Compass },
      { id: "synastry-d", title: "Совместимость по звёздам", desc: "Две натальные карты рядом: ресурсы и разные ритмы пары.", price: price("synastry"), kind: "Цифровое", href: "/products/synastry", icon: Compass },
      { id: "numero-d", title: "Числовой портрет", desc: "Нумерологический разбор без фатальных обещаний.", price: price("numerology"), kind: "Цифровое", href: "/products/numerology", icon: Sparkles },
    ],
  },
  {
    id: "specialists",
    title: "Поговорить со специалистом",
    cards: [
      { id: "specialist", title: "Поговорить со специалистом", desc: "Психологи, коучи, юристы, финансовые консультанты и эзотерики. 60 минут онлайн, цена видна до записи — специалист заранее видит ваш разбор.", price: formatSessionFloor(), kind: "Встреча", href: "/practitioners", icon: Heart, highlight: true },
    ],
  },
];

function ServiceCardView({ card }: { card: ServiceCard }) {
  const Icon = card.icon;
  const className = [
    "soft-service-card col-span-12 flex min-h-44 flex-col rounded-[var(--soft-radius-lg)] border p-7",
    "cursor-pointer hover:border-[var(--terracotta)] hover:shadow-[var(--shadow-md)] hover:-translate-y-1",
    card.highlight
      ? "border-[var(--soft-terracotta-dark)] bg-[var(--soft-paper-deep)] md:col-span-12"
      : "border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] md:col-span-6 lg:col-span-4",
  ].join(" ");

  return (
    <Link href={card.href} className={className} data-testid={`service-card-${card.id}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-2 text-xs text-[var(--soft-ink-faint)]">
          <Icon className="size-5 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <span>{card.kind}</span>
        </div>
        <span className="soft-badge soft-badge-warm">{card.price}</span>
      </div>
      <h3 className="soft-h3 mt-4">{card.title}</h3>
      <p className="mt-2 flex-1 text-sm leading-relaxed text-[var(--soft-ink-soft)]">{card.desc}</p>
      <span className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-[var(--soft-terracotta-dark)]">
        {card.id === "primary" ? "Открыть бесплатный вход" : card.id === "specialist" ? "Выбрать специалиста" : "Подробнее и заказать"}
        <ArrowRight className="size-4" aria-hidden="true" />
      </span>
    </Link>
  );
}

export function ServiceCatalog({
  showFooterLink = true,
  className = "",
}: {
  showFooterLink?: boolean;
  className?: string;
}) {
  return (
    <div className={className} data-testid="v4-service-catalog">
      <div className="flex flex-col gap-10">
        {GROUPS.map((group) => (
          <section key={group.id} data-testid={`service-group-${group.id}`}>
            <h3 className="soft-eyebrow mb-4">{group.title}</h3>
            <div className="soft-map-grid" data-testid="v4-service-cards">
              {group.cards.map((card) => <ServiceCardView key={card.id} card={card} />)}
            </div>
          </section>
        ))}
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
