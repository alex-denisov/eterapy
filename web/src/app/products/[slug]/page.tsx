import Link from "next/link";
import { notFound } from "next/navigation";
import type React from "react";
import { LockKeyhole } from "lucide-react";
import { PublicJsonLd } from "@/components/seo/public-json-ld";
import { ChatAnalysisActions } from "@/components/products/chat-analysis-actions";
import { CompatibilityActions } from "@/components/products/compatibility-actions";
import { DeepReportActions } from "@/components/products/deep-report-actions";
import { PerspectivesActions } from "@/components/products/perspectives-actions";
import { SevenDaysActions } from "@/components/products/seven-days-actions";
import { SynastryActions } from "@/components/products/synastry-actions";
import { SymbolicProductActions } from "@/components/products/symbolic-product-actions";
import { HumanDesignActions } from "@/components/products/human-design-actions";
import { createPublicPageMetadata, type PublicSeoRoute } from "@/lib/public-page-seo";
import { getV5Product, v5Products, type V5Product } from "@/lib/v5-products";

export function generateStaticParams() {
  return v5Products.map((product) => ({ slug: product.slug }));
}

// M26/B367: unknown slugs (включая выпиленные услуги) должны отдавать
// настоящий HTTP 404 на уровне роутера. Без этого root loading.tsx начинает
// стримить ответ со статусом 200 раньше, чем сработает notFound().
export const dynamicParams = false;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getV5Product(slug);
  if (!product) return {};
  return createPublicPageMetadata(product.route as PublicSeoRoute);
}

function ProductHero({
  product,
  action,
  side,
}: {
  product: V5Product;
  action: React.ReactNode;
  side: React.ReactNode;
}) {
  return (
    <section className="soft-shell soft-product-detail-hero" data-testid="product-hero">
      <div>
        <Link href="/" className="soft-chip" data-testid="product-hero-back">← На главную</Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {product.tone !== "free" && <span className="soft-badge soft-badge-lilac">{product.tone === "private" ? "приватно" : "новый формат"}</span>}
          <span className="text-xs text-[var(--soft-ink-faint)]">· {product.eyebrow}</span>
        </div>
        <h1 className="soft-h1 mt-4">{product.name}</h1>
        <p className="soft-lede mt-4 max-w-xl">{product.summary}</p>
      </div>
      <div className="soft-product-action-start" data-testid="product-service-start">
        {action}
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <p className="font-heading text-[2.5rem] font-semibold leading-none text-[var(--soft-bordeaux)]" data-testid="product-hero-price">
            {product.price}
          </p>
          <p className="max-w-[13rem] text-sm leading-relaxed text-[var(--soft-ink-faint)]">{product.priceMeta}</p>
          <span className="soft-chip">оплата после фрагмента</span>
        </div>
        <div className="soft-product-hero-preview mt-8" data-testid="product-hero-preview">
          {side}
        </div>
      </div>
    </section>
  );
}

function DeepReportSide() {
  return (
    <div className="relative grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#FFFCF5,#F4D9C1)] p-10 text-center">
      <div className="relative h-80 w-60 rotate-[-2deg] rounded-lg border border-[var(--soft-paper-edge)] bg-white p-6 text-left shadow-[0_20px_50px_-15px_rgba(60,30,20,.3),0_2px_4px_rgba(60,30,20,.06)]">
        <div className="soft-eyebrow text-[0.56rem]">ETerapy · подробный разбор</div>
        <div className="mt-3 font-heading text-base italic leading-snug text-[var(--soft-bordeaux)]">Сепарация и собственный голос</div>
        <div className="my-3 h-px bg-[var(--soft-paper-edge)]" />
        <div className="flex flex-col gap-1 text-[0.56rem] leading-relaxed text-[var(--soft-ink-faint)]">
          {[1, 2, 3, 4, 5, 6, 7].map((item) => <div key={item}>{item}. ▬▬▬▬▬▬▬▬</div>)}
        </div>
        <div className="absolute -bottom-2 -right-2 rotate-[8deg] rounded-full bg-[var(--soft-apricot)] px-3 py-1 text-[0.63rem] font-semibold text-[var(--soft-bordeaux)]">15 стр.</div>
      </div>
    </div>
  );
}

function ExtendedMapSide() {
  return (
    <div className="relative grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#DBD3EA,#F4D9C1)] p-6 sm:p-10" data-testid="product-my-map-preview">
      <div className="relative w-full max-w-80">
        <div className="grid grid-cols-4 gap-1.5">
          {["Отношения", "Семья", "Работа", "Тело", "Деньги", "Подруги", "Мама", "Партнёр"].map((topic, index) => (
            <div key={topic} className="rounded-lg p-2 text-center text-[0.56rem] text-[var(--soft-bordeaux)]" style={{ background: ["#F4D9C1", "#E8C4B8", "#DBD3EA", "#D6DECC"][index % 4] }}>
              {topic}
            </div>
          ))}
        </div>
        <div className="absolute bottom-[-0.5rem] right-0 w-40 rotate-[-3deg] rounded-2xl border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-4 font-heading text-xs italic text-[var(--soft-bordeaux)] shadow-[0_8px_20px_-8px_rgba(60,30,20,.2)] sm:inset-[-0.75rem] sm:w-44 sm:translate-x-[48%] sm:translate-y-[62%]">
          «3 темы стали тише за год, 1 — окрепла»
        </div>
      </div>
    </div>
  );
}

function TarotSide() {
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#DBD3EA,#E8E1F2)] p-10">
      <div className="flex gap-2.5">
        {[0, 1, 2].map((item) => (
          <div key={item} className="relative h-28 w-[4.4rem] rounded-lg border-2 border-[#DBD3EA] bg-[linear-gradient(140deg,#4A3E5E,#6B5C82)] shadow-[0_8px_16px_-4px_rgba(0,0,0,.25)]" style={{ transform: `rotate(${(item - 1) * 5}deg) translateY(${Math.abs(item - 1) * -4}px)` }}>
            <div className="absolute inset-2 grid place-items-center rounded border border-[#DBD3EA]">
              <span className="font-heading text-3xl italic text-[#DBD3EA]">★</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function NatalSide() {
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#D6DECC,#E5EBDC)] p-10">
      <svg viewBox="0 0 260 260" width="260" height="260" aria-hidden="true">
        <circle cx="130" cy="130" r="120" fill="none" stroke="#3A4A36" strokeWidth="1.5" opacity=".4" />
        <circle cx="130" cy="130" r="90" fill="none" stroke="#3A4A36" strokeWidth="1" opacity=".3" />
        <circle cx="130" cy="130" r="60" fill="none" stroke="#3A4A36" strokeWidth="1" opacity=".25" />
        {Array.from({ length: 12 }).map((_, index) => {
          const angle = (index * 30 - 90) * Math.PI / 180;
          return <line key={index} x1={130 + Math.cos(angle) * 60} y1={130 + Math.sin(angle) * 60} x2={130 + Math.cos(angle) * 120} y2={130 + Math.sin(angle) * 120} stroke="#3A4A36" strokeWidth="1" opacity=".3" />;
        })}
        {[15, 47, 92, 145, 198, 234].map((deg, index) => {
          const angle = (deg - 90) * Math.PI / 180;
          return <circle key={index} cx={130 + Math.cos(angle) * 105} cy={130 + Math.sin(angle) * 105} r="5" fill="#3A4A36" />;
        })}
        <text x="130" y="135" textAnchor="middle" fontFamily="var(--font-heading)" fontSize="14" fontStyle="italic" fill="#3A4A36">портрет</text>
      </svg>
    </div>
  );
}

function SynastrySide() {
  return (
    <div className="relative grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#D6DECC,#DBD3EA)] p-10">
      <div className="relative h-64 w-72 max-w-full">
        <svg viewBox="0 0 288 256" className="h-full w-full" aria-hidden="true">
          <circle cx="94" cy="118" r="62" fill="none" stroke="#3A4A36" strokeWidth="2" opacity=".55" />
          <circle cx="188" cy="118" r="62" fill="none" stroke="#4A3E5E" strokeWidth="2" opacity=".55" />
          <path d="M104 96 C132 70 158 70 178 96" fill="none" stroke="#B85B40" strokeWidth="2" opacity=".65" />
          <path d="M102 140 C132 164 158 164 180 140" fill="none" stroke="#B85B40" strokeWidth="2" opacity=".45" />
          {[0, 1, 2, 3, 4, 5].map((item) => {
            const angle = (item * 60 - 90) * Math.PI / 180;
            return <circle key={`a-${item}`} cx={94 + Math.cos(angle) * 50} cy={118 + Math.sin(angle) * 50} r="4" fill="#3A4A36" />;
          })}
          {[0, 1, 2, 3, 4, 5].map((item) => {
            const angle = (item * 60 - 90) * Math.PI / 180;
            return <circle key={`b-${item}`} cx={188 + Math.cos(angle) * 50} cy={118 + Math.sin(angle) * 50} r="4" fill="#4A3E5E" />;
          })}
        </svg>
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-[var(--soft-paper-card)] px-4 py-1.5 font-heading text-sm italic text-[var(--soft-bordeaux)] shadow-[0_8px_18px_-10px_rgba(60,30,20,.25)]">
          карта пары
        </div>
      </div>
    </div>
  );
}

function NumerologySide() {
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#F4D9C1,#F8E6D1)] p-10">
      <div className="grid w-72 max-w-full grid-cols-3 gap-2">
        {[3, 7, 1, 9, 2, 5, 4, 8, 6].map((number, index) => (
          <div key={`${number}-${index}`} className="grid aspect-square place-items-center rounded-xl border border-[var(--soft-paper-edge)] font-heading text-3xl italic text-[var(--soft-bordeaux)]" style={{ background: index === 4 ? "var(--soft-bordeaux)" : "var(--soft-paper-card)", color: index === 4 ? "#FBF0E1" : "var(--soft-bordeaux)", fontSize: index === 4 ? 40 : 28 }}>
            {number}
          </div>
        ))}
      </div>
    </div>
  );
}

function HumanDesignSide() {
  // Стилизованный силуэт бодиграфа из 9 центров (превью услуги).
  const centers: Array<{ x: number; y: number; r: number; fill: boolean }> = [
    { x: 130, y: 28, r: 14, fill: false },
    { x: 130, y: 70, r: 14, fill: true },
    { x: 130, y: 112, r: 16, fill: true },
    { x: 130, y: 158, r: 18, fill: true },
    { x: 184, y: 158, r: 12, fill: false },
    { x: 70, y: 196, r: 14, fill: true },
    { x: 190, y: 196, r: 14, fill: false },
    { x: 130, y: 200, r: 18, fill: true },
    { x: 130, y: 244, r: 16, fill: false },
  ];
  const links: Array<[number, number]> = [[0, 1], [1, 2], [2, 3], [3, 7], [3, 4], [2, 5], [2, 6], [5, 7], [7, 8], [6, 8]];
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#F4D9C1,#E8C4B8)] p-8" data-testid="product-human-design-preview">
      <svg viewBox="0 0 260 272" className="w-full max-w-[220px]" aria-hidden="true">
        {links.map(([a, b], i) => (
          <line key={i} x1={centers[a].x} y1={centers[a].y} x2={centers[b].x} y2={centers[b].y} stroke="#B85B40" strokeWidth={centers[a].fill && centers[b].fill ? 3 : 1.2} opacity={centers[a].fill && centers[b].fill ? 0.85 : 0.4} strokeLinecap="round" />
        ))}
        {centers.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={c.r} fill={c.fill ? "#B85B40" : "#FBF0E1"} stroke="#B85B40" strokeWidth={1.5} />
        ))}
      </svg>
    </div>
  );
}

function DefaultSide() {
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#FFFCF5,#F4D9C1)] p-10">
      <div className="size-28 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fff,transparent_38%),conic-gradient(from_30deg,#F4C9A8,#E8B8D1,#D9C9E8,#F4C9A8)] shadow-[0_16px_36px_-18px_rgba(214,117,88,.7)]" />
    </div>
  );
}

function PerspectivesSide() {
  const tiles: Array<{ label: string; sub: string; bg: string; color: string }> = [
    { label: "Мысли", sub: "факты · варианты", bg: "linear-gradient(140deg,#F4D9C1,#F8E6D1)", color: "var(--soft-bordeaux)" },
    { label: "Чувства", sub: "что внутри", bg: "linear-gradient(140deg,#E8C4B8,#F4D5C8)", color: "var(--soft-bordeaux)" },
    { label: "Скрытый смысл", sub: "образ ситуации", bg: "linear-gradient(140deg,#DBD3EA,#E8E1F2)", color: "#4A3E5E" },
    { label: "Первый шаг", sub: "шаги на неделю", bg: "linear-gradient(140deg,#D6DECC,#E5EBDC)", color: "#3A4A36" },
  ];
  return (
    <div className="relative grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#FFFCF5,#F4D9C1)] p-8" data-testid="product-perspectives-preview">
      <div className="grid w-72 grid-cols-2 gap-3 max-w-full">
        {tiles.map((tile) => (
          <div key={tile.label} className="rounded-2xl p-4 shadow-[0_8px_18px_-10px_rgba(60,30,20,.25)]" style={{ background: tile.bg, color: tile.color }}>
            <div className="font-heading text-lg italic">{tile.label}</div>
            <div className="mt-1 text-[0.72rem] opacity-80">{tile.sub}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChatAnalysisSide() {
  const bubbles: Array<{ side: "left" | "right"; text: string }> = [
    { side: "left", text: "Почему ты не отвечаешь?" },
    { side: "right", text: "Я устал, говорил же." },
    { side: "left", text: "Каждый раз «занят». А для тебя я на втором месте?" },
    { side: "right", text: "Ну вот, опять началось." },
  ];
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#F4D9C1,#E8C4B8)] p-8" data-testid="product-chat-analysis-preview">
      <div className="flex w-72 max-w-full flex-col gap-2.5">
        {bubbles.map((bubble, idx) => (
          <div
            key={idx}
            className="max-w-[78%] rounded-[14px] px-3 py-2 text-[11.5px] leading-snug shadow-[0_4px_10px_-4px_rgba(60,30,20,.18)]"
            style={{
              alignSelf: bubble.side === "left" ? "flex-start" : "flex-end",
              background: bubble.side === "left" ? "var(--soft-paper-card)" : "var(--soft-bordeaux)",
              color: bubble.side === "left" ? "var(--soft-ink)" : "#FBF0E1",
            }}
          >
            {bubble.text}
          </div>
        ))}
      </div>
    </div>
  );
}

function CompatibilitySide() {
  return (
    <div className="relative grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#DBD3EA,#F4D9C1)] p-10" data-testid="product-compatibility-preview">
      <div className="relative flex items-center gap-4">
        <div className="grid size-24 place-items-center rounded-full bg-[linear-gradient(140deg,#E8C4B8,#F4D5C8)] font-heading text-3xl italic text-[var(--soft-bordeaux)] shadow-[0_12px_24px_-8px_rgba(184,91,64,.4)]">А</div>
        <div className="z-10 -mx-3 grid place-items-center rounded-full bg-[var(--soft-paper-card)] px-3 py-1.5 font-heading text-sm italic text-[var(--soft-bordeaux)] shadow-[0_6px_14px_-6px_rgba(60,30,20,.25)]">общее</div>
        <div className="grid size-24 place-items-center rounded-full bg-[linear-gradient(140deg,#DBD3EA,#B5A8D1)] font-heading text-3xl italic text-[#4A3E5E] shadow-[0_12px_24px_-8px_rgba(74,62,94,.4)]">Б</div>
      </div>
    </div>
  );
}

function SevenDaysSide() {
  const days = ["пн", "вт", "ср", "чт", "пт", "сб", "вс"];
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#F4D9C1,#FFFCF5)] p-10" data-testid="product-seven-days-preview">
      <div className="grid w-72 max-w-full grid-cols-7 gap-1.5">
        {days.map((day, index) => (
          <div
            key={day}
            className="grid aspect-square place-items-center rounded-[10px] border text-[0.72rem] font-semibold"
            style={{
              borderColor: index < 3 ? "var(--soft-terracotta-dark)" : index === 3 ? "var(--soft-apricot)" : "var(--soft-paper-edge)",
              background: index < 3 ? "var(--soft-terracotta-dark)" : index === 3 ? "var(--soft-apricot)" : "var(--soft-paper-card)",
              color: index < 3 ? "#FBF0E1" : index === 3 ? "var(--soft-bordeaux)" : "var(--soft-ink-faint)",
            }}
          >
            {index < 3 ? "✓" : day}
          </div>
        ))}
      </div>
    </div>
  );
}

function ClarityPracticeSide() {
  return (
    <div className="grid min-h-[20rem] place-items-center rounded-[1.75rem] bg-[linear-gradient(160deg,#D6DECC,#F4D9C1)] p-10" data-testid="product-clarity-practice-preview">
      <div className="relative w-72 max-w-full">
        <div className="rounded-[1.25rem] border border-[var(--soft-paper-edge)] bg-[var(--soft-paper-card)] p-5 shadow-[0_14px_28px_-12px_rgba(60,30,20,.22)]">
          <div className="soft-eyebrow text-[0.6rem]">сегодняшний вопрос</div>
          <p className="mt-3 font-heading text-lg italic leading-snug text-[var(--soft-bordeaux)]">
            Какая забота о себе сегодня была бы по-настоящему добра?
          </p>
          <div className="mt-4 flex items-center gap-2">
            <div className="h-1 flex-1 rounded-full bg-[var(--soft-paper-edge)]">
              <div className="h-1 rounded-full bg-[var(--soft-terracotta-dark)]" style={{ width: "42%" }} />
            </div>
            <span className="text-[0.6rem] text-[var(--soft-ink-faint)]">11/30</span>
          </div>
        </div>
        <div className="absolute -bottom-3 right-2 rotate-[6deg] rounded-full bg-[var(--soft-apricot)] px-3 py-1 text-[0.65rem] font-semibold text-[var(--soft-bordeaux)]">+1 балл</div>
      </div>
    </div>
  );
}

function productSide(product: V5Product) {
  if (product.slug === "deep-report") return <DeepReportSide />;
  if (product.slug === "my-map") return <ExtendedMapSide />;
  if (product.slug === "tarot") return <TarotSide />;
  if (product.slug === "natal-chart") return <NatalSide />;
  if (product.slug === "synastry") return <SynastrySide />;
  if (product.slug === "numerology") return <NumerologySide />;
  if (product.slug === "perspectives") return <PerspectivesSide />;
  if (product.slug === "chat-analysis") return <ChatAnalysisSide />;
  if (product.slug === "compatibility") return <CompatibilitySide />;
  if (product.slug === "seven-days") return <SevenDaysSide />;
  if (product.slug === "clarity-practice") return <ClarityPracticeSide />;
  if (product.slug === "human-design") return <HumanDesignSide />;
  return <DefaultSide />;
}

function ProductActionSurface({
  product,
  search,
}: {
  product: V5Product;
  search?: { dialogueId?: string; invite?: string };
}) {
  if (product.slug === "deep-report") return <DeepReportActions dialogueId={search?.dialogueId ?? null} />;
  if (product.slug === "perspectives") return <PerspectivesActions dialogueId={search?.dialogueId ?? null} />;
  if (product.slug === "chat-analysis") return <ChatAnalysisActions />;
  if (product.slug === "compatibility") return <CompatibilityActions dialogueId={search?.dialogueId ?? null} inviteToken={search?.invite ?? null} />;
  if (product.slug === "seven-days") return <SevenDaysActions dialogueId={search?.dialogueId ?? null} />;
  if (product.slug === "tarot") {
    return <SymbolicProductActions productKey="tarot" title="Расклад Таро" promptLabel="Вопрос для расклада" placeholder="Например: стоит ли мне сейчас менять работу, если внутри много сомнений?" creditCost={2} />;
  }
  if (product.slug === "natal-chart") {
    return <SymbolicProductActions productKey="natal-chart" title="Натальная карта" promptLabel="Дата, время и место рождения" placeholder="12.04.1992, 14:35, Москва. Вопрос: что сейчас важно понять про работу?" creditCost={2} />;
  }
  if (product.slug === "synastry") return <SynastryActions />;
  if (product.slug === "numerology") {
    return <SymbolicProductActions productKey="numerology" title="Числовой портрет" promptLabel="Имя и дата рождения" placeholder="Анна, 12.04.1992. Хочу понять повторяющийся сценарий в отношениях." creditCost={2} />;
  }
  if (product.slug === "my-map") {
    return <SymbolicProductActions productKey="my-map" title="Расширенная карта" promptLabel="История Моей карты" placeholder="История собирается автоматически из сохранённых вопросов, маршрутов и результатов." creditCost={6} />;
  }
  if (product.slug === "family-scenarios") {
    return <SymbolicProductActions productKey="family-scenarios" title="Семейные сценарии" promptLabel="Что повторяется в вашей семье и роду" placeholder="Например: в семье по женской линии все рано брали ответственность за других и не умели просить помощи. Я ловлю себя на том же." creditCost={4} />;
  }
  if (product.slug === "human-design") {
    return <HumanDesignActions creditCost={product.creditCost ?? 2} />;
  }
  return null;
}

function ProductFooter() {
  return (
    <section className="soft-shell mt-12 pb-20">
      <div className="soft-card-flat soft-product-legal mx-auto max-w-3xl">
        <div className="flex items-center gap-3">
          <LockKeyhole className="size-4 shrink-0 text-[var(--soft-terracotta-dark)]" aria-hidden="true" />
          <span className="font-semibold text-[var(--soft-bordeaux)]">Принцип ETerapy для любого формата</span>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[var(--soft-ink-soft)]">
          Результат носит информационно-рефлексивный характер. Не является медицинской или юридической консультацией. Если вопрос связан с риском для здоровья или безопасности — мы направим к специалисту.
        </p>
      </div>
    </section>
  );
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{ dialogueId?: string; invite?: string }>;
}) {
  const { slug } = await params;
  const search = await searchParams;
  const product = getV5Product(slug);
  if (!product) notFound();

  return (
    <main className="soft-clarity-page soft-product-detail-page" data-testid={`product-page-${product.slug}`}>
      <PublicJsonLd route={product.route as PublicSeoRoute} />
      <ProductHero
        product={product}
        side={productSide(product)}
        action={<ProductActionSurface product={product} search={search} />}
      />
      <ProductFooter />
    </main>
  );
}
